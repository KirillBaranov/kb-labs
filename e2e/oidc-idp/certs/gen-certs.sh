#!/bin/sh
# Generate a self-signed test CA and a multi-SAN server certificate for the
# OAuth E2E stack. NOT for production — test material only.
#
# SANs cover every name the cert is presented under:
#   - idp-stub            : gateway → IdP (server-to-server, inside docker net)
#   - kb-cloud.kblabs.ru  : browser → studio nginx (TLS-terminated origin)
#   - localhost / 127.0.0.1: convenience for local poking
#
# The gateway trusts ca.crt via NODE_EXTRA_CA_CERTS; the browser uses
# ignoreHTTPSErrors so it need not import the CA.
set -e
cd "$(dirname "$0")"

DAYS=3650

# ── CA ────────────────────────────────────────────────────────────────────────
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -subj "/CN=KB Labs E2E Test CA" -out ca.crt

# ── Server key + CSR ────────────────────────────────────────────────────────────
openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=kb-cloud.kblabs.ru" -out server.csr

# ── Sign with SANs ──────────────────────────────────────────────────────────────
cat > server.ext << 'EXT'
subjectAltName = @alt_names
[alt_names]
DNS.1 = idp-stub
DNS.2 = kb-cloud.kblabs.ru
DNS.3 = localhost
IP.1  = 127.0.0.1
EXT

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days "$DAYS" -sha256 -extfile server.ext -out server.crt

rm -f server.csr server.ext ca.srl
echo "Generated: ca.crt, ca.key, server.crt, server.key"
