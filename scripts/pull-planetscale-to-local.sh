#!/usr/bin/env bash
set -euo pipefail

: "${PLANETSCALE_DATABASE_URL:?Set PLANETSCALE_DATABASE_URL}"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

docker compose up -d --wait postgres
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marquee" pnpm db:migrate

ca_bundle="/etc/ssl/certs/ca-certificates.crt"
if [[ ! -f "$ca_bundle" ]]; then
  ca_bundle="/etc/ssl/cert.pem"
fi

remote_url="${PLANETSCALE_DATABASE_URL/sslrootcert=system/sslrootcert=\/etc\/ssl\/certs\/system.pem}"
docker run --rm -v "$ca_bundle:/etc/ssl/certs/system.pem:ro" postgres:17 pg_dump "$remote_url" \
  --schema=public --format=custom --data-only --no-owner --no-privileges \
  > "$work_dir/planetscale.dump"

docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d marquee <<'SQL'
SELECT format('TRUNCATE public.%I RESTART IDENTITY CASCADE;', tablename)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
SQL

docker compose exec -T postgres pg_restore -U postgres -d marquee \
  --data-only --no-owner --no-privileges --disable-triggers --single-transaction --exit-on-error \
  < "$work_dir/planetscale.dump"
