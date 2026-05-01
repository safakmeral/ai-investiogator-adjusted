# AI Investigator — Proje Dokümantasyonu v4

---

## 1. Projenin Amacı

AI Investigator, polis sorgulama sürecine yapay zeka destekli yardım sağlayan bir mobil uygulamadır. Sistem; şüphelinin verdiği cevapları analiz eder, davranışsal metrikleri takip eder, çelişkileri tespit eder ve bir sonraki hamleyi dinamik olarak üretir.

> **Temel felsefe:** Sistem, AI'ı sadece "soru üretme makinesi" olarak değil, taktiksel sorgu yöneticisi olarak kullanır. Gerçek sorgularda her hamle bir sonraki hamleyi kurar. Sistem bu mantıkla tasarlanmıştır.



---

## 2. Kullanılacak Teknolojiler

| Katman | Teknoloji | Açıklama |
|---|---|---|
| Mobil UI | React Native + Expo | Cross-platform (iOS + Android) |
| Navigasyon | Expo Router | Sayfa yönetimi |
| Form & Validasyon | React Hook Form + Zod | Input doğrulama |
| Local Storage | AsyncStorage | JWT token saklama |
| Ses Kaydı | expo-av | Şüpheli cevap kaydı |
| Fotoğraf | expo-image-picker | Şüpheli fotoğrafı |
| Backend / Veritabanı | Supabase (PostgreSQL) | Tüm veri saklama |
| Dosya Depolama | Supabase Storage | Fotoğraf ve ses dosyaları |
| API Güvenliği | Supabase Edge Functions | API anahtarlarını gizli tutar |
| LLM | Gemini 2.5 Flash | Soru üretimi ve analiz |
| Transkripsiyon | OpenAI Whisper API | Ses → metin dönüşümü |

---

## 3. Supabase Veritabanı Şeması

```sql
-- Polisler
officers
  id              uuid, PK
  badge_id        text, unique
  password_hash   text
  full_name       text
  created_at      timestamp

-- Vakalar
cases
  id                  uuid, PK
  case_code           text, unique        -- örn: A7F2 (random üretilir)
  officer_id          uuid, FK → officers
  suspect_tc          text                -- 11 hane
  suspect_name        text
  suspect_surname     text
  suspect_age         integer             -- max 150
  suspect_gender      text                -- 'erkek' | 'kadın'
  suspect_photo_url   text                -- Supabase Storage URL
  crime_type          text                -- Serbest metin veya seçim: 'cinayet' | 'hırsızlık' | 'dolandırıcılık' | 'diğer'
  initial_statement   text                -- ilk ifade
  crime_scene_notes   text                -- olay yeri kanıtları
  status              text                -- 'open' | 'closed'
  created_at          timestamp

-- Sorgu Seansları
sessions
  id                    uuid, PK
  case_id               uuid, FK → cases
  contradiction_score   float   -- 0-100
  avoidance_score       float   -- 0-100
  stress_score          float   -- 0-100
  inconsistency_score   float   -- 0-100
  current_phase         text    -- 'opening' | 'story_locking' | 'evidence_pressure' | 'confession_approach'
  active_tactic         text    -- o an uygulanan taktik id'si
  strategic_plan        jsonb   -- strateji katmanının ürettiği sonraki hamle planı
  created_at            timestamp

-- Soru-Cevap Mesajları
messages
  id                    uuid, PK
  session_id            uuid, FK → sessions
  sequence_no           integer
  move_type             text    -- 'question' | 'statement' | 'empathy' | 'bluff' | 'silence_prompt'
  tactic_used           text    -- hangi taktik bu hamleyi üretti
  question              text    -- AI'ın hamle içeriği (soru veya cümle)
  answer                text
  answer_audio_url      text    -- Supabase Storage URL
  body_language_input   jsonb   -- seçilen beden dili pilleri
  voice_tone_input      jsonb   -- seçilen ses tonu pilleri
  signal_interpretation jsonb   -- beden dili + ses tonu + cevap birlikte yorumu
  analysis_notes        jsonb   -- AI analizleri (çelişkiler, uyarılar)
  metrics_before        jsonb   -- hamleden önceki metrik snapshot'ı
  metrics_after         jsonb   -- bir sonraki hamleden önce doldurulur (taktik etkinlik hesabı için)
  created_at            timestamp

-- Anket (Sorgu Sonu)
survey_responses
  id              uuid, PK
  session_id      uuid, FK → sessions
  responses       jsonb
  created_at      timestamp

-- Taktik Etkinlik Skoru
tactic_performance
  id           uuid, PK
  tactic_id    text
  score        float    -- hesaplanan etkinlik skoru (-100 ile +100 arası)
  session_id   uuid, FK → sessions
  created_at   timestamp
```

---

## 4. Uygulama Akışı ve Sayfalar

### 4.1 Login Sayfası
- Badge ID ve şifre ile giriş
- JWT token AsyncStorage'a kaydedilir
- Supabase Auth kullanılır

### 4.2 Ana Sayfa (Vaka Listesi)
- Tüm vakalar listelenir: şüpheli fotoğrafı, ad soyad, vaka kodu, açık/kapalı durumu
- Arama çubuğu: vaka kodu veya şüpheli adıyla arama
- Filtre: Tümü / Açık / Kapalı
- Kapalı vakalar da görüntülenebilir (salt okunur)
- Sağ altta FAB butonu: Yeni Vaka

### 4.3 Yeni Vaka / Vaka Formu Sayfası
- Şüpheli fotoğrafı (galeriden yükleme)
- TC Kimlik No (11 hane, sadece rakam)
- Ad, Soyad (sadece harf)
- Yaş (max 150, sayısal)
- Cinsiyet (Erkek / Kadın toggle)
- Suç Türü (serbest metin girişi veya hazır seçeneklerden seçim: Cinayet / Hırsızlık / Dolandırıcılık / Diğer)
- Olay yeri kanıtları (multiline)
- İlk ifade (multiline)
- Zod validasyonu tüm alanlarda
- "Sorguyu Başlat" butonu → Session oluşturulur → Sorgu sayfasına geçilir

### 4.4 Sorgu Sayfası
Detaylar aşağıdaki bölümlerde açıklanmıştır.

### 4.5 Bitirme Modalı
- "Sorguyu Tamamla" → anket sayfasına gider, status: closed
- "Şimdilik Çık" → status: open kalır, ana sayfadan devam edilebilir

### 4.6 Anket Sayfası
- Sorgu sonunda doldurulur
- Sorular: soru kalitesi değerlendirmesi, çelişki tespitinin doğruluğu, genel yardımcılık skoru, şüphelinin gerçekten suçlu olup olmadığı (polis kararı)
- Yanıtlar survey_responses tablosuna kaydedilir

---

## 5. Metrik Sistemi

### 5.1 Metrikler ve Rolleri

Metrikler iki amaçla kullanılır:
1. **Trend analizi** — Sorgu boyunca şüphelinin davranışı nasıl değişti?
2. **Taktik seçici tetikleyicisi** — Hangi taktik kategorisi devreye girsin?

Metrikler tek başına prompta "baskı artır" gibi ham komutlar olarak gitmez. Strateji katmanı bu sayıları yorumlayarak anlamlı taktik kararlarına dönüştürür. (Bkz. Bölüm 7)

