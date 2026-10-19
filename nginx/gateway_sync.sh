#!/bin/sh
# Syncs tenant routes from the main app into nginx and hot-reloads.
# Busybox-only (nginx:alpine): wget / diff / cp. Failures are silent:
# the loop retries in 10s, and nginx keeps serving the last good config.

GATEWAY_URL="${GATEWAY_URL:-http://repairclass:3000}"
CONF_DIR="/etc/nginx/conf.d/tenants"
CONF="$CONF_DIR/tenants.conf"
PREV="$CONF_DIR/tenants.conf.prev"
TMP="/tmp/tenants.next"

mkdir -p "$CONF_DIR"
[ -f "$CONF" ] || : > "$CONF"

# Fetch freshly rendered location blocks. A failed fetch (main app down,
# render error) leaves everything untouched and exits quietly.
wget -q -T 5 -O "$TMP" "$GATEWAY_URL/api/gateway/render" || { rm -f "$TMP"; exit 0; }

if ! diff -q "$TMP" "$CONF" > /dev/null 2>&1; then
    cp "$CONF" "$PREV" 2>/dev/null || true
    cp "$TMP" "$CONF"
    if nginx -t > /dev/null 2>&1; then
        nginx -s reload && echo "[gateway-sync] reloaded tenant routes"
    else
        echo "[gateway-sync] nginx -t failed, rolling back"
        [ -f "$PREV" ] && cp "$PREV" "$CONF"
    fi
fi
rm -f "$TMP"
exit 0
