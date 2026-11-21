#!/bin/sh
# Rebuilds every database's indexes and records the new collation version.
# Needed once on a volume made by postgres:17.5-alpine (musl), now served by
# the pgvector image (glibc), which sorts text differently. Run from the
# repository root with the stack up: `pnpm infra:reindex`.
set -eu
docker compose exec -T postgres sh -c '
  for db in $(psql -U aether -d aether -Atc "SELECT datname FROM pg_database WHERE datallowconn"); do
    echo "Reindexing $db"
    psql -U aether -d "$db" -v ON_ERROR_STOP=1 \
      -c "REINDEX DATABASE \"$db\"" \
      -c "ALTER DATABASE \"$db\" REFRESH COLLATION VERSION"
  done'
