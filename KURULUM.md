# AI Investigator — Kurulum

Bu dosya, projeyi sıfırdan ayağa kaldırmak için adım adım talimatları içerir.

## 1. Bağımlılıklar

```bash
cd c:\Users\safakh\Desktop\verison-2
npm install
```

## 2. Supabase

### 2.1 Proje oluştur
- https://supabase.com → yeni proje
- Region: Frankfurt (TR'ye en yakın düşük gecikmeli)
- Database password'u not et

### 2.2 Şemayı uygula
SQL Editor'da `supabase/migrations/001_schema.sql` içeriğini çalıştır.

### 2.3 Storage bucket'ları oluştur
Storage > Buckets:
- `suspect-photos` — public read, authenticated write
- `answer-audio` — private (sadece Edge Function üzerinden okunur)

### 2.4 Secrets (Edge Functions için)
Project Settings > Edge Functions > Secrets:

```
SUPABASE_JWT_SECRET=<rastgele 32+ karakter>
GEMINI_API_KEY=<Google AI Studio'dan>
OPENAI_API_KEY=<OpenAI hesabından>
ADMIN_SEED_SECRET=<seed-officer için, sadece geliştirme>
```

> Not: `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` Edge Functions ortamına otomatik enjekte edilir.

### 2.5 Edge Functions deploy

Supabase CLI ile:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy login
supabase functions deploy seed-officer
supabase functions deploy analyze
supabase functions deploy strategy
supabase functions deploy move
supabase functions deploy transcribe
```

### 2.6 İlk officer'ı oluştur

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/seed-officer \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{
    "admin_secret": "<ADMIN_SEED_SECRET>",
    "badge_id": "7742-ALPHA-01",
    "password": "test1234",
    "full_name": "M. Karahan"
  }'
```

## 3. Mobil uygulama

### 3.1 .env

`.env.example`'ı kopyala → `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
```

### 3.2 Çalıştır

```bash
npx expo start
```

- iOS Simulator: `i`
- Android Emulator: `a`
- Fiziksel cihaz: Expo Go uygulamasıyla QR oku

## 4. Test akışı

1. Login: `7742-ALPHA-01` / `test1234`
2. Sağ alt + ile yeni vaka oluştur
3. Sorgu açılır → AI ilk soruyu üretir
4. Mikrofon butonuna bas → şüpheli cevabını söyle → tekrar bas
5. Beden dili / ses tonu pillerinden seç
6. SORU ÜRET → metrikler güncellenir, AI yeni soru üretir
7. Birkaç tur sonra BİTİR → "Tamamla" → anket → ana sayfaya dön

## 5. Yapılan kararların doğrulanması

- 15 taktik (exploit_weakness dahil): `lib/tactics.ts`
- Düzeltilmiş signalMeaningMap: `lib/signals.ts`
- Adaptif ağırlık (Seçenek B): `lib/adaptiveWeights.ts` + `adaptive_weights` tablosu
- Faz hazırlık skoru: `lib/phaseTransition.ts`
- Manuel bcrypt + JWT auth: `supabase/functions/login/`
- 11 beden dili + 8 ses tonu = 19 buton: `lib/signalButtons.ts`
- Mockup esas alınan Header: `app/session/[id].tsx` (Logo solda, BİTİR alt barda)