#### Çelişki Skoru (contradiction_score)
- **Ne ölçer:** Şüphelinin önceki cevaplarıyla (ilk ifadesi dahil) yeni cevabı arasındaki doğrudan zıtlıklar.
- **Kim hesaplar:** Analiz Katmanı (ayrı API çağrısı).
- **Örnek:** "O gece evdeydim" → sonra "Kapısına gittim ama açmadı" → çelişki.
- **Başlangıç:** 0
- **Taktik etkisi:** Yükseldikçe `withholding_evidence` veya `assumptive_approach` taktiklerine geçiş tetiklenir.

#### Kaçınma Skoru (avoidance_score)
- **Ne ölçer:** Soruyu yanıtlamak yerine konu değiştirme, soruyu soruyla cevaplama, "bilmiyorum / hatırlamıyorum" kalıplarının aşırı kullanımı.
- **Kim hesaplar:** Analiz Katmanı (ayrı API çağrısı).
- **Başlangıç:** 0
- **Taktik etkisi:** Yükseldikçe `cognitive_overload` veya `story_locking` taktikleri tetiklenir.

#### Stres Skoru (stress_score)
- **Ne ölçer:** Şüphelinin anlık davranışsal anomali seviyesi. Beden dili ve ses tonu sinyalleri suçlulukla doğrudan korelasyon iddiası taşımaz; polisin gözlemlediği davranışsal değişimleri yapılandırılmış biçimde sayısallaştırır.
- **Kim hesaplar:** Karma — hem polis girdisi (beden dili + ses tonu butonları) hem Analiz Katmanı'nın ai_stress çıktısı.
- **Başlangıç:** 0
- **Ağırlık notu:** Polis/AI ağırlık oranı başlangıçta 0.5/0.5 olarak ayarlanmıştır (nötr başlangıç noktası). Bu oran taktik etkinlik mekanizmasıyla zaman içinde kalibre edilir (Bkz. Bölüm 5.7).
- **Taktik etkisi:** Yüksek stres + doğru faz → `exploitation` veya `tactical_break`. Yüksek stres + savunmacı pozisyon → `empathy_switch`.

#### Tutarsızlık Skoru (inconsistency_score)
- **Ne ölçer:** Çelişkiden farklı olarak daha ince uyumsuzluklar. Tarih, saat, yer bilgilerindeki küçük kaymalar.
- **Kim hesaplar:** Analiz Katmanı (ayrı API çağrısı).
- **Başlangıç:** 0
- **Taktik etkisi:** Yükseldikçe `detail_trap` veya `funnel_technique` taktikleri tetiklenir.

---

### 5.2 Metrik Hesaplama Formülleri

Her yeni cevap işlendiğinde aşağıdaki formüller çalışır:

#### Çelişki Skoru Güncelleme
```
yeni_skor = (önceki_skor × 0.75) + (çelişki_ağırlığı × 0.25)

çelişki_ağırlığı (Analiz Katmanı'ndan gelir):
  - Doğrudan zıt ifade tespit edildi  → 1.0
  - Kısmi tutarsızlık                 → 0.5
  - Şüpheli ama kesin değil           → 0.2
  - Tespit yok                        → 0.0

Maksimum: 100
```

#### Kaçınma Skoru Güncelleme
```
yeni_skor = (önceki_skor × 0.80) + (kaçınma_ağırlığı × 0.20)

kaçınma_ağırlığı (Analiz Katmanı'ndan gelir):
  - Soruyu tamamen yanıtsız bıraktı   → 1.0
  - Konu değiştirdi                   → 0.8
  - Soruyu soruyla cevapladı          → 0.7
  - "Bilmiyorum" kullandı             → 0.5
  - Normal yanıt                      → 0.0

Maksimum: 100
```

#### Stres Skoru Güncelleme
```
polis_stres = max(seçilen_ağırlıklar) × 0.6 + ortalama(seçilen_ağırlıklar) × 0.4
              (normalize edilmiş, tavan: 1.0)
ai_stres    = Analiz Katmanı'nın döndürdüğü ai_stress_score (0-1 arası)

ham_stres   = (polis_stres × police_weight) + (ai_stres × ai_weight)
yeni_skor   = (önceki_skor × 0.70) + (ham_stres × 0.30)

Başlangıç ağırlıkları: police_weight = 0.5, ai_weight = 0.5
Ağırlıklar taktik etkinlik mekanizmasıyla dinamik olarak güncellenir (Bkz. Bölüm 5.7)

Maksimum: 100
```

#### Tutarsızlık Skoru Güncelleme
```
yeni_skor = (önceki_skor × 0.80) + (tutarsızlık_ağırlığı × 0.20)

tutarsızlık_ağırlığı (Analiz Katmanı'ndan gelir):
  - Zaman/tarih çelişkisi             → 0.8
  - Yer bilgisi çelişkisi             → 0.7
  - Kişi adı veya detay kayması       → 0.5
  - Hafif ton değişimi                → 0.2
  - Tutarlı                           → 0.0

Maksimum: 100
```

---

### 5.3 Beden Dili Butonları ve Stres Ağırlıkları

> **Not:** Bu ağırlıklar yalan tespiti iddiası taşımaz. Sistem, polisin gözlemlediği davranışsal değişimleri sayısallaştırarak sorgu taktik kararlarını yapılandırmaya yardımcı olur. Bireysel sinyallerin suçlulukla korelasyonu iddia edilmemektedir.

| Buton | Stres Ağırlığı | Psikolojik Gerekçe |
|---|---|---|
| Dudak ısırma | 0.8 | Kaygı ve gerginlik belirtisi |
| Yüze / ağza el götürme | 0.9 | Bilinçdışı engelleme refleksi |
| Göz kaçırma | 0.6 | Rahatsızlık, kaçınma |
| Gözleri sık kırpma | 0.8 | Yüksek kaygı |
| Çeneyi / dişleri sıkma | 0.7 | Öfke, gerilim |
| Kolları kavuşturma | 0.5 | Savunmacı pozisyon |
| Öne eğilme | 0.6 | Saldırgan savunma |
| Arkasına yaslanma | 0.4 | Mesafe koyma |
| Kıpırdanma | 0.7 | Kaygı, sabırsızlık |
| Eller masada sabit | -0.3 | Kontrollü sakinlik (düşürür) |
| Titreme | 0.9 | Çok yüksek stres |

### 5.4 Ses Tonu Butonları ve Stres Ağırlıkları

| Buton | Stres Ağırlığı | Psikolojik Gerekçe |
|---|---|---|
| Normal | 0.0 | Stres yok |
| Sinirlendi | 0.7 | Savunmacı tepki |
| Ani sakinleşti | 0.6 | Kontrol altına alma çabası (şüpheli) |
| Duygusallaştı / ağladı | 0.5 | Duygusal yük |
| Sesi titredi | 0.8 | Yüksek stres |
| Sesi yükseldi | 0.7 | Savunmacı, saldırgan |
| Fısıldadı / sesi kısıldı | 0.6 | İçe çekilme |
| Cevap vermekte zorlandı | 0.7 | Kaçınma + stres |

### 5.5 Yüksek Stres Kombinasyon Tespiti

Aşağıdaki kombinasyonlar tespit edildiğinde sinyal yorumlama katmanına "kırılma noktası" bayrağı gönderilir:

- Dudak ısırma + Sesi yükseldi + Kıpırdanma
- Yüze el götürme + Sesi titredi
- Gözleri sık kırpma + Titreme
- Herhangi 3 veya daha fazla yüksek ağırlıklı (≥0.7) beden dili / ses tonu seçimi

---

### 5.6 Sinyal Yorumlama Katmanı

**Temel prensip:** Beden dili ve ses tonu sinyalleri, sayısal değerlere dönüştürülmeden önce anlamsal olarak yorumlanır. Prompta sadece sayı gitmez — o sayının o anda ne anlama geldiği gider.

