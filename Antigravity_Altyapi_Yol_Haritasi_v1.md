# Antigravity Ekibi: Akıllı Sera Erken Uyarı Sistemi Altyapı Yol Haritası

Bu doküman, IoT Tabanlı Zaman Serisi Verileri ve Mikroservis Mimarisi Kullanarak Seralarda Otonom Hastalık Teşhis ve Erken Uyarı Sisteminin altyapı süreçlerini detaylandırmak üzere hazırlanmıştır. Projenin makine öğrenmesi ve veri bilimi süreçleri ayrı yürütülecek olup, bu yol haritası tamamen sağlam, ölçeklenebilir ve donanımdan bağımsız veri boru hattının (data pipeline) kurulmasına odaklanmaktadır.

---

## 🚀 Faz 1: Geliştirme Ortamı ve Temel İskeletin Kurulumu

Altyapının ilk adımı, tüm takım üyelerinin aynı ortamda sorunsuz çalışabilmesini sağlamaktır. Bu fazda versiyon kontrolü ve konteynerizasyon adımları tamamlanacaktır.

### 1.1 Versiyon Kontrol Sistemi (Git & GitHub)
*   **Repository Kurulumu:** `smart-greenhouse-infra` adında bir GitHub reposu oluşturulacaktır.
*   **Dallanma Stratejisi (Branching Strategy):** 
    *   `main`: Sadece kararlı ve çalışan kodlar.
    *   `dev`: Aktif geliştirme dalı.
    *   Özellik dalları: `feature/kafka-setup`, `feature/fastapi-base` gibi isimlendirmelerle çalışılacaktır.
*   **İş Akışı:** Her geliştirme `pull request (PR)` üzerinden kod incelemesi yapılarak `dev` dalına birleştirilecektir.

### 1.2 Konteynerizasyon (Docker & Docker Compose)
Sistemin mikroservis mimarisine uygun olması için tüm servisler Docker üzerinde izole edilecektir.
*   **Docker Ağı (Network):** Servislerin (Kafka, Veritabanı, Backend) birbiriyle güvenli iletişim kurabilmesi için `greenhouse_network` adında özel bir köprü ağı (bridge network) tanımlanacaktır.
*   **Docker Compose İskeleti:** Projenin kök dizininde bir `docker-compose.yml` dosyası oluşturulacak ve servisler kademeli olarak bu dosyaya eklenecektir.

---

## 📡 Faz 2: Mesajlaşma ve Veri Akış Katmanı

Sensör verilerinin yüksek hızda, asenkron ve veri kaybı yaşanmadan arka uca iletilmesi sistemin can damarıdır. Bu katman MQTT ve Apache Kafka ikilisinden oluşur.

### 2.1 Edge İletişim (MQTT Broker - Mosquitto)
*   **Amaç:** Uç cihazların (veya simülatörün) verileri sisteme hafif bir protokolle iletmesini sağlamak.
*   **Kurulum:** Eclipse Mosquitto imajı Docker Compose dosyasına eklenecektir.
*   **Konfigürasyon:** Anonim erişime kapatılıp kimlik doğrulama (auth) eklenecek ve `sensors/telemetry` topic'i tanımlanacaktır.

### 2.2 Veri Kuyruğu (Apache Kafka & Zookeeper/KRaft)
*   **Amaç:** MQTT'den gelen verileri alıp, FastAPI servisine iletilmek üzere güvenli, hata toleranslı ve yüksek hacimli bir kuyrukta tutmak.
*   **Kurulum:** Bitnami Kafka imajı kullanılarak (Zookeeper veya KRaft modunda) küme (cluster) oluşturulacaktır.
*   **Topic Yapılandırması:** 
    *   `raw-sensor-data`: İşlenmemiş sensör verileri için.
    *   `anomaly-alerts`: Modelden çıkacak uyarılar için.
*   **Kalıcılık (Persistence):** Kafka verilerinin Docker yeniden başlatıldığında kaybolmaması için Volume bağlamaları (Volume mapping) yapılacaktır.

---

## 🗄️ Faz 3: Zaman Serisi Veritabanı (TimescaleDB / PostgreSQL)

Sürekli akan sensör metriklerini saklamak ve geriye dönük (saatlik/günlük) trend analizleri yapabilmek için ilişkisel fakat zaman serilerine optimize edilmiş bir veritabanı kurulacaktır.

### 3.1 Veritabanı Kurulumu
*   **Seçim:** PostgreSQL üzerine inşa edilmiş TimescaleDB kullanılacaktır.
*   **Entegrasyon:** `docker-compose.yml` içerisine eklenecek, ortam değişkenleri (kullanıcı adı, şifre, db adı) tanımlanacaktır.

