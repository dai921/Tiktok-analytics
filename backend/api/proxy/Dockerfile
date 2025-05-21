# ---- stage 1: 公式イメージからバイナリをだけ取り出す ----
FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.16.0 AS src
# ---- stage 2: EXPOSE 行ゼロの distroless ----
FROM gcr.io/distroless/static-debian12

COPY --from=src /cloud-sql-proxy /cloud-sql-proxy
ENTRYPOINT ["/cloud-sql-proxy"]
CMD ["--structured-logs","--port=3306","tiktok-analytics-prod-451609:asia-northeast1:tiktok-analytics-db"]
    