import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("LOCAL_WHISPER_MODEL", "base")
DEVICE = os.getenv("LOCAL_WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("LOCAL_WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="Connect Local Transcription")
print(f"Loading faster-whisper model: {MODEL_NAME} ({DEVICE}/{COMPUTE_TYPE})")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
print("Local transcription service ready.")

@app.get("/health")
def health():
    return {"ok": True, "engine": "faster-whisper", "model": MODEL_NAME, "device": DEVICE}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str | None = Form(default=None)):
    data = await file.read()
    if len(data) < 2500:
        raise HTTPException(status_code=400, detail="Audio segment is too short.")
    suffix = Path(file.filename or "segment.webm").suffix or ".webm"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(data)
            temp_path = f.name
        lang = language if language in {"en", "hi", "mr"} else None
        segments, info = model.transcribe(
            temp_path,
            language=lang,
            beam_size=3,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(seg.text.strip() for seg in segments if seg.text.strip()).strip()
        return {"text": text, "language": getattr(info, "language", lang or ""), "model": MODEL_NAME}
    except Exception as exc:
        print("Transcription error:", repr(exc))
        raise HTTPException(status_code=422, detail=str(exc)[:400])
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except OSError:
                pass
