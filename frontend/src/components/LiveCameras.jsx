import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import './MonitoringCharts.css';

// Verdify'ın herkese açık sera kamerası anlık görüntüleri (kaynakta da 30 sn'de bir yenilenir)
const CAMS = [{ id: 'greenhouse_1', label: 'Kamera 1' }, { id: 'greenhouse_2', label: 'Kamera 2' }];
const SRC = (id) => `https://api.verdify.ai/api/v1/public/cameras/${id}/latest.jpg?h=720&_=${Date.now()}`;

function Cam({ id, label }) {
  const [src, setSrc] = useState(null);
  const [at, setAt] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => {
      const u = SRC(id);
      const img = new Image(); // önce yükle, sonra değiştir: yenilemede titreme olmaz
      img.onload = () => live && (setSrc(u), setAt(new Date()), setErr(false));
      img.onerror = () => live && setErr(true);
      img.src = u;
    };
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, [id]);

  return (
    <div className="mc-cam">
      <div className="mc-cam-frame">
        {src && <motion.img key={src} src={src} alt={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />}
        {!src && <div className="mc-cam-empty">{err ? 'Görüntü alınamadı' : 'Yükleniyor…'}</div>}
        {src && <span className={`mc-cam-badge${err ? ' off' : ''}`}>{err ? '● BAĞLANTI YOK' : '● CANLI'}</span>}
      </div>
      <div className="mc-cam-foot">
        <strong>{label}</strong>
        <span>{at ? `Son güncelleme ${at.toLocaleTimeString()}` : '—'} · 30 sn'de bir yenilenir</span>
      </div>
    </div>
  );
}

export default function LiveCameras() {
  return (
    <section className="mc-wrap">
      <div className="mc-head">
        <div>
          <h3>Canlı Sera Kameraları</h3>
          <p>Kaynak: Verdify herkese açık kamera görüntüleri</p>
        </div>
      </div>
      <div className="mc-cams">
        {CAMS.map(c => <Cam key={c.id} {...c} />)}
      </div>
    </section>
  );
}
