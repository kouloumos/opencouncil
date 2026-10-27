#!/usr/bin/env bash
# Compare the old OpenTranscripts database with the result of the transition.
#
#   verify.sh OLD_DATABASE_URL NEW_DATABASE_URL
#
# For each kind of data, the script runs one query on the old schema and the
# matching query on the new schema. Each query returns a row count and an md5
# of the rows in a fixed order. The script prints both and marks a mismatch.
# It only reads. It exits with 1 when a check does not match.
#
# After the content checks it compares the row count of every table that
# exists in both schemas. Upstream migrations change some tables on purpose
# (for example they split an admin row with two scopes), so a count
# difference there is a prompt to look, and does not fail the run.
set -euo pipefail

OLD_URL=${1:?usage: verify.sh OLD_DATABASE_URL NEW_DATABASE_URL}
NEW_URL=${2:?usage: verify.sh OLD_DATABASE_URL NEW_DATABASE_URL}

fingerprint() {
    # $1 database URL, $2 a query with the columns to hash; ordered by its first column.
    psql "$1" -X -At -v ON_ERROR_STOP=1 -c \
        "SELECT count(*) || ' ' || coalesce(md5(string_agg(r::text, '|' ORDER BY r::text)), '-') FROM ($2) r"
}

failures=0
check() {
    local name=$1 old_query=$2 new_query=$3
    local old new
    old=$(fingerprint "$OLD_URL" "$old_query")
    new=$(fingerprint "$NEW_URL" "$new_query")
    if [[ "$old" == "$new" ]]; then
        printf '  ok        %-28s %s\n' "$name" "$old"
    else
        printf '  MISMATCH  %-28s old %s  new %s\n' "$name" "$old" "$new"
        failures=$((failures + 1))
    fi
}

echo "Content checks (count and md5 of the rows):"

# Workspaces, transcripts and speakers: every row, with the fields both schemas share.
check "Workspace ids" \
    'SELECT id FROM "Workspace"' \
    'SELECT id FROM "Workspace"'
check "Workspace (not a city)" \
    'SELECT w.id, w.name, w."createdAt" FROM "Workspace" w WHERE NOT EXISTS (SELECT 1 FROM "City" c WHERE c.id = w.id)' \
    'SELECT w.id, w.name, w."createdAt" FROM "Workspace" w WHERE NOT EXISTS (SELECT 1 FROM "City" c WHERE c.id = w.id)'
check "Transcript media/release" \
    'SELECT "workspaceId", id, "videoUrl", "audioUrl", "muxPlaybackId", released FROM "Transcript"' \
    'SELECT "workspaceId", id, "videoUrl", "audioUrl", "muxPlaybackId", released FROM "Transcript"'
check "Transcript (not a meeting)" \
    'SELECT t."workspaceId", t.id, t.name, t."createdAt", t."updatedAt" FROM "Transcript" t WHERE NOT EXISTS (SELECT 1 FROM "CouncilMeeting" cm WHERE cm."cityId" = t."workspaceId" AND cm.id = t.id)' \
    'SELECT t."workspaceId", t.id, t.name, t."createdAt", t."updatedAt" FROM "Transcript" t WHERE NOT EXISTS (SELECT 1 FROM "CouncilMeeting" cm WHERE cm."cityId" = t."workspaceId" AND cm.id = t.id)'
check "Speaker" \
    'SELECT id, "workspaceId", name, image FROM "Speaker"' \
    'SELECT id, "workspaceId", name, image FROM "Speaker"'
check "Person image" \
    'SELECT p.id, s.image FROM "Person" p JOIN "Speaker" s ON s.id = p.id' \
    'SELECT id, image FROM "Person"'

# The transcript content.
check "SpeakerTag" \
    'SELECT id, label, "speakerId", "createdAt", "updatedAt" FROM "SpeakerTag"' \
    'SELECT id, label, "personId", "createdAt", "updatedAt" FROM "SpeakerTag"'
check "SpeakerSegment" \
    'SELECT id, "startTimestamp", "endTimestamp", "transcriptId", "workspaceId", "speakerTagId" FROM "SpeakerSegment"' \
    'SELECT id, "startTimestamp", "endTimestamp", "meetingId", "cityId", "speakerTagId" FROM "SpeakerSegment"'