Sinyal yorumlama, Edge Function içinde Gemini'ye gönderilmeden önce çalışır. Her beden dili + ses tonu kombinasyonunun bir anlam haritası vardır:

```javascript
const signalMeaningMap = {
  "dudak_ısırma+sesi_titredi": {
    meaning: "Yüksek korku + bilgi gizleme refleksi. Şüpheli bu spesifik noktada kırılıyor.",
    tactical_implication: "Bu cevabın üzerine git. Şüpheli bu konuda savunmasız.",
    suggested_tactic: "exploit_weakness"
  },
  "ani_sakinleşti+eller_masada_sabit": {
    meaning: "Kontrollü yanıltma. Şüpheli duygularını bastırıyor, hikaye önceden hazırlanmış.",
    tactical_implication: "Sakinlik gerçek değil. Detay tuzağı kur, hazırlanmadığı noktalara gir.",
    suggested_tactic: "detail_trap"
  },
  "kolları_kavuşturdu+göz_kaçırma": {
    meaning: "Savunmaya çekildi. Doğrudan baskı şu an işe yaramaz, duvar örüyor.",
    tactical_implication: "Baskıyı bırak. Empati köprüsü kur, güven oluştur.",
    suggested_tactic: "empathy_switch"
  },
  "duygusallaştı+sesi_titredi": {
    meaning: "Duygusal kırılma. Vicdan azabı veya korku yüzeye çıkıyor.",
    tactical_implication: "Suçlamayı bırak. Şüphelinin insani tarafına git, itirafı kolaylaştır.",
    suggested_tactic: "minimization"
  },
  "sinirlendi+sesi_yükseldi": {
    meaning: "Savunmacı saldırı. Köşeye sıkıştığını hissediyor, kontrol kaybediyor.",
    tactical_implication: "Sakin kal, baskıyı düşür. Öfke geçince boşluktan gir.",
    suggested_tactic: "tactical_break"
  }
}
```

Kombinasyon haritada yoksa bireysel sinyaller ayrı ayrı yorumlanır ve birleştirilir.

**Yorumlanan sinyal bloğu** şu formatta prompta eklenir:

```
[SİNYAL ANALİZİ — bu cevaba özgü]

Şüpheli şu cevabı verirken bu sinyaller gözlemlendi:
Cevap: "{answer_text}"
Gözlemlenen sinyaller: dudak ısırma, sesi titredi
Kombinasyon anlamı: Yüksek korku + bilgi gizleme refleksi. Şüpheli bu spesifik noktada kırılıyor.
Taktik yönlendirme: Bu cevabın üzerine git — exploit_weakness
```

---

### 5.7 Taktik Etkinlik ve Adaptif Ağırlık Mekanizması

Her hamle kaydedilirken o anki metrikler `metrics_before` olarak snapshot'lanır. Bir sonraki hamle üretilmeden önce `metrics_after` doldurulur ve taktik etkinlik skoru hesaplanır.

#### Taktik Hedef Metrikleri

Her taktik farklı bir metriği hedefler. Etkinlik, hedef metriğin beklenen yönde değişip değişmediğine göre ölçülür:

```javascript
const tacticTargetMetrics = {
  'story_locking':        { metrics: ['inconsistency_score', 'contradiction_score'], direction: 'up' },
  'minimization':         { metrics: ['stress_score'],           direction: 'down' },
  'cognitive_overload':   { metrics: ['inconsistency_score'],    direction: 'up' },
  'tactical_break':       { metrics: ['stress_score'],           direction: 'down' },
  'withholding_evidence': { metrics: ['contradiction_score'],    direction: 'up' },
  'columbo_method':       { metrics: ['avoidance_score'],        direction: 'down' },
  'implied_omniscience':  { metrics: ['avoidance_score', 'contradiction_score'], direction: 'up' },
  'empathy_switch':       { metrics: ['stress_score'],           direction: 'down' },
}
```

#### Etkinlik Skoru Hesabı

```javascript
function calculateTacticScore(before, after, tactic_id) {
  const target = tacticTargetMetrics[tactic_id];
  if (!target) return null;

  let totalDelta = 0;
  target.metrics.forEach(metric => {
    const delta = after[metric] - before[metric];
    const directionMultiplier = target.direction === 'down' ? -1 : 1;
    totalDelta += delta * directionMultiplier;
  });

  // -100 ile +100 arasında normalize et
  return Math.max(-100, Math.min(100, totalDelta / target.metrics.length));
}
```

Bu skor `tactic_performance` tablosuna kaydedilir.

> **Önemli not:** Taktik etkinlik skoru metrik değişiminin korelasyonuna dayanır; nedensellik iddia edilmez. Sistem bu skoru kaba bir sinyal olarak kullanır. Metrik değişiminin tek nedeni uygulanan taktik olmayabilir.

#### Adaptif Stres Ağırlığı

Son 20 taktik performansına bakılarak AI/polis ağırlıkları dinamik olarak güncellenir:

```javascript
async function getAdaptiveWeights() {
  const recent = await supabase
    .from('tactic_performance')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const avgScore = recent.data.reduce((a, b) => a + b.score, 0) / recent.data.length;

  // AI tahminleri tutarlı şekilde doğruysa AI ağırlığı artar
  const ai_weight = avgScore > 10
    ? Math.min(0.7, 0.5 + avgScore / 200)
    : 0.5;

  return { ai: ai_weight, police: 1 - ai_weight };
}
```

---

## 6. Sorgu Sayfası Detayları

### 6.1 Sayfa Yapısı (Yukarıdan Aşağıya)

1. **Header:** Çık butonu (sol) | Şüpheli adı (orta) | BİTİR butonu (sağ, kırmızı border)
2. **Metrik kartları:** Yatay scroll, 4 kart (Çelişki, Kaçınma, Stres, Tutarsızlık). Her kartta sayı (monospace), progress bar (renk: 0-33 yeşil / 34-66 sarı / 67-100 kırmızı)
3. **Beden dili pill butonları:** Çoklu seçim, kırmızı aktif renk (uyarı)
4. **Ses tonu pill butonları:** Çoklu seçim, kırmızı aktif renk (uyarı)
5. **Chat alanı:** Mesaj baloncukları (AI hamlesi sol, şüpheli cevap sağ, analiz bildirimleri tam genişlik)
6. **Alt bar:** Ses kayıt butonu (sol, pulse animasyonu) + SORU ÜRET butonu (sağ, kayıt tamamlanmadan disabled)

### 6.2 Chat Balonu Tipleri

- **AI hamlesi:** Sol hizalı, koyu yüzey, mavi label. Soru, empati cümlesi veya yönlendirme olabilir.
- **Şüpheli cevabı:** Sağ hizalı, daha koyu yüzey, gri label
- **Çelişki bildirimi:** Tam genişlik, kırmızı border, kırmızı "ÇELİŞKİ TESPİT EDİLDİ" label
- **Stres uyarısı:** Tam genişlik, sarı/turuncu border, "YÜKSEK STRES SİNYALİ" label
- **Genel analiz:** Tam genişlik, sarı border, "ANALİZ" label

Bir hamle üretilmeden önce birden fazla bildirim çıkabilir. Sıralama:
1. Çelişki bildirimleri (varsa, her biri ayrı balon)
2. Tutarsızlık bildirimleri (varsa)
3. Stres uyarısı (kombinasyon tespit edildiyse)
4. AI hamlesi

---

## 7. Üç Katmanlı Prompt Mimarisi

