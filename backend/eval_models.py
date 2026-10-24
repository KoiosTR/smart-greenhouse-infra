"""Zaman bazlı (walk-forward) değerlendirme: VPD tahmini + risk kuralı, temel modeller, güven aralıkları, kalibrasyon, alarm.
Çalıştır: docker exec greenhouse_api python eval_models.py

Protokol (sızıntı önlemleri):
- Hedef: t+1..t+6 ortalama VPD; girdi: t'ye kadar 24 saat. Risk = hedef < 0.8 kPa (kural tahmin üzerinde).
- Genişleyen pencereli 5 ardışık test bloğu; eğitim-test arası 30 saat boşluk (pencere + ufuk).
- Ölçekleme/normalizasyon ve sigma yalnızca eğitim kısmından. Hiperparametreler sabit, test üzerinde ayar YOK.
- Güven aralığı: tahminler birleştirilip 7 günlük blok bootstrap (günler korelasyonlu).
"""
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from math import erf, sqrt
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import average_precision_score, brier_score_loss, matthews_corrcoef, precision_score, recall_score

from app.ml.forecast import GAP, HOR, K_ON, OFF, THR, WIN, alarm_series, load, make, tab

FOLDS, BOOT, SEEDS = 5, 400, (0, 1, 2)


class Net(nn.Module):
    def __init__(self, f):
        super().__init__()
        self.conv = nn.Sequential(nn.Conv1d(f, 32, 3, padding=1), nn.ReLU())
        self.lstm = nn.LSTM(32, 32, batch_first=True)
        self.out = nn.Linear(32, 1)

    def forward(self, x):
        h = self.conv(x.transpose(1, 2)).transpose(1, 2)
        return self.out(self.lstm(h)[0][:, -1]).squeeze(-1)


def fit_cnn_lstm(Xtr, ytr, Xte):
    """3 tohumun ortalaması; normalizasyon yalnızca eğitimden."""
    mu, sd = Xtr.reshape(-1, Xtr.shape[2]).mean(0), Xtr.reshape(-1, Xtr.shape[2]).std(0) + 1e-6
    ym, ys = ytr.mean(), ytr.std() + 1e-6
    f = lambda x: torch.tensor((x - mu) / sd, dtype=torch.float32)
    xt, yt, xe = f(Xtr), torch.tensor((ytr - ym) / ys, dtype=torch.float32), f(Xte)
    outs = []
    for s in SEEDS:
        torch.manual_seed(s)
        m = Net(Xtr.shape[2])
        opt = torch.optim.Adam(m.parameters(), 2e-3)
        for _ in range(25):
            perm = torch.randperm(len(xt))
            for b in range(0, len(xt), 128):
                ix = perm[b:b + 128]
                opt.zero_grad()
                nn.functional.mse_loss(m(xt[ix]), yt[ix]).backward()
                opt.step()
        with torch.no_grad():
            outs.append(m(xe).numpy() * ys + ym)
    return np.mean(outs, 0)


def gbm(Xtr, ytr, ttr, Xte, tte):
    m = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, random_state=0).fit(tab(Xtr, ttr), ytr)
    return m.predict(tab(Xte, tte)), m


def metrics(y, p):
    lab, pred = y < THR, p < THR
    ok = lab.any() and (~lab).any()
    return dict(MAE=np.abs(y - p).mean(), PRAUC=average_precision_score(lab, -p) if ok else np.nan,
                prec=precision_score(lab, pred, zero_division=0), rec=recall_score(lab, pred, zero_division=0),
                MCC=matthews_corrcoef(lab, pred) if ok else np.nan)


def ci(y, p, days, keys=("MAE", "PRAUC", "rec", "MCC")):
    """7 günlük blok bootstrap, %95 aralık."""
    rng = np.random.default_rng(0)
    d = np.asarray(days)
    wk = d // 7
    groups = [np.where(wk == w)[0] for w in np.unique(wk)]
    res = {k: [] for k in keys}
    for _ in range(BOOT):
        ix = np.concatenate([groups[i] for i in rng.integers(0, len(groups), len(groups))])
        m = metrics(y[ix], p[ix])
        for k in keys:
            res[k].append(m[k])
    return {k: (np.nanpercentile(v, 2.5), np.nanpercentile(v, 97.5)) for k, v in res.items()}


def runs(flag, times):
    """Saat bitişikliği korunarak ardışık True bloklarının (başlangıç, bitiş) indeksleri."""
    out, s = [], None
    for i in range(len(flag)):
        contiguous = i > 0 and (times[i] - times[i - 1]) == pd.Timedelta(hours=1)
        if flag[i] and (s is None or not contiguous):
            if s is not None:
                out.append((s, i - 1))
            s = i
        elif not flag[i] and s is not None:
            out.append((s, i - 1))
            s = None
        elif flag[i] and s is not None and not contiguous:
            pass
    if s is not None:
        out.append((s, len(flag) - 1))
    return out


def alarm_eval(y, p, times, hysteresis):
    lab = y < THR
    al = alarm_series(p, times) if hysteresis else (p < THR)
    true_eps, al_eps = runs(lab, times), runs(al, times)
    det = sum(any(al[s:e + 1]) for s, e in true_eps)
    false_eps = sum(not any(lab[s:e + 1]) for s, e in al_eps)
    weeks = (times[-1] - times[0]).days / 7
    return dict(episodes=len(true_eps), episode_recall=det / max(len(true_eps), 1), false_alarms_per_week=false_eps / weeks, alarm_blocks=len(al_eps))


