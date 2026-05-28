"""
AI-Investigator Body Language & Voice Tone Analysis Service
============================================================
FastAPI microservice — MediaPipe Tasks API (pose + face landmarker)
and librosa/PyAV voice tone analysis.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8001
"""
from __future__ import annotations

import asyncio
import base64
import logging
import math
import os
import tempfile
import urllib.request
from typing import List, Optional, Set, Tuple

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from mediapipe.tasks import python as mp_tasks_python
from mediapipe.tasks.python import vision as mp_tasks_vision
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai-investigator")

# =====================================================================
# MODEL FILES  (downloaded on first use)
# =====================================================================

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
POSE_MODEL_PATH = os.path.join(MODELS_DIR, "pose_landmarker_lite.task")
FACE_MODEL_PATH = os.path.join(MODELS_DIR, "face_landmarker.task")
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)


def _ensure_models() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(POSE_MODEL_PATH):
        log.info("Downloading pose model (~5 MB)…")
        urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
        log.info("Pose model ready.")
    if not os.path.exists(FACE_MODEL_PATH):
        log.info("Downloading face model (~26 MB)…")
        urllib.request.urlretrieve(FACE_MODEL_URL, FACE_MODEL_PATH)
        log.info("Face model ready.")


# =====================================================================
# LAZY MODEL LOADERS
# =====================================================================

_pose_landmarker = None
_face_landmarker = None
_deepface = None
_librosa = None


