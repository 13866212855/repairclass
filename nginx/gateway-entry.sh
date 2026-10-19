#!/bin/sh
# Gateway entrypoint: prepare the dynamic include, start the background
# sync loop, then run nginx in the foreground.

CONF_DIR="/etc/nginx/conf.d/tenants"
mkdir -p "$CONF_DIR"
[ -f "$CONF_DIR/tenants.conf" ] || : > "$CONF_DIR/tenants.conf"

(
    # Initial delay: the main app may still be booting on first start
    sleep 5
    while true; do
        sh /usr/local/bin/gateway_sync.sh || true
        sleep 10
    done
) &

exec nginx -g 'daemon off;'
