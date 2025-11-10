FROM python:3.11-slim

WORKDIR /app

COPY backend/jobs/manuals/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/jobs/manuals/manual_summary_table_syncs.py ./manual_summary_table_syncs.py
COPY backend/jobs/manuals/core ./core


ENV PYTHONPATH=/app

CMD ["python", "-m", "manual_summary_table_syncs"]
