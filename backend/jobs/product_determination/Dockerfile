FROM python:3.11-slim

WORKDIR /app

COPY backend/jobs/product_determination/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/jobs/product_determination/manual_product_determination.py ./manual_product_determination.py
COPY backend/jobs/product_determination/core ./core
COPY backend/functions/flask-service/product-determination /app/backend/functions/flask-service/product-determination

ENV PYTHONPATH=/app

CMD ["python", "-m", "manual_product_determination"]
