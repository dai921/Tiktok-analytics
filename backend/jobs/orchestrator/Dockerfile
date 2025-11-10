FROM python:3.11-slim

WORKDIR /app

COPY backend/jobs/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/jobs/core /app/backend/jobs/core
COPY backend/jobs/steps /app/backend/jobs/steps
COPY backend/jobs/orchestrator /app/backend/jobs/orchestrator

ENV PYTHONPATH=/app

CMD ["python", "-m", "backend.jobs.orchestrator.orchestrator"]