check "Utterance" \
    'SELECT id, "startTimestamp", "endTimestamp", text, "speakerSegmentId", drift, uncertain, "lastModifiedBy"::text FROM "Utterance"' \
    'SELECT id, "startTimestamp", "endTimestamp", text, "speakerSegmentId", drift, uncertain, "lastModifiedBy"::text FROM "Utterance"'
check "Word" \
    'SELECT id, text, "startTimestamp", "endTimestamp", confidence, "utteranceId" FROM "Word"' \
    'SELECT id, text, "startTimestamp", "endTimestamp", confidence, "utteranceId" FROM "Word"'
check "UtteranceEdit" \
    'SELECT id, "utteranceId", "beforeText", "afterText", "editedBy"::text, "userId" FROM "UtteranceEdit"' \
    'SELECT id, "utteranceId", "beforeText", "afterText", "editedBy"::text, "userId" FROM "UtteranceEdit"'
check "Summary" \
    'SELECT id, text, "speakerSegmentId", type::text FROM "Summary"' \
    'SELECT id, text, "speakerSegmentId", type::text FROM "Summary"'
check "TopicLabel" \
    'SELECT id, "speakerSegmentId", "topicId" FROM "TopicLabel"' \
    'SELECT id, "speakerSegmentId", "topicId" FROM "TopicLabel"'
check "VoicePrint" \
    'SELECT id, embedding, "sourceAudioUrl", "startTimestamp", "endTimestamp", "speakerId", "sourceSegmentId" FROM "VoicePrint"' \
    'SELECT id, embedding, "sourceAudioUrl", "startTimestamp", "endTimestamp", "personId", "sourceSegmentId" FROM "VoicePrint"'
check "TaskStatus" \
    'SELECT id, status, type, stage, "percentComplete", "requestBody", "responseBody", version, "transcriptId", "workspaceId", "createdAt", "updatedAt" FROM "TaskStatus"' \
    'SELECT id, status, type, stage, "percentComplete", "requestBody", "responseBody", version, "councilMeetingId", "cityId", "createdAt", "updatedAt" FROM "TaskStatus"'

# Council data and accounts.
check "CouncilMeeting" \
    'SELECT "cityId", id, "dateTime", "youtubeUrl", "agendaUrl", "administrativeBodyId" FROM "CouncilMeeting"' \
    'SELECT "cityId", id, "dateTime", "youtubeUrl", "agendaUrl", "administrativeBodyId" FROM "CouncilMeeting"'
check "Person" \
    'SELECT id, "cityId", name, name_en FROM "Person"' \
    'SELECT id, "cityId", name, name_en FROM "Person"'
check "City" \
    'SELECT id, name, name_en, timezone FROM "City"' \
    'SELECT id, name, name_en, timezone FROM "City"'
check "User" \
    'SELECT id, email, name, "isSuperAdmin" FROM "User"' \
    'SELECT id, email, name, "isSuperAdmin" FROM "User"'
check "Administers (scope)" \
    'SELECT id, "userId", coalesce("cityId", "workspaceId"), "partyId", "personId" FROM "Administers"' \
    'SELECT id, "userId", "cityId", "partyId", "personId" FROM "Administers"'
check "Offer (kept in ot_stash)" \
    'SELECT * FROM "Offer"' \
    'SELECT * FROM ot_stash."Offer"'

echo
echo "Row counts of the tables in both schemas (a difference is a prompt to look):"
counts() {
    psql "$1" -X -At -F' ' -v ON_ERROR_STOP=1 -c "
        SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
        ORDER BY 1"
}
join -j1 <(counts "$OLD_URL" | sort) <(counts "$NEW_URL" | sort) | while read -r table old new; do
    if [[ "$old" == "$new" ]]; then
        printf '  same      %-36s %s\n' "$table" "$old"
    else
        printf '  differs   %-36s old %s  new %s\n' "$table" "$old" "$new"
    fi
done

echo
if [[ $failures -gt 0 ]]; then
    echo "$failures content check(s) do not match."
    exit 1
fi
echo "All content checks match."
