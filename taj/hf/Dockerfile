FROM python:3.11-slim
RUN pip install --no-cache-dir faster-whisper fastapi "uvicorn[standard]"
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user HF_HOME=/home/user/.cache
WORKDIR /home/user/app
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')"
COPY --chown=user app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