### 7.1 Genel Yaklaşım

Sistem üç farklı AI çağrısıyla çalışır:

- **Analiz Katmanı:** Her "SORU ÜRET" tıklamasında, hamle üretiminden önce çalışır. Şüphelinin son cevabını tüm geçmişle karşılaştırır; çelişki, kaçınma, tutarsızlık ağırlıklarını ve stres skorunu sayısal olarak döndürür. Hamle üretmez, yorum yapmaz — sadece ölçer.
- **Strateji Katmanı:** Her 3-4 soruda bir veya kritik bir sinyal geldiğinde çalışır. Nerede olunduğunu, nereye gidilmesi gerektiğini ve sıradaki 2-3 hamlenin ne olması gerektiğini belirler. Çıktısı `strategic_plan` olarak sessions tablosuna kaydedilir.
- **Hamle Katmanı:** Her "SORU ÜRET" tıklamasında çalışır. Strateji katmanının planına bakarak o anki tek hamleyi üretir.

Fine-tuning yapılmaz. Her API çağrısında Gemini 2.5 Flash'a tam bağlamlı, dinamik bir prompt gönderilir. RAG mantığıyla çalışır: veritabanından alınan tüm geçmiş ve metrikler her çağrıda modele iletilir.

#### JSON Fallback Mekanizması

Tüm Gemini çağrıları fallback katmanına sarılır. Model bazen geçersiz JSON, markdown fence veya preamble üretebilir. Bu durumda sistem 3 kez retry yapar, hâlâ başarısız olursa katmana özel güvenli bir fallback değer döner. Kullanıcıya hata gösterilmez.

```javascript
async function callGeminiWithFallback(prompt, fallbackValue, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const raw = await callGemini(prompt);

    // Markdown fence temizle
    const cleaned = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      if (i === retries - 1) return fallbackValue;
      prompt += "\n\nÖNCEKİ YANIT GEÇERSİZ JSON İÇERİYORDU. YALNIZCA JSON ÜRET.";
    }
  }
}

// Katmana özel fallback değerler
const FALLBACKS = {
  analysis: {
    contradiction_weight: 0.0,
    contradiction_detail: null,
    avoidance_weight: 0.0,
    avoidance_type: null,
    inconsistency_weight: 0.0,
    inconsistency_detail: null,
    ai_stress_score: 0.0
  },
  strategy: {
    phase_assessment: "Analiz edilemedi",
    next_phase: null,           // mevcut fazda kal
    strategic_goal: "Sorguya devam et",
    planned_moves: [{ tactic: "funnel_technique", intent: "Genel devam" }],
    avoid: null
  },
  move: {
    analysis: { contradictions: [], stress_interpretation: "", strategic_note: "" },
    move: {
      tactic_used: "columbo_method",
      tactic_step: "Genel soru",
      move_type: "question",
      content: "Biraz daha açar mısın?"
    },
    phase_update: null
  }
}
```

---

### 7.2 Taktik Kataloğu

Sistem, gerçek sorgu vakalarından çıkarılmış 14 taktikle çalışır. Her taktik ne zaman kullanılacağını, nasıl uygulanacağını ve hangi taktiğe geçiş yapabileceğini bilir.

