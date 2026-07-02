#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:=beauty-saas-$(date +%Y%m%d%H%M%S).dump}"

pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"
echo "Wrote $BACKUP_FILE"
