import os, tempfile, threading
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from faster_whisper import WhisperModel

KEY = "taj-48132d5dec65"
NAME = os.environ.get("WM", "large-v3-turbo")
model = WhisperModel(NAME, device="cpu", compute_type="int8", cpu_threads=2)
lock = threading.Lock()
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def work(data: bytes, prompt: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".bin") as f:
        f.write(data); f.flush()
        with lock:
            segs, _ = model.transcribe(f.name, language="ar", beam_size=1,
                                       condition_on_previous_text=False,
                                       initial_prompt=prompt or None)
            return " ".join(s.text.strip() for s in segs).strip()

@app.get("/")
def home():
    return {"ok": True, "model": NAME}

@app.post("/")
async def tr(req: Request):
    if req.headers.get("x-taj-key") != KEY:
        raise HTTPException(403, "key")
    data = await req.body()
    if not data:
        raise HTTPException(400, "empty")
    if len(data) > 8_000_000:
        raise HTTPException(413, "too large")
    text = await run_in_threadpool(work, data, req.query_params.get("p", ""))
    return {"text": text}