```json
[
  {
    "id": "illusion_of_freedom",
    "name": "Özgürlük Yanılsaması",
    "description": "Şüpheliye tutuklu olmadığını, istediği zaman gidebileceğini söyle. Savunma mekanizmasını indirir, iş birliği yapmaya gönüllü hale getirir.",
    "when_to_use": "Sorgunun açılışında, şüpheli gergin veya savunmacıysa",
    "trigger_conditions": { "phase": "opening", "stress_score": ">40" },
    "move_type": "statement",
    "example_lines": [
      "Burada olmak zorunda değilsin, istediğin an gidebilirsin.",
      "Seninle sadece konuşmak istiyorum, bu resmi bir şey değil."
    ],
    "goal": "Şüpheliyi rahatlatmak, gardını indirmek",
    "transition_to": "story_locking veya funnel_technique"
  },
  {
    "id": "story_locking",
    "name": "Hikayeye Sabitleme",
    "description": "Şüpheliyi mekansal ve görsel detaylara boğ. Anlattığı hikayeyi değiştiremeyeceği hale getir.",
    "when_to_use": "Şüpheli genel bir hikaye anlattı, detaylardan kaçınıyor",
    "trigger_conditions": { "avoidance_score": ">40", "phase": "early|mid" },
    "move_sequence": [
      "Mekansal detay sor: Tam olarak neredeydin?",
      "Görsel detay sor: Etrafında ne vardı, ne görüyordun?",
      "Kronoloji sor: Önce ne oldu, sonra ne yaptın?",
      "Özetle ve onayla: Yani şunu mu söylüyorsun... (şüpheliye kendi ağzından tekrarlat)"
    ],
    "goal": "Şüpheliyi değiştiremeyeceği bir hikayeye hapsetmek",
    "transition_to": "withholding_evidence veya cognitive_overload"
  },
  {
    "id": "withholding_evidence",
    "name": "Delilleri Kademeli Sunma",
    "description": "Elindeki delilleri başta açıklama. Şüphelinin yalanlarına iyice batmasını bekle, sonra tüm çıkış yollarını kapatarak sun.",
    "when_to_use": "Şüpheli net bir yalan söyledi ve contradiction_score yükseldi",
    "trigger_conditions": { "contradiction_score": ">50" },
    "move_type": "statement+question",
    "example_lines": [
      "O bölgede bisiklet izi bulduk.",
      "DNA analizi tamamlandı.",
      "Bir tanık o saatte seni gördüğünü söylüyor."
    ],
    "goal": "Şüpheliyi yalanlarına gömdükten sonra köşeye sıkıştırmak",
    "transition_to": "face_saving_exit veya assumptive_approach"
  },
  {
    "id": "minimization",
    "name": "Minimizasyon / İyi-Kötü Seçenek",
    "description": "Suçu küçült ve şüpheliye ahlaki olarak kabul edilebilir bir çerçeve sun.",
    "when_to_use": "Şüpheli duygusallaştı veya vicdan azabı belirtileri var",
    "trigger_conditions": { "stress_score": ">60", "signal": "duygusallaştı|sesi_titredi" },
    "move_type": "statement",
    "example_lines": [
      "Sen kötü biri değilsin. Zor bir durumda ne yapacağını şaşırdın.",
      "Çocuğunu korumak istiyordun, bunu anlıyorum.",
      "Bu bir kaza olmuş olabilir. Bana anlat, ne oldu gerçekten?"
    ],
    "goal": "İtirafı ahlaki açıdan kabul edilebilir hissettirerek kolaylaştırmak",
    "transition_to": "assumptive_approach veya kinesthetic_reenactment"
  },
  {
    "id": "feigned_sympathy",
    "name": "Sahte Empati ve Ayna Tutma",
    "description": "Tamamen şüphelinin tarafındaymış gibi davran. Kurbanı kötülemesine katıl, sahte dostluk oluştur.",
    "when_to_use": "Şüpheli kurbanı suçluyor veya haklılaştırma çabasındaysa",
    "trigger_conditions": { "signal": "duygusallaştı", "phase": "mid|late" },
    "move_type": "statement",
    "example_lines": [
      "Senin yaşadıklarını duyunca gerçekten üzüldüm.",
      "Sana yapılanlar gerçekten haksızlık.",
      "Ben de senin yerinde olsam ne yapacağımı bilemezdim."
    ],
    "goal": "Şüphelinin gardını tamamen indirmek, güven ilişkisi oluşturmak",
    "transition_to": "assumptive_approach"
  },
  {
    "id": "assumptive_approach",
    "name": "Suçluluğu Varsayma",
    "description": "Şüpheliye 'Bunu sen mi yaptın?' diye sorma. Odağı 'Kim yaptı?' dan 'Neden yapmak zorunda kaldın?' a kaydır.",
    "when_to_use": "İtiraf aşamasına yaklaşıldığında, contradiction_score yüksek",
    "trigger_conditions": { "contradiction_score": ">70", "phase": "late" },
    "move_type": "question",
    "example_lines": [
      "Bana sadece o gece ne yapmak zorunda kaldığını anlat.",
      "İkimiz de ne olduğunu biliyoruz. Sana sadece neden olduğunu sormak istiyorum.",
      "Oraya neden gittiğini anlat bana."
    ],
    "goal": "Şüpheliye 'Hayır' deme şansı vermeden itirafı almak",
    "transition_to": "kinesthetic_reenactment"
  },
  {
    "id": "tactical_break",
    "name": "Stratejik Mola",
    "description": "Şüpheli kırılma noktasına geldiğinde baskıyı artırma. Mola ver, şüpheliyi vicdan azabıyla baş başa bırak.",
    "when_to_use": "Şüpheli ağlıyor, çöküyor veya avukat talep eşiğine geliyor",
    "trigger_conditions": { "stress_score": ">80", "signal": "duygusallaştı|titreme" },
    "move_type": "statement",
    "example_lines": [
      "Biraz su içelim, dinlen.",
      "Anlıyorum, bu zor. Bir mola verelim."
    ],
    "goal": "Şüphelinin tamamen kapanmasını önlemek, kendi kendine kırılmasını sağlamak",
    "transition_to": "feigned_sympathy veya minimization"
  },
  {
    "id": "implied_omniscience",
    "name": "Her Şeyi Biliyormuş İzlenimi",
    "description": "Polisin aslında her şeyi çözdüğü, sadece boşlukları doldurduğu illüzyonunu yarat.",
    "when_to_use": "Şüpheli ısrarla inkar ediyor ama delil baskısı yüksek",
    "trigger_conditions": { "contradiction_score": ">60", "avoidance_score": ">50" },
    "move_type": "statement",
    "example_lines": [
      "Senin bildiğini benim bildiğimi, yakında sen de anlayacaksın.",
      "Bana anlat, yoksa başkalarından duyacaksın.",
      "Zaten çok şey biliyoruz. Sana şans tanımak istiyorum."
    ],
    "goal": "Şüpheliyi direncin anlamsız olduğuna inandırmak",
    "transition_to": "withholding_evidence"
  },
  {
    "id": "columbo_method",
    "name": "Aptala Yatma (Columbo Metodu)",
    "description": "Bilerek yetersiz veya kafası karışmış gibi davran. Şüpheli kendini daha zeki hissedip açıklamak için daha fazla detay verir.",
    "when_to_use": "Şüpheli kendinden emin, kontrollü ve az konuşuyor",
    "trigger_conditions": { "avoidance_score": ">30", "stress_score": "<40" },
    "move_type": "question",
    "example_lines": [
      "Ben görsel bir insanım, tam anlayamadım. Bir daha anlatır mısın?",
      "Kafam karıştı, yani saat kaçtı tam olarak?",
      "Özür dilerim, şunu sormayı unuttum..."
    ],
    "goal": "Şüpheliyi daha fazla konuşturmak, hata yapma payını artırmak",
    "transition_to": "story_locking veya cognitive_overload"
  },
  {
    "id": "cognitive_overload",
    "name": "Bilişsel Aşırı Yükleme",
    "description": "Birbiriyle alakasız gibi görünen küçük detayları art arda ve hızla sor.",
    "when_to_use": "Şüpheli hikayeye kilitlendi ama tutarsızlık skoru artıyor",
    "trigger_conditions": { "inconsistency_score": ">40", "phase": "mid" },
    "move_type": "rapid_question_sequence",
    "example_lines": [
      "Arabanın rengi neydi?",
      "Tam olarak kaçıncı katta oturuyordu?",
      "O gün ne giyinmiştin?",
      "Hava nasıldı, yağmur var mıydı?"
    ],
    "goal": "Zihinsel yorgunlukla tutarsızlıkları yüzeye çıkarmak",
    "transition_to": "withholding_evidence"
  },
  {
    "id": "face_saving_exit",
    "name": "Yüz Kurtarıcı Çıkış",
    "description": "Şüpheliyi köşeye sıkıştırdıktan sonra büyük yalanı kabul etmeden küçük bir gerçeği itiraf edebileceği masumane bir bahane sun.",
    "when_to_use": "Delil sunuldu, şüpheli çıkış yolu arıyor",
    "trigger_conditions": { "contradiction_score": ">70", "signal": "ani_sakinleşti" },
    "move_type": "statement",
    "example_lines": [
      "Orada olman yanlış bir şey yaptığın anlamına gelmiyor.",
      "Belki o gece oradaydın ama bu bir kaza olmuş olabilir.",
      "Sadece orada olduğunu söylesen yeter."
    ],
    "goal": "'Oraya hiç gitmedim' yalanından 'Oradaydım ama...' ya geçişi sağlamak",
    "transition_to": "assumptive_approach"
  },
  {
    "id": "target_derogation",
    "name": "Kurbanı Kötülemeye Çanak Tutma",
    "description": "Suçlu vicdan azabını hafifletmek için kurbanı 'bunu hak eden' biri olarak göstermeye çalışır. Bunu durdurma, aksine onayla.",
    "when_to_use": "Şüpheli kurbanı suçlamaya başladığında",
    "trigger_conditions": { "phase": "mid|late", "signal": "duygusallaştı" },
    "move_type": "statement",
    "example_lines": [
      "Anlıyorum, sana çok şey yaptı.",
      "Çocuğuna da kötü davranıyormuş, duymak çok zor.",
      "Sen gerçekten çok şeye katlandın."
    ],
    "goal": "Şüphelinin 'haklı bir iş yaptığı' hissini körükleyerek itirafı hızlandırmak",
    "transition_to": "minimization veya assumptive_approach"
  },
  {
    "id": "funnel_technique",
    "name": "Huni Tekniği",
    "description": "Sorguya rahatlatıcı, genel ve zararsız sorularla başla. Şüpheli gevşeyip sohbet moduna geçince aniden spesifik ve kritik sorulara in.",
    "when_to_use": "Sorgunun başında veya şüpheli yeni bir konuya geçtiğinde",
    "trigger_conditions": { "phase": "opening|mid", "stress_score": "<50" },
    "move_sequence": [
      "Genel ve rahatlatıcı aç: 'O gün nasıl geçti?' veya felsefi bir soru",
      "Şüpheli gevşeyince spesifike in: 'O saatte tam olarak neredeydin?'",
      "Kritik noktaya in: 'O evden çıktığını gören biri var.'"
    ],
    "goal": "Şüpheliyi hazırlıksız yakalamak",
    "transition_to": "story_locking veya withholding_evidence"
  },
  {
    "id": "kinesthetic_reenactment",
    "name": "Fiziksel Canlandırma",
    "description": "İtiraf geldikten sonra şüpheliden olayı fiziksel olarak canlandırmasını iste.",
    "when_to_use": "İtiraf alındıktan sonra",
    "trigger_conditions": { "phase": "confession" },
    "move_type": "statement+question",
    "example_lines": [
      "Biliyorum bu zor, ama ayağa kalkıp tam olarak nerede durduğunu gösterir misin?",
      "Bana adım adım ne yaptığını göster."
    ],
    "goal": "İtirafı fiziksel kanıtla pekiştirmek, geri dönüşü kapatmak",
    "transition_to": null
  }
]
```

