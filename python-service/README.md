# AI-Investigator Analysis Service

FastAPI microservice for body language (DeepFace + MediaPipe) and voice tone (librosa) analysis.

## Setup

```bash
cd python-service
python -m venv .venv
.venv\Scripts\activate    # Windows PowerShell
pip install -r requirements.txt
```

First start downloads DeepFace model weights (~500MB to `~/.deepface/weights/`).

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```

Find your LAN IP:

```powershell
ipconfig | findstr IPv4
```

Set `PYTHON_SERVICE_URL=http://<your-lan-ip>:8001` in the project root `.env` so the
React Native app can reach it from a phone on the same WiFi.

## Endpoints

- `POST /analyze-frames` — body `{ "frames": [base64_jpeg, ...] }` → `{ "bodyLanguage": [...] }`
- `POST /analyze-voice` — multipart upload field `audio` (m4a/wav) → `{ "voiceTone": [...] }`
- `GET /health` — quick liveness probe

## Detected signal keys

Body language (from frames):
`korku_ifadesi`, `öfke_ifadesi`, `üzgün_ifade`, `göz_kaçırma`, `kolları_kavuşturdu`,
`öne_eğilme`, `arkasına_yaslanma`, `kıpırdanma`, `yüze_el_götürme`,
`eller_masada_sabit`, `dudak_ısırma`

Voice tone (from audio):
`sesi_yükseldi`, `fısıldadı`, `sesi_titredi`, `cevap_zorlandı`