def ece(prob_true, prob_pred, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    e, n = 0.0, len(prob_pred)
    for a, b in zip(edges[:-1], edges[1:]):
        m = (prob_pred >= a) & (prob_pred < b if b < 1 else prob_pred <= b)
        if m.any():
            e += m.sum() / n * abs(prob_true[m].mean() - prob_pred[m].mean())
    return e


def main():
    df = load()
    X, y, idx, _ = make(df)
    times = df.index[idx]
    print(f"Saatlik satır: {len(df)} | örnek: {len(y)} | {times[0]:%Y-%m-%d} → {times[-1]:%Y-%m-%d} | risk oranı: {(y < THR).mean():.1%}")

    n = len(y)
    first = int(n * 0.35)
    edges = np.linspace(first, n, FOLDS + 1).astype(int)
    names = ["persistence", "saatlik klimatoloji", "GBM", "CNN-LSTM"]
    P = {k: np.full(n, np.nan) for k in names}
    sig = np.full(n, np.nan)
    for k in range(FOLDS):
        te = np.arange(edges[k], edges[k + 1])
        tr = np.arange(0, edges[k] - GAP)
        hod = pd.Series(y[tr]).groupby(times[tr].hour.values).mean()
        P["persistence"][te] = X[te, -1, 2]
        P["saatlik klimatoloji"][te] = hod.reindex(times[te].hour.values).values
        P["GBM"][te], _ = gbm(X[tr], y[tr], times[tr], X[te], times[te])
        P["CNN-LSTM"][te] = fit_cnn_lstm(X[tr], y[tr], X[te])
        # sigma yalnızca eğitim kısmından: son %15'i doğrulama
        cut = int(len(tr) * 0.85)
        _, mm = gbm(X[tr[:cut - GAP]], y[tr[:cut - GAP]], times[tr[:cut - GAP]], X[te], times[te])
        va = tr[cut:]
        sig[te] = np.std(y[va] - mm.predict(tab(X[va], times[va])))
        print(f"blok {k + 1}/{FOLDS}: test {times[te[0]]:%Y-%m-%d} → {times[te[-1]]:%Y-%m-%d}, eğitim n={len(tr)}")

    te_all = np.arange(edges[0], n)
    yt, tt = y[te_all], times[te_all]
    days = ((tt - tt[0]).total_seconds() // 86400).astype(int).values
    print(f"\nDeğerlendirilen {len(te_all)} örnek | test risk oranı: {(yt < THR).mean():.1%}\n")
    print(f"{'model':22s} {'MAE':>18s} {'PR-AUC':>18s} {'recall':>18s} {'MCC':>18s}  prec")
    for nme in names:
        p = P[nme][te_all]
        m, c = metrics(yt, p), ci(yt, p, days)
        f = lambda k: f"{m[k]:.3f} [{c[k][0]:.3f},{c[k][1]:.3f}]"
        print(f"{nme:22s} {f('MAE'):>18s} {f('PRAUC'):>18s} {f('rec'):>18s} {f('MCC'):>18s}  {m['prec']:.3f}")

    print("\n== Blok bazında (GBM) MAE / PR-AUC ==")
    for k in range(FOLDS):
        s = slice(edges[k] - edges[0], edges[k + 1] - edges[0])
        m = metrics(yt[s], P["GBM"][te_all][s])
        print(f"  blok {k + 1} ({tt[s][0]:%b}–{tt[s][-1]:%b}): MAE={m['MAE']:.3f} PR-AUC={m['PRAUC']:.3f} rec={m['rec']:.3f}")

    print("\n== Kalibrasyon (GBM, olasılık = Φ((0.8-tahmin)/σ)) ==")
    pr = np.array([0.5 * (1 + erf((THR - a) / (s * sqrt(2)))) for a, s in zip(P["GBM"][te_all], sig[te_all])])
    print(f"  Brier={brier_score_loss(yt < THR, pr):.3f} (referans, hep prevalans: {brier_score_loss(yt < THR, np.full(len(yt), (yt < THR).mean())):.3f}) | ECE={ece((yt < THR).astype(float), pr):.3f}")

    print("\n== Olay bazlı alarm (GBM), gerçek risk bloğu = ardışık saatler ==")
    for h, label in ((False, "ham kural"), (True, f"{K_ON} ardışık saat + histerezis")):
        r = alarm_eval(yt, P["GBM"][te_all], tt, h)
        print(f"  {label:32s} olay={r['episodes']} yakalama={r['episode_recall']:.2f} yanlış alarm/hafta={r['false_alarms_per_week']:.2f} alarm bloğu={r['alarm_blocks']}")

    # Şişme gösterimi: aynı model, rastgele bölme
    rng = np.random.default_rng(0).permutation(n)
    c = int(n * 0.8)
    p, _ = gbm(X[rng[:c]], y[rng[:c]], times[rng[:c]], X[rng[c:]], times[rng[c:]])
    m = metrics(y[rng[c:]], p)
    print(f"\nRastgele bölme (hatalı yöntem, yalnız kıyas için): MAE={m['MAE']:.3f} PR-AUC={m['PRAUC']:.3f} recall={m['rec']:.3f}")


if __name__ == "__main__":
    main()