---

### 7.3 Few-Shot Örnekler (Gerçek Vakalardan)

```json
[
  {
    "moment": "Şüpheli net bir yalanla ilk kez köşeye sıkıştırıldı",
    "detective_move": "withholding_evidence",
    "context": "Şüpheli birden fazla kez o bölgeye hiç gitmediğini söylemişti",
    "principle": "Delili erken açıklama. Şüpheliyi önce yalanlarına göm, tüm çıkış yolları kapandığında sun.",
    "why_it_worked": "Şüpheli yalanlarına iyice battıktan sonra tüm çıkış yolları tek hamlede kapandı",
    "suspect_response": "Sessiz kaldı, ardından hikayeyi değiştirmeye çalıştı",
    "lesson": "Delili erkenden açıklama. Şüpheliyi yalanla derin göm, sonra sun."
  },
  {
    "moment": "Şüpheli suçunu ahlaki olarak kabul edilebilir çerçevede itiraf etti",
    "detective_move": "minimization",
    "context": "Şüpheli kurbanı sürekli kötülüyordu, duygusallaşmıştı",
    "principle": "Suçu küçült, ahlaki kaçış yolu aç. Şüpheli kendini 'kötü adam' olarak görmek istemez — bu çerçeveyi kır.",
    "why_it_worked": "Şüpheli iğrenç bir eylem değil, ailesi için fedakarlık yaptığını düşünerek itiraf etti",
    "suspect_response": "Ağladı, ardından olay anını anlatmaya başladı",
    "lesson": "Suçu küçült, şüpheliye ahlaki kaçış yolu aç. İtiraf kendiliğinden gelir."
  },
  {
    "moment": "Şüpheli spesifik detaylar vererek o geceye sabitlendi",
    "detective_move": "story_locking",
    "context": "Şüpheli genel ifadeler veriyordu, detaylardan kaçınıyordu",
    "principle": "Şüpheliyi değiştiremeyeceği spesifik detaylara sabitle. Detay ne kadar somutsa yalan söyleyen zihin o kadar yorulur.",
    "why_it_worked": "Fiziksel detayları anlattıktan sonra hikayesini değiştirmesi imkansız hale geldi",
    "suspect_response": "Detayları anlattı. Sonra çelişkiye düştüğünde 'hayır öyle demedim' diyemedi.",
    "lesson": "Detay ne kadar spesifikse, yalan söyleyen zihin o kadar çok yorulur ve tutarsızlaşır."
  },
  {
    "moment": "Şüpheli kırılma noktasına geldi, ağlamaya başladı",
    "detective_move": "tactical_break",
    "context": "Şüpheli duygusal çöküş yaşıyordu, avukat talep eşiğine geliyordu",
    "principle": "Kırılma anında baskı artırma. Mola ver, şüpheli vicdan azabıyla baş başa kalınca kendi kendini kırar.",
    "why_it_worked": "Fazla baskı şüpheliyi kapatırdı. Mola, şüpheliyi vicdan azabıyla baş başa bıraktı.",
    "suspect_response": "Moladan sonra konuşmaya hazır hale geldi",
    "lesson": "Kırılma anında baskı artırma. Mola ver, şüpheli kendi kendini kırar."
  },
  {
    "moment": "Şüpheli polisin her şeyi bildiği hissine kapıldı",
    "detective_move": "implied_omniscience",
    "context": "Şüpheli direniyor ama delil baskısı artıyordu",
    "principle": "Polisin her şeyi bildiği, direncin anlamsız olduğu hissini yarat. Gerçekte ne bildiğin değil, ne bildiğini düşündürdüğün önemli.",
    "why_it_worked": "Şüpheli polisin her şeyi çözdüğünü, direncin anlamsız olduğunu düşünmeye başladı",
    "suspect_response": "Savunmacı cevapları azaldı, hikayede küçük gedikler açmaya başladı",
    "lesson": "Gerçekte ne bildiğin değil, ne bildiğini düşündürdüğün önemli."
  }
]
```

---

### 7.4 Sorgu Fazları

| Faz | Tetikleyici | Ağırlıklı Taktikler |
|---|---|---|
| `opening` | Sorgunun başlangıcı | illusion_of_freedom, funnel_technique |
| `story_locking` | İlk 3-5 soru sonrası | story_locking, columbo_method |
| `evidence_pressure` | contradiction_score > 50 | withholding_evidence, cognitive_overload, implied_omniscience |
| `confession_approach` | contradiction_score > 70 veya duygusal kırılma | minimization, feigned_sympathy, assumptive_approach, face_saving_exit, kinesthetic_reenactment |

---

### 7.5 Strateji Katmanı Tetikleyici Mantığı

"Her 3-4 soruda bir veya kritik sinyal" belirsizliğini gidermek için tetikleyici koşullar kodda şu şekilde tanımlanır:

```javascript
function shouldTriggerStrategy(messages, session, calculatedScores, signals) {
  const msgCount = messages.length;

  // Kural 1: Her 3 soruda bir
  if (msgCount > 0 && msgCount % 3 === 0) return true;

  // Kural 2: Contradiction skorunda ani artış (tek hamlede +20 üzeri)
  if (calculatedScores.contradiction - session.contradiction_score > 20) return true;

  // Kural 3: Faz değişimi tetiklendi
  if (calculatedScores.phase !== session.current_phase) return true;

  // Kural 4: Kırılma noktası bayrağı
  if (signals.breakingPointFlag) return true;

  return false;
}
```

---

### 7.6 Prompt Yapısı — Strateji Katmanı