def get_pose_landmarker():
    global _pose_landmarker
    if _pose_landmarker is None:
        _ensure_models()
        base = mp_tasks_python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        opts = mp_tasks_vision.PoseLandmarkerOptions(
            base_options=base,
            running_mode=mp_tasks_vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        _pose_landmarker = mp_tasks_vision.PoseLandmarker.create_from_options(opts)
    return _pose_landmarker


def get_face_landmarker():
    global _face_landmarker
    if _face_landmarker is None:
        _ensure_models()
        base = mp_tasks_python.BaseOptions(model_asset_path=FACE_MODEL_PATH)
        opts = mp_tasks_vision.FaceLandmarkerOptions(
            base_options=base,
            running_mode=mp_tasks_vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
        )
        _face_landmarker = mp_tasks_vision.FaceLandmarker.create_from_options(opts)
    return _face_landmarker


def get_deepface():
    global _deepface
    if _deepface is None:
        from deepface import DeepFace
        _deepface = DeepFace
    return _deepface


def get_librosa():
    global _librosa
    if _librosa is None:
        import librosa
        _librosa = librosa
    return _librosa


# =====================================================================
# APP
# =====================================================================

app = FastAPI(title="AI-Investigator Analysis Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# SCHEMAS
# =====================================================================

class FramesRequest(BaseModel):
    frames: List[str]


class BodyLanguageResponse(BaseModel):
    bodyLanguage: List[str]
    debug: Optional[dict] = None


class VoiceToneResponse(BaseModel):
    voiceTone: List[str]
    debug: Optional[dict] = None


# =====================================================================
# UTILITIES
# =====================================================================

def decode_base64_frame(b64: str) -> Optional[np.ndarray]:
    try:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception as e:
        log.warning("Frame decode failed: %s", e)
        return None


def frame_motion(prev_gray: Optional[np.ndarray], cur_gray: np.ndarray) -> float:
    if prev_gray is None or prev_gray.shape != cur_gray.shape:
        return 0.0
    return float(np.mean(cv2.absdiff(prev_gray, cur_gray)))


# =====================================================================
# THRESHOLDS
# =====================================================================

EMOTION_THRESHOLD = 0.35
HEAD_YAW_THRESHOLD = 25.0
HEAD_PITCH_DOWN_THRESHOLD = 22.0
MOTION_THRESHOLD_LOW = 1.5
MOTION_THRESHOLD_HIGH = 8.0
HAND_FACE_PROXIMITY = 0.18
LIP_DEFORM_THRESHOLD = 0.040


# =====================================================================
# BODY LANGUAGE HELPERS  (Tasks API landmark format)
# =====================================================================

def analyze_emotion(images: List[np.ndarray]) -> dict:
    DeepFace = get_deepface()
    totals = {"angry": 0.0, "fear": 0.0, "sad": 0.0,
              "happy": 0.0, "surprise": 0.0, "disgust": 0.0, "neutral": 0.0}
    count = 0
    for img in images:
        try:
            res = DeepFace.analyze(
                img_path=img,
                actions=["emotion"],
                enforce_detection=False,
                detector_backend="opencv",
                silent=True,
            )
            if isinstance(res, list):
                res = res[0]
            for k in totals:
                totals[k] += float(res.get("emotion", {}).get(k, 0.0)) / 100.0
            count += 1
        except Exception as e:
            log.debug("DeepFace frame failed: %s", e)
    if count == 0:
        return {k: 0.0 for k in totals}
    return {k: v / count for k, v in totals.items()}


def head_pose_from_face(face_result, w: int, h: int) -> Tuple[float, float]:
    try:
        fl = face_result.face_landmarks[0]
        nose, left_eye, right_eye = fl[1], fl[33], fl[263]
        chin, forehead = fl[152], fl[10]
        eye_dx = right_eye.x - left_eye.x
        nose_offset = nose.x - (left_eye.x + right_eye.x) / 2.0
        yaw = math.degrees(math.atan2(nose_offset, eye_dx)) * 2.0
        face_h = chin.y - forehead.y
        nose_v = nose.y - (forehead.y + chin.y) / 2.0
        pitch = math.degrees(math.atan2(nose_v, face_h)) * 2.0
        return yaw, pitch
    except Exception:
        return 0.0, 0.0


def detect_lip_bite(face_result) -> float:
    try:
        fl = face_result.face_landmarks[0]
        upper, lower = fl[13], fl[14]
        lc, rc = fl[61], fl[291]
        lip_dist = abs(upper.y - lower.y)
        mouth_w = abs(rc.x - lc.x)
        if mouth_w < 0.03:  # çok uzak/küçük yüz, güvenilmez ölçüm
            return 0.0
        return max(0.0, (0.02 - lip_dist / mouth_w)) * 5.0
    except Exception:
        return 0.0


def hand_near_face(pose_result, face_result) -> bool:
    try:
        if not pose_result.pose_landmarks or not face_result.face_landmarks:
            return False
        pl, fl = pose_result.pose_landmarks[0], face_result.face_landmarks[0]
        nose_xy = np.array([fl[1].x, fl[1].y])
        for idx in (15, 16):  # wrists
            d = np.linalg.norm(np.array([pl[idx].x, pl[idx].y]) - nose_xy)
            if d < HAND_FACE_PROXIMITY:
                return True
        return False
    except Exception:
        return False


def arms_crossed(pose_result) -> bool:
    try:
        pl = pose_result.pose_landmarks[0]
        ls, rs = pl[11], pl[12]   # omuzlar
        lw, rw = pl[15], pl[16]   # bilekler
        lh, rh = pl[23], pl[24]   # kalçalar

        # Düşük güven puanlı landmark'ları filtrele
        if any(getattr(lm, "visibility", 1.0) < 0.5 for lm in (ls, rs, lw, rw)):
            return False

        mid_x = (ls.x + rs.x) / 2.0

        # Koşul 1: Sol bilek sağda, sağ bilek solda (kavuşturulmuş)
        if not (lw.x > mid_x and rw.x < mid_x):
            return False

        # Koşul 2: Bilekler dikey olarak torso bölgesinde (omuz–kalça arası)
        shoulder_y = max(ls.y, rs.y)
        hip_y = (lh.y + rh.y) / 2.0
        if not (shoulder_y <= lw.y <= hip_y + 0.1 and
                shoulder_y <= rw.y <= hip_y + 0.1):
            return False

        # Koşul 3: Bilekler birbirine yeterince yakın (gerçek kavuşturma pozisyonu)
        shoulder_width = abs(ls.x - rs.x)
        wrist_dist = abs(lw.x - rw.x)
        return wrist_dist < shoulder_width * 0.8

    except Exception:
        return False


def torso_lean(
    pose_result, prev_shoulder_y: Optional[float]
) -> Tuple[Optional[float], str]:
    try:
        pl = pose_result.pose_landmarks[0]
        avg_y = (pl[11].y + pl[12].y) / 2.0
        if prev_shoulder_y is None:
            return avg_y, "none"
        delta = avg_y - prev_shoulder_y
        if delta > 0.03:
            return avg_y, "forward"
        if delta < -0.03:
            return avg_y, "back"
        return avg_y, "none"
    except Exception:
        return prev_shoulder_y, "none"


def hands_visible_and_still(pose_result, prev_wrists) -> Tuple[Optional[tuple], bool]:
    try:
        pl = pose_result.pose_landmarks[0]
        lw = (pl[15].x, pl[15].y)
        rw = (pl[16].x, pl[16].y)
        if prev_wrists is None:
            return (lw, rw), False
        prev_lw, prev_rw = prev_wrists
        moved = (
            (prev_lw and math.hypot(lw[0] - prev_lw[0], lw[1] - prev_lw[1]) > 0.02)
            or (prev_rw and math.hypot(rw[0] - prev_rw[0], rw[1] - prev_rw[1]) > 0.02)
        )
        return (lw, rw), not moved
    except Exception:
        return prev_wrists, False


# BlazePose 33-landmark skeleton connections
_POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (15, 17), (16, 18), (15, 19), (16, 20), (17, 19), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26),
    (25, 27), (26, 28), (27, 29), (28, 30), (29, 31), (30, 32),
]


