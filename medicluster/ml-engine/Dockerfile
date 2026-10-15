FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
# CPU-only PyTorch wheels: the default wheels bundle CUDA and are several GB larger.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Copy source
COPY . .

EXPOSE 8000

# Render injects PORT; one worker keeps memory within a single model load.
CMD ["sh", "-c", "gunicorn --bind [::]:${PORT:-8000} --workers 1 --timeout 180 app:app"]