```
[SİSTEM]
Sen deneyimli bir sorgu taktisyenisin. Görevin mevcut sorgu durumunu
değerlendirip sıradaki 2-3 hamle için bir plan oluşturmak.

[VAKA BAĞLAMI]
Suç türü: {crime_type}
Şüpheli: {name} {surname}, {age} yaş, {gender}
Olay yeri tutanağı: {crime_scene_notes}
İlk ifade: {initial_statement}

[MEVCUT DURUM]
Aktif faz: {current_phase}
Çelişki skoru: {contradiction_score}/100
Kaçınma skoru: {avoidance_score}/100
Stres skoru: {stress_score}/100
Tutarsızlık skoru: {inconsistency_score}/100

Tespit edilen çelişkiler: {contradiction_list}
Tespit edilen tutarsızlıklar: {inconsistency_list}

[KONUŞMA GEÇMİŞİ]
{full_conversation_history}

[TAKTİK KATALOĞU]
{tactic_catalog_json}

[TAKTİK PRENSİPLERİ — Örnek satırları birebir kullanma, prensibi anla ve bu vakaya özgü uygula]
{
  "withholding_evidence": {
    "principle": "Delili erken açıklama. Şüpheliyi önce yalanlarına göm, tüm çıkış yolları kapandığında sun.",
    "when_it_works": "Şüpheli net bir yalan söylemiş ve contradiction_score yüksekse etkili.",
    "warning": "Delili erken sunarsan şüpheli hikayesini o delile göre ayarlar."
  },
  "minimization": {
    "principle": "Suçu küçült, ahlaki kaçış yolu aç. Şüpheli kendini 'kötü adam' olarak görmek istemez — bu çerçeveyi kır.",
    "when_it_works": "Duygusallaşma veya vicdan azabı sinyali varsa.",
    "warning": "Baskı altında kullanma, şüpheli savunmacıyken empati boşa gider."
  },
  "story_locking": {
    "principle": "Şüpheliyi değiştiremeyeceği spesifik detaylara sabitle.",
    "when_it_works": "Şüpheli genel ifadeler veriyor, detaylardan kaçınıyorsa.",
    "warning": "Detayları özetleyip onaylatmayı unutma."
  },
  "tactical_break": {
    "principle": "Kırılma anında baskı artırma. Mola ver, şüpheli kendi kendini kırar.",
    "when_it_works": "Şüpheli duygusal çöküş yaşıyorsa.",
    "warning": "Mola sonrası doğrudan baskıya dönme — empati köprüsüyle başla."
  },
  "implied_omniscience": {
    "principle": "Polisin her şeyi bildiği hissini yarat. Gerçekte ne bildiğin değil, ne bildiğini düşündürdüğün önemli.",
    "when_it_works": "Şüpheli ısrarla inkar ediyor ama delil baskısı yüksekse.",
    "warning": "Abartma — şüpheli spesifik bir şey sorarsa blöf çöker."
  }
}

[GÖREV]
Mevcut durumu analiz et ve yanıtını YALNIZCA şu JSON formatında ver:

{
  "phase_assessment": "Şu an neredeyiz, ne değişti",
  "next_phase": "opening | story_locking | evidence_pressure | confession_approach",
  "strategic_goal": "Sıradaki 2-3 hamlede ne elde etmek istiyoruz",
  "planned_moves": [
    { "tactic": "taktik_id", "intent": "Bu hamleden beklenen" },
    { "tactic": "taktik_id", "intent": "Bu hamleden beklenen" }
  ],
  "avoid": "Şu an kullanılmaması gereken taktik ve neden"
}
```

---

### 7.7 Prompt Yapısı — Hamle Katmanı

```
[SİSTEM]
Sen deneyimli bir polis sorgu uzmanısın. Görevin şüpheliyi sorgulamak için
taktiksel, psikolojik açıdan etkili hamleler üretmek.

Temel kurallar:
- Hamle bir soru olabilir, bir cümle olabilir, empati kurma olabilir.
- Tüm önceki soru ve cevapları karşılaştır, çelişkileri takip et.
- Strateji planına bak ve sıradaki hamleyi ona göre üret.
- Taktik kataloğundan belirtilen taktiği uygula.
- Blöf kullanırken bu cevaba ve bu vakaya özel yap.
- Tüm çıktı Türkçe olmalı.

[VAKA BAĞLAMI — sabit]
Suç türü: {crime_type}
Şüpheli: {name} {surname}, {age} yaş, {gender}
Olay yeri tutanağı: {crime_scene_notes}
İlk ifade: {initial_statement}

[METRİK DURUMU]
Çelişki skoru: {contradiction_score}/100
Kaçınma skoru: {avoidance_score}/100
Stres skoru: {stress_score}/100
Tutarsızlık skoru: {inconsistency_score}/100

[SİNYAL ANALİZİ — bu cevaba özgü]
Cevap: "{last_answer}"
Gözlemlenen sinyaller: {body_language_inputs}, {voice_tone_inputs}
Kombinasyon anlamı: {signal_meaning}
Taktik yönlendirme: {tactical_implication}

[STRATEJİ PLANI]
Aktif faz: {current_phase}
Stratejik hedef: {strategic_goal}
Bu hamle için önerilen taktik: {current_planned_tactic}
Kaçınılması gereken: {avoid}

[KONUŞMA GEÇMİŞİ]
S1: {question_1}
C1: {answer_1}
S2: {question_2}
C2: {answer_2}
... (tüm geçmiş)

[TESPİTLER]
Çelişkiler: {contradiction_list}
Tutarsızlıklar: {inconsistency_list}

[TAKTİK PRENSİPLERİ — Örnek satırları birebir kullanma, prensibi anla ve bu vakaya özgü uygula]
{tactic_principles_json}

[KISITLAMALAR — ZORUNLU]
- Bu hamlede YALNIZCA şu taktiği kullan: {current_planned_tactic}
- Başka taktiklere geçme. Strateji katmanı bu kararı zaten verdi.
- Eğer mevcut bağlamda bu taktiği uygulamak gerçekten mümkün değilse
  (şüpheli avukat talep etti vb.) sadece "TACTIC_BLOCKED" yaz.

[GÖREV]
Son cevabı analiz et. Yanıtını YALNIZCA şu JSON formatında ver:

{
  "analysis": {
    "contradictions": [
      { "type": "contradiction | inconsistency", "message": "Tespit açıklaması" }
    ],
    "stress_interpretation": "Bu cevaptaki sinyal kombinasyonunun anlamı",
    "strategic_note": "Bu hamleden sonra nereye gidilmeli"
  },
  "move": {
    "tactic_used": "taktik_id",
    "tactic_step": "Taktik kataloğundaki hangi adım uygulandı",
    "move_type": "question | statement | empathy | bluff | silence_prompt",
    "content": "Polis tarafından söylenecek veya sorulacak metin"
  },
  "phase_update": "faz değişiyorsa yeni faz, değişmiyorsa null"
}
```

---

### 7.8 Prompt Yapısı — Analiz Katmanı

```
[SİSTEM]
Sen bir sorgu analisti. Görevin sadece ölçmek ve sınıflandırmak.
Hamle üretmiyorsun, yorum yapmıyorsun, tavsiye vermiyorsun.

[VAKA BAĞLAMI]
İlk ifade: {initial_statement}

[KONUŞMA GEÇMİŞİ — tamamı]
S1: {question_1}
C1: {answer_1}
...

[SON CEVAP — analiz edilecek]
Soru: "{last_question}"
Cevap: "{last_answer}"

[KISITLAMALAR — ZORUNLU]
- Sadece aşağıdaki JSON formatını üret, başka hiçbir şey yazma.
- Preamble, açıklama, yorum ekleme.
- Ağırlık değerleri için sadece tanımlı seçenekleri kullan.

[GÖREV]
{
  "contradiction_weight": 0.0,
  "contradiction_detail": null,
  "avoidance_weight": 0.0,
  "avoidance_type": null,
  "inconsistency_weight": 0.0,
  "inconsistency_detail": null,
  "ai_stress_score": 0.0
}

Ağırlık değerleri:

contradiction_weight: 0.0 | 0.2 | 0.5 | 1.0
avoidance_weight: 0.0 | 0.5 | 0.7 | 0.8 | 1.0
avoidance_type: "konu_degistirme" | "soruyla_cevap" | "bilmiyorum" | "yanıtsız" | null
inconsistency_weight: 0.0 | 0.2 | 0.5 | 0.7 | 0.8
ai_stress_score: 0.0 ile 1.0 arası ondalıklı sayı
```

---

### 7.9 Context Window Yönetimi

- Gemini 2.5 Flash'ın context window'u 1M token'dır.
- Tipik bir sorgu seansı (20-30 soru) + taktik kataloğu + few-shot örnekler maksimum 10.000-15.000 token tüketir.
- Analiz Katmanı eklenmesiyle her soru başına bir ekstra çağrı yapılır; ancak bu çağrı kısa context içerdiğinden token maliyeti düşüktür.
- Context window sorunu yaşanmaz, tüm geçmiş her çağrıda gönderilir.

---

### 7.10 Edge Function Akışı