def annotate_frame(img_bgr: np.ndarray, pose_result, face_result) -> np.ndarray:
    out = img_bgr.copy()
    h, w = img_bgr.shape[:2]
    if face_result and face_result.face_landmarks:
        for lm in face_result.face_landmarks[0][::8]:
            cv2.circle(out, (int(lm.x * w), int(lm.y * h)), 1, (60, 60, 230), -1)
    if pose_result and pose_result.pose_landmarks:
        pl = pose_result.pose_landmarks[0]
        for i, j in _POSE_CONNECTIONS:
            if i < len(pl) and j < len(pl):
                cv2.line(
                    out,
                    (int(pl[i].x * w), int(pl[i].y * h)),
                    (int(pl[j].x * w), int(pl[j].y * h)),
                    (200, 200, 200), 2,
                )
        for lm in pl:
            cv2.circle(out, (int(lm.x * w), int(lm.y * h)), 3, (220, 180, 60), -1)
    return out


# =====================================================================
# BATCH HTTP ENDPOINT — /analyze-frames
# =====================================================================

@app.post("/analyze-frames", response_model=BodyLanguageResponse)
async def analyze_frames(req: FramesRequest):
    if not req.frames:
        return BodyLanguageResponse(bodyLanguage=[])

    images = [decode_base64_frame(b) for b in req.frames[:10]]
    images = [img for img in images if img is not None]
    if not images:
        return BodyLanguageResponse(bodyLanguage=[])

    detected: set[str] = set()
    debug: dict = {}

    try:
        emo = analyze_emotion(images)
        debug["emotion_scores"] = emo
        if emo.get("fear", 0) >= EMOTION_THRESHOLD:
            detected.add("korku_ifadesi")
        if emo.get("angry", 0) >= EMOTION_THRESHOLD:
            detected.add("öfke_ifadesi")
        if emo.get("sad", 0) >= EMOTION_THRESHOLD:
            detected.add("üzgün_ifade")
    except Exception as e:
        log.warning("Emotion analysis failed: %s", e)

    pose_lmk = get_pose_landmarker()
    face_lmk = get_face_landmarker()

    prev_gray = None
    prev_shoulder_y: Optional[float] = None
    prev_wrists = None
    lean_votes = {"forward": 0, "back": 0}
    yaw_votes = pitch_down_votes = hand_face_votes = 0
    arms_crossed_votes = hands_still_votes = 0
    lip_bite_score = 0.0
    motion_samples: List[float] = []

    for img in images:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        motion = frame_motion(prev_gray, gray)
        motion_samples.append(motion)
        prev_gray = gray

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        pose_res = face_res = None
        try:
            pose_res = pose_lmk.detect(mp_image)
        except Exception:
            pass
        try:
            face_res = face_lmk.detect(mp_image)
        except Exception:
            pass

        if face_res and face_res.face_landmarks:
            yaw, pitch = head_pose_from_face(face_res, w, h)
            if abs(yaw) > HEAD_YAW_THRESHOLD:
                yaw_votes += 1
            if pitch > HEAD_PITCH_DOWN_THRESHOLD:
                pitch_down_votes += 1
            lip_bite_score = max(lip_bite_score, detect_lip_bite(face_res))

        if pose_res and pose_res.pose_landmarks:
            if hand_near_face(pose_res, face_res):
                hand_face_votes += 1
            if arms_crossed(pose_res):
                arms_crossed_votes += 1
            prev_shoulder_y, lean_dir = torso_lean(pose_res, prev_shoulder_y)
            if lean_dir in lean_votes:
                lean_votes[lean_dir] += 1
            prev_wrists, still = hands_visible_and_still(pose_res, prev_wrists)
            if still:
                hands_still_votes += 1

    n = len(images)
    motion_avg = sum(motion_samples) / max(1, len(motion_samples))
    debug.update({"motion_avg": motion_avg, "yaw_votes": yaw_votes, "lean_votes": lean_votes})

    if yaw_votes >= max(2, n // 3) or pitch_down_votes >= max(2, n // 3):
        detected.add("göz_kaçırma")
    if arms_crossed_votes >= max(2, n // 3):
        detected.add("kolları_kavuşturdu")
    if lean_votes["forward"] >= max(1, n // 4):
        detected.add("öne_eğilme")
    if lean_votes["back"] >= max(1, n // 4):
        detected.add("arkasına_yaslanma")
    if motion_avg > MOTION_THRESHOLD_HIGH:
        detected.add("kıpırdanma")
    if hand_face_votes >= max(1, n // 4):
        detected.add("yüze_el_götürme")
    if hands_still_votes >= max(2, n // 2) and motion_avg < MOTION_THRESHOLD_LOW:
        detected.add("eller_masada_sabit")
    if lip_bite_score > LIP_DEFORM_THRESHOLD:
        detected.add("dudak_ısırma")

    if "öne_eğilme" in detected and "arkasına_yaslanma" in detected:
        if lean_votes["forward"] >= lean_votes["back"]:
            detected.discard("arkasına_yaslanma")
        else:
            detected.discard("öne_eğilme")

    return BodyLanguageResponse(bodyLanguage=sorted(detected), debug=debug)


# =====================================================================
# VOICE TONE ANALYSIS
# =====================================================================

VOICE_HIGH_RMS_RATIO = 1.5
VOICE_LOW_RMS_RATIO = 0.4
VOICE_PITCH_STD_THRESHOLD = 35.0
VOICE_SILENCE_RATIO_THRESHOLD = 0.30


def _load_audio(audio_bytes: bytes) -> Tuple[Optional[np.ndarray], int]:
    """Load audio bytes — tries librosa/soundfile first, then PyAV for M4A/AAC."""
    librosa = get_librosa()

    with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        y, sr = librosa.load(tmp_path, sr=16000, mono=True)
        return y, sr
    except Exception:
        pass

    try:
        import av
        container = av.open(tmp_path)
        audio_stream = next((s for s in container.streams if s.type == "audio"), None)
        if audio_stream is None:
            return None, 16000
        native_sr = audio_stream.codec_context.sample_rate
        samples = []
        for frame in container.decode(audio_stream):
            arr = frame.to_ndarray()
            if arr.ndim > 1:
                arr = arr.mean(axis=0)
            samples.append(arr.astype(np.float32))
        container.close()
        if not samples:
            return None, 16000
        y = np.concatenate(samples)
        if native_sr != 16000:
            y = librosa.resample(y, orig_sr=native_sr, target_sr=16000)
        return y, 16000
    except Exception as e:
        log.warning("Audio load failed (librosa + PyAV): %s", e)
        return None, 16000
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def analyze_audio_bytes(audio_bytes: bytes) -> Tuple[List[str], dict]:
    librosa = get_librosa()
    detected: set[str] = set()
    debug: dict = {}

    y, sr = _load_audio(audio_bytes)
    if y is None or y.size == 0:
        return [], debug

    frame_length = int(0.025 * sr)
    hop_length = int(0.010 * sr)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    if rms.size == 0:
        return [], debug

    sorted_rms = np.sort(rms)
    baseline = float(np.mean(sorted_rms[: max(1, len(sorted_rms) // 5)]))
    peak = float(np.max(rms))
    mean_rms = float(np.mean(rms))

    threshold = baseline + (peak - baseline) * 0.2
    voiced_mask = rms > threshold
    voiced_rms = rms[voiced_mask]
    voiced_mean = float(np.mean(voiced_rms)) if voiced_rms.size else mean_rms

    debug.update({"voiced_mean": voiced_mean, "baseline": baseline})

    if voiced_mean > mean_rms * VOICE_HIGH_RMS_RATIO:
        detected.add("sesi_yükseldi")
    if voiced_mean < mean_rms * VOICE_LOW_RMS_RATIO and voiced_mean > 1e-5:
        detected.add("fısıldadı")

    try:
        f0, _, _ = librosa.pyin(y, fmin=70, fmax=400, sr=sr, frame_length=2048)
        f0_clean = f0[~np.isnan(f0)]
        if f0_clean.size > 10:
            f0_std = float(np.std(f0_clean))
            debug["f0_std"] = f0_std
            if f0_std > VOICE_PITCH_STD_THRESHOLD:
                detected.add("sesi_titredi")
    except Exception as e:
        log.debug("pyin failed: %s", e)

    silence_ratio = float(np.mean(~voiced_mask))
    debug["silence_ratio"] = silence_ratio
    if silence_ratio > VOICE_SILENCE_RATIO_THRESHOLD and len(rms) > 50:
        detected.add("cevap_zorlandı")

    return sorted(detected), debug


@app.post("/analyze-voice", response_model=VoiceToneResponse)
async def analyze_voice(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            return VoiceToneResponse(voiceTone=[])
        detected, debug = analyze_audio_bytes(audio_bytes)
        return VoiceToneResponse(voiceTone=detected, debug=debug)
    except Exception as e:
        log.exception("voice analysis failed: %s", e)
        return VoiceToneResponse(voiceTone=[])


# =====================================================================
# REAL-TIME WEBSOCKET PIPELINE
# =====================================================================

DEEPFACE_INTERVAL_S = 4.0
ANNOTATED_JPEG_QUALITY = 60


CONSEC_REQUIRED: dict = {
    "göz_kaçırma": 2,
    "dudak_ısırma": 5,
    "kolları_kavuşturdu": 3,
    "öne_eğilme": 3,
    "arkasına_yaslanma": 3,
    "kıpırdanma": 2,
    "yüze_el_götürme": 2,
}


class StreamState:
    def __init__(self) -> None:
        self.prev_gray: Optional[np.ndarray] = None
        self.prev_shoulder_y: Optional[float] = None
        self.prev_wrists = None
        self.recording: bool = False
        self.suspect_name: str = ""
        self.case_code: str = ""
        self.session_id: str = ""
        self.last_deepface_ts: float = 0.0
        self.deepface_running: bool = False
        self.last_emotion: Set[str] = set()
        # Ardışık frame sayaçları — debounce için
        self.consec: dict = {k: 0 for k in CONSEC_REQUIRED}


stream_state = StreamState()


class ConnectionManager:
    def __init__(self) -> None:
        self.dashboards: Set[WebSocket] = set()
        self.phones: Set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def add_dashboard(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.dashboards.add(ws)

    async def add_phone(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.phones.add(ws)

    async def remove(self, ws: WebSocket) -> None:
        async with self.lock:
            self.dashboards.discard(ws)
            self.phones.discard(ws)

    async def broadcast_to_dashboards(self, payload: dict) -> None:
        dead: List[WebSocket] = []
        for ws in list(self.dashboards):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self.lock:
                for ws in dead:
                    self.dashboards.discard(ws)


manager = ConnectionManager()
frame_queue: asyncio.Queue = asyncio.Queue(maxsize=1)


def analyze_frame_fast(
    img: np.ndarray, state: StreamState
) -> Tuple[List[str], np.ndarray, dict]:
    detected: set[str] = set()
    debug: dict = {}

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    motion = frame_motion(state.prev_gray, gray)
    state.prev_gray = gray
    debug["motion"] = round(motion, 3)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    pose_result = face_result = None
    try:
        pose_result = get_pose_landmarker().detect(mp_image)
    except Exception as e:
        log.debug("pose failed: %s", e)
    try:
        face_result = get_face_landmarker().detect(mp_image)
    except Exception as e:
        log.debug("face failed: %s", e)

    # Ham tespitler — debounce'dan önce
    raw: set[str] = set()

    if face_result and face_result.face_landmarks:
        yaw, pitch = head_pose_from_face(face_result, w, h)
        debug["yaw"] = round(yaw, 1)
        debug["pitch"] = round(pitch, 1)
        if abs(yaw) > HEAD_YAW_THRESHOLD or pitch > HEAD_PITCH_DOWN_THRESHOLD:
            raw.add("göz_kaçırma")
        if detect_lip_bite(face_result) > LIP_DEFORM_THRESHOLD:
            raw.add("dudak_ısırma")

    if pose_result and pose_result.pose_landmarks:
        if hand_near_face(pose_result, face_result):
            raw.add("yüze_el_götürme")
        if arms_crossed(pose_result):
            raw.add("kolları_kavuşturdu")
        state.prev_shoulder_y, lean_dir = torso_lean(pose_result, state.prev_shoulder_y)
        if lean_dir == "forward":
            raw.add("öne_eğilme")
        elif lean_dir == "back":
            raw.add("arkasına_yaslanma")
        state.prev_wrists, still = hands_visible_and_still(pose_result, state.prev_wrists)
        if still and motion < MOTION_THRESHOLD_LOW:
            detected.add("eller_masada_sabit")

    if motion > MOTION_THRESHOLD_HIGH:
        raw.add("kıpırdanma")

    # Debounce: minimum ardışık frame eşiğini geçen sinyalleri onayla
    for key, required in CONSEC_REQUIRED.items():
        if key in raw:
            state.consec[key] = state.consec.get(key, 0) + 1
        else:
            state.consec[key] = 0
        if state.consec.get(key, 0) >= required:
            detected.add(key)

    detected.update(state.last_emotion)
    annotated = annotate_frame(img, pose_result, face_result)
    return sorted(detected), annotated, debug


def _run_deepface_sync(img: np.ndarray) -> Set[str]:
    emo = analyze_emotion([img])
    active: Set[str] = set()
    if emo.get("fear", 0) >= EMOTION_THRESHOLD:
        active.add("korku_ifadesi")
    if emo.get("angry", 0) >= EMOTION_THRESHOLD:
        active.add("öfke_ifadesi")
    if emo.get("sad", 0) >= EMOTION_THRESHOLD:
        active.add("üzgün_ifade")
    return active


async def run_deepface(img: np.ndarray, state: StreamState) -> None:
    state.deepface_running = True
    try:
        loop = asyncio.get_event_loop()
        state.last_emotion = await loop.run_in_executor(None, _run_deepface_sync, img)
    except Exception as e:
        log.debug("deepface task failed: %s", e)
    finally:
        state.deepface_running = False


async def frame_worker() -> None:
    while True:
        try:
            img = await frame_queue.get()
        except Exception as e:
            log.exception("queue get failed: %s", e)
            continue

        try:
            loop = asyncio.get_event_loop()
            signals, annotated, debug = await loop.run_in_executor(
                None, analyze_frame_fast, img, stream_state
            )

            now = loop.time()
            if (
                now - stream_state.last_deepface_ts >= DEEPFACE_INTERVAL_S
                and not stream_state.deepface_running
            ):
                stream_state.last_deepface_ts = now
                asyncio.create_task(run_deepface(img.copy(), stream_state))

            ok, buf = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), ANNOTATED_JPEG_QUALITY]
            )
            frame_b64 = base64.b64encode(buf.tobytes()).decode("ascii") if ok else None

            await manager.broadcast_to_dashboards({
                "type": "analysis",
                "frame": frame_b64,
                "bodyLanguage": signals,
                "debug": debug,
            })
        except Exception as e:
            log.exception("frame worker failed: %s", e)


@app.on_event("startup")
async def _start_worker() -> None:
    asyncio.create_task(frame_worker())


@app.get("/")
async def dashboard_index():
    here = os.path.dirname(os.path.abspath(__file__))
    return FileResponse(os.path.join(here, "dashboard.html"))


@app.websocket("/ws/dashboard")
async def ws_dashboard(ws: WebSocket):
    await manager.add_dashboard(ws)
    try:
        await ws.send_json({
            "type": "session_info",
            "suspectName": stream_state.suspect_name,
            "caseCode": stream_state.case_code,
            "recording": stream_state.recording,
        })
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.debug("dashboard ws error: %s", e)
    finally:
        await manager.remove(ws)


@app.websocket("/ws/phone")
async def ws_phone(ws: WebSocket):
    await manager.add_phone(ws)
    try:
        while True:
            msg = await ws.receive_json()
            mtype = msg.get("type")

            if mtype == "frame":
                if not stream_state.recording:
                    continue
                img = decode_base64_frame(msg.get("data") or "")
                if img is None:
                    continue
                try:
                    while True:
                        frame_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    frame_queue.put_nowait(img)
                except asyncio.QueueFull:
                    pass

            elif mtype == "recording_start":
                stream_state.recording = True
                stream_state.suspect_name = msg.get("suspectName") or stream_state.suspect_name
                stream_state.case_code = msg.get("caseCode") or stream_state.case_code
                stream_state.session_id = msg.get("sessionId") or stream_state.session_id
                stream_state.prev_gray = None
                stream_state.prev_shoulder_y = None
                stream_state.prev_wrists = None
                stream_state.last_emotion = set()
                await manager.broadcast_to_dashboards({
                    "type": "session_event",
                    "event": "recording_start",
                    "suspectName": stream_state.suspect_name,
                    "caseCode": stream_state.case_code,
                })

            elif mtype == "recording_stop":
                stream_state.recording = False
                await manager.broadcast_to_dashboards({
                    "type": "session_event",
                    "event": "recording_stop",
                })

            elif mtype == "voice_result":
                await manager.broadcast_to_dashboards({
                    "type": "voice_result",
                    "voiceTone": msg.get("voiceTone") or [],
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.debug("phone ws error: %s", e)
    finally:
        await manager.remove(ws)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