### 3.2 Şema (Schema) Tasarımı
Sensör verileri için `hypertable` mimarisi oluşturulacaktır. Temel tablo yapısı aşağıdaki gibi olacaktır:
*   `timestamp` (TIMESTAMPTZ - Zorunlu)
*   `sensor_id` (VARCHAR)
*   `temperature` (FLOAT)
*   `humidity` (FLOAT)
*   `co2_ppm` (INTEGER)
*   `vpd` (FLOAT)
*   `dew_point` (FLOAT)
*   `leaf_wetness` (FLOAT)

*Not: TimescaleDB'nin `create_hypertable` fonksiyonu ile `timestamp` sütununa göre veri bölümlendirmesi (partitioning) yapılacaktır.*

---

## ⚙️ Faz 4: Arka Uç Katmanı (FastAPI)

Kafka'daki veriyi okuyan, ileride Makine Öğrenmesi modelini çalıştıracak ve dış dünyaya API sunacak olan sistemin beyin takımıdır.

### 4.1 FastAPI Temel Kurulumu
*   **Bağımlılıklar:** `fastapi`, `uvicorn`, `aiokafka`, `asyncpg` (veritabanı için) kütüphanelerini içeren `requirements.txt` hazırlanacaktır.
*   **Dockerfile:** FastAPI uygulaması için özel bir `Dockerfile` yazılacaktır (Python 3.10+ slim tabanlı).

### 4.2 Kafka Consumer (Tüketici) Entegrasyonu
*   FastAPI ayağa kalktığında arka planda sürekli çalışacak bir Asenkron Görev (Background Task) oluşturulacaktır.
*   Bu görev, Kafka'daki `raw-sensor-data` topic'ini dinleyecek ve gelen JSON verilerini çözümleyecektir (parsing).

### 4.3 Veritabanı Yazma İşlemleri
*   Kafka'dan okunan veri anlık olarak TimescaleDB'ye yazılacaktır.
*   Yazma işlemlerinin darboğaz (bottleneck) yaratmaması için bağlantı havuzlama (Connection Pooling) ve mikro-yığın (Micro-batching) yöntemleri kullanılacaktır.

---

## 🧪 Faz 5: Veri Simülatörü (Mock Producer) Geliştirilmesi

Model ve veri bilimi çalışmaları ayrı yürüdüğü için, altyapının test edilebilmesi adına yapay veri üreten bir bileşene ihtiyaç vardır.

### 5.1 Python Simülatör Betiği
*   Belirli periyotlarla (örneğin saniyede bir) rastgele fakat gerçeğe yakın sera mikroiklim verileri üreten bir script yazılacaktır.
*   **Veri Formatı (JSON Örneği):**
    ```json
    {
      "timestamp": "2027-04-10T14:30:00Z",
      "sensor_id": "GH_ZONE_1",
      "temperature": 24.5,
      "humidity": 68.2,
      "co2_ppm": 850,
      "vpd": 1.2,
      "dew_point": 18.1,
      "leaf_wetness": 0.4
    }
    ```
### 5.2 Broker Entegrasyonu
*   Yazılan bu script, ürettiği JSON verilerini doğrudan kurulan MQTT Broker'ına (Mosquitto) yayınlayacaktır (Publish).

---

## 📊 Faz 6: Uçtan Uca Doğrulama ve Yük Testleri

Tüm bileşenler birleştirildikten sonra altyapının dayanıklılığı ölçülecektir.

1.  **Tam Entegrasyon:** `docker-compose up -d` komutu ile tüm sistem (MQTT, Kafka, TimescaleDB, FastAPI) tek seferde ayağa kaldırılacaktır.
2.  **Veri Akış Kontrolü:** Simülatör çalıştırılacak ve verinin **Simülatör -> MQTT -> Kafka -> FastAPI -> TimescaleDB** rotasını kayıpsız izleyip izlemediği loglar üzerinden kontrol edilecektir.
3.  **Yük Testi:** Simülatörün veri üretme hızı saniyede 1000 mesaja çıkarılarak, FastAPI'nin Kafka'yı okuma hızı ve veritabanına yazma gecikmeleri (latency) gözlemlenecektir. Sorun yaşanırsa, ölçeklendirme adımları uygulanacaktır.

---
**Antigravity Ekibi Görev Dağılım Önerisi:**
*   *Üye 1 & 2:* Docker, MQTT ve Kafka konfigürasyonları.
*   *Üye 3 & 4:* FastAPI backend iskeleti ve TimescaleDB entegrasyonu.
*   *Üye 5:* Veri simülatörünün kodlanması ve entegrasyon testlerinin takibi.
