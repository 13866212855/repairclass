FROM node:24-bookworm

WORKDIR /app

COPY package*.json ./

# npm install: anti-dead-proxy + anti-TLS segment (do not revert to single-shot install)
RUN --mount=type=cache,target=/root/.npm \
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy NO_PROXY no_proxy; \
    npm config set registry https://registry.npmmirror.com && \
    npm config set strict-ssl false && \
    npm config set maxsockets 1 && \
    ok=0; \
    for i in 1 2 3 4 5 6; do \
        if npm install --legacy-peer-deps --no-audit --no-fund; then ok=1; break; fi; \
        sleep 15; \
    done; \
    if [ "$ok" != "1" ]; then \
        npm install --registry=https://mirrors.cloud.tencent.com/npm/ --legacy-peer-deps --no-audit --no-fund; \
    fi

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
