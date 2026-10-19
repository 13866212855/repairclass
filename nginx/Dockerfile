FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY gateway_sync.sh /usr/local/bin/gateway_sync.sh
COPY gateway-entry.sh /usr/local/bin/gateway-entry.sh

RUN mkdir -p /etc/nginx/conf.d/tenants \
    && touch /etc/nginx/conf.d/tenants/tenants.conf \
    && chmod +x /usr/local/bin/gateway_sync.sh /usr/local/bin/gateway-entry.sh

EXPOSE 80

CMD ["sh", "/usr/local/bin/gateway-entry.sh"]
