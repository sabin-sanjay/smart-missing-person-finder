# Dockerfile: the recipe Hugging Face Spaces follows to build and run the backend.
# (You don't need Docker on your own computer; Hugging Face runs this.)

# Start from a small Linux with Python 3.12
FROM python:3.12-slim

# System libraries that OpenCV (used by DeepFace) needs
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs the app as user 1000, so create that user
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    DEEPFACE_HOME=/home/user \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2
WORKDIR /home/user/app

# Install Python packages first (Docker caches this step between builds)
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Download the Facenet512 model weights now (about 95 MB), so the first
# real request doesn't have to wait for the download
RUN python -c "from deepface import DeepFace; DeepFace.build_model('Facenet512')"

# Copy our code
COPY --chown=user app ./app

# Hugging Face sends web traffic to port 7860
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