```
Mobil uygulama
    ↓ (ses kaydı tamamlandı)
Whisper API → transkript metni
    ↓
messages tablosuna cevap kaydedilir
metrics_before snapshot'ı alınır
    ↓
Sinyal Yorumlama Katmanı çalışır
(beden dili + ses tonu + cevap → anlamsal yorum üretilir)
    ↓
Analiz Katmanı API çağrısı [callGeminiWithFallback]
(sadece ölçer: contradiction/avoidance/inconsistency ağırlıkları + ai_stress döner)
    ↓
Formüller çalışır → Metrikler güncellenir
Adaptif ağırlıklar getAdaptiveWeights() ile alınır
    ↓
Önceki mesajın metrics_after alanı doldurulur
Taktik etkinlik skoru hesaplanır → tactic_performance tablosuna kaydedilir
    ↓
[Strateji güncelleme tetiklendi mi? — shouldTriggerStrategy()]
Evet → Strateji Katmanı API çağrısı [callGeminiWithFallback]
     → strategic_plan sessions tablosuna güncellenir
    ↓
Hamle Katmanı API çağrısı [callGeminiWithFallback]
(sinyal yorumu + strateji planı + taktik kataloğu + few-shot örnekler + tam geçmiş)
    ↓
JSON yanıt parse edilir
    ↓
analysis.contradictions → chat'te bildirim balonları
move.content → AI hamlesi olarak chat'te gösterilir
phase_update → sessions.current_phase güncellenir
messages tablosuna kaydedilir
```

---

## 8. Ses Kaydı ve Transkripsiyon Akışı

1. Polis AI hamlesini şüpheliye sesli okur
2. Ses kayıt butonuna basar (kırmızı pulse animasyonu başlar)
3. Şüpheli cevabını verir
4. Butona tekrar basılır, kayıt durur
5. Ses dosyası Supabase Storage'a yüklenir (answer_audio_url kaydedilir)
6. Ses dosyası Whisper API'ye gönderilir
7. Transkript metni messages.answer alanına kaydedilir
8. SORU ÜRET butonu aktif hale gelir

**Not:** Beden dili ve ses tonu sinyalleri o cevap boyunca genel gözlem olarak kaydedilir ve tüm cevap metniyle birlikte yorumlanır.

**Maliyet tahmini:** expo-av default 128kbps AAC ile ortalama 15 saniyelik cevap ~240KB tutar. Whisper API maliyeti $0.0015/cevap. $2 kredi ile yaklaşık 1.300 test çağrısı yapılabilir.

---

## 9. Validasyon Kuralları (Zod)

```typescript
const caseSchema = z.object({
  suspect_tc: z
    .string()
    .length(11, "TC 11 haneli olmalı")
    .regex(/^\d+$/, "Sadece rakam girilmeli"),
  suspect_name: z
    .string()
    .min(2)
    .regex(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/, "Sadece harf girilmeli"),
  suspect_surname: z
    .string()
    .min(2)
    .regex(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/, "Sadece harf girilmeli"),
  suspect_age: z
    .number()
    .min(1)
    .max(150, "Geçerli bir yaş giriniz"),
  suspect_gender: z.enum(["erkek", "kadın"]),
  crime_type: z
    .string()
    .min(2, "Suç türü giriniz"),
  crime_scene_notes: z.string().min(10, "En az 10 karakter giriniz"),
  initial_statement: z.string().min(10, "En az 10 karakter giriniz"),
})
```

---

## 10. Tasarım Sistemi

### Renk Paleti
| Değişken | Hex | Kullanım |
|---|---|---|
| Arkaplan | #0A0A0F | Ana arka plan |
| Yüzey | #13131A | Kartlar |
| İkincil yüzey | #1C1C26 | Şüpheli mesaj balonları |
| Border | #2A2A3A | Tüm borderlar |
| Aksan mavi | #4F6EF7 | Butonlar, AI mesajları, aktif pill |
| Tehlike kırmızı | #E05252 | BİTİR, çelişki, kayıt butonu |
| Uyarı sarı | #F0A500 | Stres uyarısı, analiz bildirimi |
| Başarı yeşil | #4CAF7D | Düşük metrik, tamamla butonu |
| Birincil metin | #F0F0F5 | Ana yazılar |
| İkincil metin | #7A7A9A | Label, placeholder |

### Genel Kurallar
- Dark mode only
- Köşe yuvarlaklığı: kartlar 16px, butonlar 12px, inputlar 10px, pill 20px
- Shadow yok, subtle border kullanılır
- Metrik sayıları monospace font
- Tüm uppercase metinlerde letter-spacing: 0.8px+

---

## 11. Eğitim Verisi ve Few-Shot Kaynak Yönetimi

### 11.1 Mevcut Kaynaklar

- 79 adet sentetik sorgu transkripti (effectiveness_score ile puanlanmış)
- 2 adet gerçek sorgu transkripti (Ormsby ve Castellano vakaları)
- 14 taktik belgesi (gerçek vakalardan çıkarılmış, gerekçeli)

### 11.2 Kullanım Stratejisi

Fine-tuning yapılmaz. Bunun yerine:

**Gerçek transkriptlerden:** (gercek_transkriptler.md dosyası) Kritik anlar "few-shot örnek" formatına dönüştürülür (Bkz. Bölüm 7.3). Model prensibi öğrenir, satırı taklit etmez.

**Taktik belgelerinden:** 14 taktik doğrudan taktik kataloğu JSON formatına dönüştürülmüştür (Bkz. Bölüm 7.2).

---

## 12. Bütçe ve API Maliyeti

| Servis | Ücret | Tahmini Kullanım |
|---|---|---|
| Gemini 2.5 Flash | $0.30 / 1M token | Geliştirme + test: ~ücretsiz kota dahilinde |
| OpenAI Whisper | $0.006 / dakika (~$0.0015/cevap) | $2 kredi ile ~1.300 test çağrısı |
| Supabase | Ücretsiz tier (1GB egress) | ~4.000 ses dosyasına kadar yeterli |

Analiz Katmanı eklenmesiyle her soru başına bir ekstra API çağrısı yapılmaktadır. Kısa context ve kısa çıktı içerdiğinden toplam maliyet ücretsiz kota dahilinde kalır.

---

## 13. Sonraki Adımlar (Geliştirme Sırası)

1. Supabase şeması kurulumu ve Auth yapılandırması (`current_phase`, `active_tactic`, `strategic_plan`, `tactic_performance` tabloları dahil)
2. React Native + Expo projesi kurulumu
3. Login sayfası
4. Ana sayfa (vaka listesi)
5. Vaka formu sayfası + Zod validasyonu (`crime_type` alanı dahil)
6. Sinyal yorumlama katmanı (signalMeaningMap) implementasyonu
7. Taktik kataloğu JSON dosyası oluşturulması
8. Gerçek transkriptlerin few-shot formatına dönüştürülmesi
9. `callGeminiWithFallback` wrapper ve FALLBACKS implementasyonu
10. `shouldTriggerStrategy` fonksiyonu implementasyonu
11. Supabase Edge Function — Analiz Katmanı (Gemini entegrasyonu)
12. Supabase Edge Function — Strateji Katmanı (Gemini entegrasyonu)
13. Supabase Edge Function — Hamle Katmanı (Gemini entegrasyonu)
14. Taktik etkinlik skoru ve adaptif ağırlık mekanizması (`calculateTacticScore`, `getAdaptiveWeights`)
15. Sorgu sayfası (chat UI + metrikler)
16. Ses kaydı + Whisper entegrasyonu
17. Analiz ve bildirim sistemi
18. Bitirme modalı + Anket sayfası
19. Test ve hata düzeltme
