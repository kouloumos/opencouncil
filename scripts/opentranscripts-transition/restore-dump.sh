#!/usr/bin/env bash
# Restore a pg_dump file of the OpenTranscripts database into an empty database.
#
#   restore-dump.sh DUMP_FILE DATABASE_URL
#
# The production database has the extension vector, which an old migration
# created and which no column uses. The upstream schema does not have it, and a
# PostGIS server without pgvector cannot create it. The restore leaves it out.
# If a column did use it, the restore of that table would fail and stop the
# script.
set -euo pipefail

DUMP=${1:?usage: restore-dump.sh DUMP_FILE DATABASE_URL}
URL=${2:?usage: restore-dump.sh DUMP_FILE DATABASE_URL}

list=$(mktemp)
trap 'rm -f "$list"' EXIT
pg_restore --list "$DUMP" |
    awk '!(($4 == "EXTENSION" && $6 == "vector") || ($4 == "COMMENT" && $6 == "EXTENSION" && $7 == "vector"))' >"$list"
pg_restore --no-owner --no-acl --exit-on-error --use-list="$list" --dbname="$URL" "$DUMP"
