#!/usr/bin/env bash
# Move the OpenTranscripts database from the old opentranscripts branch to the
# rebased branch, on a copy. The source database is only read.
#
#   transition.sh SOURCE_DATABASE_URL TARGET_DATABASE_URL [REFERENCE_DATABASE_URL]
#
# SOURCE  the live database of the old version. pg_dump reads it; nothing
#         writes to it. Stop the old app first, so that no write lands after
#         the dump.
# TARGET  an empty database on a PostgreSQL 16 server with PostGIS. The new
#         version runs on it after the cutover.
# REFERENCE (optional) an empty scratch database. With it, the script checks
#         that step 1 produced exactly the upstream schema it should have.
#
# Steps:
#   0. pg_dump SOURCE to a file. The file is also the backup of the old version.
#   1. pg_restore into TARGET, and run 1-unfork.sql there.
#   2. prisma migrate deploy on TARGET (the migrations of this branch).
#   3. 3-restore.sql on TARGET.
#   4. verify.sh SOURCE TARGET.
#
# Run it from the root of the repository, on the commit you deploy. Any error
# stops the script. SOURCE stays as it was in every case.
#
# Dry run: run the script while the old version is live, into a scratch
# TARGET. Nothing changes for the users. Read the verify output. Drop TARGET.
#
# Cutover:
#   1. Stop the old app, so that nothing writes to SOURCE.
#   2. Run this script into a new, empty TARGET. Stop if it fails.
#   3. Deploy the new version with DATABASE_URL and DIRECT_URL set to TARGET.
#   4. Check the app: a workspace, a transcript, playback, an export.
#
# Rollback: stop the new app, deploy the old commit with DATABASE_URL and
# DIRECT_URL set to SOURCE again. SOURCE has every row it had at step 1. The
# rows written to TARGET after the cutover are not in SOURCE, so decide on a
# rollback early, before the users write much.
set -euo pipefail

SOURCE_URL=${1:?usage: transition.sh SOURCE_DATABASE_URL TARGET_DATABASE_URL [REFERENCE_DATABASE_URL]}
TARGET_URL=${2:?usage: transition.sh SOURCE_DATABASE_URL TARGET_DATABASE_URL [REFERENCE_DATABASE_URL]}
REFERENCE_URL=${3:-}
DIR=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP=${DUMP_FILE:-opentranscripts-before-transition-$STAMP.dump}

table_count() {
    psql "$1" -X -At -v ON_ERROR_STOP=1 -c \
        "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'tiger', 'tiger_data', 'topology') AND tablename <> 'spatial_ref_sys'"
}

if [[ "$(table_count "$TARGET_URL")" != "0" ]]; then
    echo "TARGET is not empty. Use a new, empty database." >&2
    exit 1
fi
if [[ -n "$REFERENCE_URL" && "$(table_count "$REFERENCE_URL")" != "0" ]]; then
    echo "REFERENCE is not empty. Use a new, empty database." >&2
    exit 1
fi

echo "== 0. Dump the source database to $DUMP"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP" "$SOURCE_URL"
echo "   $(du -h "$DUMP" | cut -f1). Keep this file until the new version has run for a while."

echo "== 1. Restore into the target and undo the old fork migrations"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$TARGET_URL" "$DUMP"
psql "$TARGET_URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/1-unfork.sql"

if [[ -n "$REFERENCE_URL" ]]; then
    echo "   Compare with the upstream migrations that the target has applied"
    ref_dir=$(mktemp -d)
    mkdir -p "$ref_dir/migrations"
    cp prisma/schema.prisma "$ref_dir/schema.prisma"
    cp prisma/migrations/migration_lock.toml "$ref_dir/migrations/"
    psql "$TARGET_URL" -X -At -v ON_ERROR_STOP=1 -c \
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" |
    while read -r name; do
        if [[ ! -d "prisma/migrations/$name" ]]; then
            echo "   The target has migration $name, which this branch does not have." >&2
            exit 1
        fi
        cp -r "prisma/migrations/$name" "$ref_dir/migrations/"
    done
    psql "$REFERENCE_URL" -X -q -c 'CREATE EXTENSION IF NOT EXISTS postgis'
    DATABASE_URL="$REFERENCE_URL" DIRECT_URL="$REFERENCE_URL" npx prisma migrate deploy --schema "$ref_dir/schema.prisma" >/dev/null
    diff_out=$(npx prisma migrate diff --from-url "$TARGET_URL" --to-url "$REFERENCE_URL" --script)
    if ! grep -q 'This is an empty migration' <<<"$diff_out"; then
        echo "   The target differs from the upstream schema:" >&2
        echo "$diff_out" >&2
        exit 1
    fi
    rm -rf "$ref_dir"
    echo "   The schema matches the upstream migrations exactly."
fi

echo "== 2. Apply the migrations of this branch"
DATABASE_URL="$TARGET_URL" DIRECT_URL="$TARGET_URL" npx prisma migrate deploy

echo "== 3. Restore the OpenTranscripts rows"
psql "$TARGET_URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/3-restore.sql"

echo "== 4. Compare the source with the target"
"$DIR/verify.sh" "$SOURCE_URL" "$TARGET_URL"

echo
echo "Done. Point the new version at TARGET. Keep SOURCE and $DUMP for the rollback."
