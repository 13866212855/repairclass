# Streamlit twin service (secondary tenant) - runs under /pyapp/ baseUrlPath
FROM python:3.11-slim

WORKDIR /app

# pip install with mirror chain + retries (unset proxies: Docker Desktop
# injects host proxy env like 127.0.0.1:7890 which breaks builds when off).
# Mirror chain: aliyun -> tencent -> official PyPI. Do NOT lead with tuna:
# it has been observed returning an empty index ("from versions: none")
# and 403 on wheel files; USTC redirects file downloads to tuna, so it
# inherits the same 403. Aliyun serves wheels from its own storage.
RUN unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy NO_PROXY no_proxy; \
    install_pkgs() { \
        pip install --no-cache-dir --retries 3 --timeout 60 \
            --trusted-host mirrors.aliyun.com \
            --trusted-host mirrors.cloud.tencent.com \
            "$@" streamlit psycopg2-binary cloudinary pytz requests; \
    }; \
    ok=0; \
    install_pkgs -i https://mirrors.aliyun.com/pypi/simple/ && ok=1; \
    if [ "$ok" != "1" ]; then sleep 10; install_pkgs -i https://mirrors.cloud.tencent.com/pypi/simple && ok=1; fi; \
    if [ "$ok" != "1" ]; then sleep 10; install_pkgs -i https://pypi.org/simple && ok=1; fi; \
    if [ "$ok" != "1" ]; then echo "[ERROR] All PyPI mirrors failed."; exit 1; fi

COPY app.py .

ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8501

CMD ["streamlit", "run", "app.py", \
     "--server.port=8501", \
     "--server.address=0.0.0.0", \
     "--server.baseUrlPath=pyapp", \
     "--server.headless=true", \
     "--server.enableCORS=false", \
     "--server.enableXsrfProtection=false"]
