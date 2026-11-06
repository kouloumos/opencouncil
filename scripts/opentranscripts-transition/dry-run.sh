#!/usr/bin/env bash
# Rehearse the OpenTranscripts transition on a copy of production, while the
# old version stays live. Production is read once, by pg_dump, and nothing
# else touches it.
#
#   dry-run.sh PRODUCTION_DATABASE_URL LOCAL_SERVER_URL
#
# LOCAL_SERVER_URL  a PostgreSQL 16 server with PostGIS where the user may
#                   create databases, for example a throwaway container:
#                     docker run -d --name ot-dry -e POSTGRES_PASSWORD=pw -p 55433:5432 postgis/postgis:16-3.5
#                     LOCAL_SERVER_URL=postgresql://postgres:pw@localhost:55433/postgres
#
# The script creates three databases on that server: ot_dry_snapshot (the
# production dump, restored), ot_dry_target (the result) and ot_dry_reference
# (the schema check). It stops if any of them exists already. It compares the
# result with the snapshot, so writes on production during the run do not show
# as differences. The output names tables and holds row counts and md5 hashes
# only, no row content. It is also saved to a log file next to the dump.
#
# Run it from the root of the repository, on the commit you will deploy, with
# its dependencies installed (npm ci). pg_dump must be the major version of the
# production server or newer.
set -euo pipefail

PROD_URL=${1:?usage: dry-run.sh PRODUCTION_DATABASE_URL LOCAL_SERVER_URL}
SERVER_URL=${2:?usage: dry-run.sh PRODUCTION_DATABASE_URL LOCAL_SERVER_URL}
DIR=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="opentranscripts-dry-run-$STAMP.dump"
LOG="opentranscripts-dry-run-$STAMP.log"

# The URL of a database on the local server: the server URL with its database name replaced.
db_url() {
    python3 -c 'import sys, urllib.parse as u; p = u.urlsplit(sys.argv[1]); print(u.urlunsplit(p._replace(path="/" + sys.argv[2])))' "$SERVER_URL" "$1"
}

for db in ot_dry_snapshot ot_dry_target ot_dry_reference; do
    if [[ -n "$(psql "$SERVER_URL" -X -At -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]]; then
        echo "Database $db exists on the local server. Drop it or use another server." >&2
        exit 1
    fi
done

{
    echo "== Dump production to $DUMP (read only)"
    pg_dump --format=custom --no-owner --no-acl --file="$DUMP" "$PROD_URL"
    echo "   $(du -h "$DUMP" | cut -f1)"

    echo "== Create the local databases"
    for db in ot_dry_snapshot ot_dry_target ot_dry_reference; do
        psql "$SERVER_URL" -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db"
    done
    "$DIR/restore-dump.sh" "$DUMP" "$(db_url ot_dry_snapshot)"

    echo "== Production at a glance"
    psql "$(db_url ot_dry_snapshot)" -X -At -F': ' -v ON_ERROR_STOP=1 -c "
        SELECT 'cities', count(*) FROM \"City\" UNION ALL
        SELECT 'workspaces', count(*) FROM \"Workspace\" UNION ALL
        SELECT 'transcripts', count(*) FROM \"Transcript\" UNION ALL
        SELECT 'users', count(*) FROM \"User\" UNION ALL
        SELECT 'offers', count(*) FROM \"Offer\""
    psql "$(db_url ot_dry_snapshot)" -X -At -v ON_ERROR_STOP=1 -c "
        SELECT 'migration ' || migration_name || CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN ' (FAILED)' ELSE '' END
        FROM _prisma_migrations WHERE migration_name > '20251001' ORDER BY migration_name"

    echo
    DUMP_FILE="ot_dry_snapshot-$STAMP.dump" "$DIR/transition.sh" \
        "$(db_url ot_dry_snapshot)" "$(db_url ot_dry_target)" "$(db_url ot_dry_reference)"
} 2>&1 | tee "$LOG"

echo
echo "Saved to $LOG. The three ot_dry_* databases stay for a look; drop them when done."
