-- OpenTranscripts transition, step 1 of 3: undo the old fork migrations.
--
-- Run this on a COPY of the OpenTranscripts database, never on the live one
-- (transition.sh makes the copy). It turns a database at the schema of the
-- old opentranscripts branch back into the upstream schema that branch was
-- built on, so that `prisma migrate deploy` of the new branch can run.
--
-- The old fork migrations (20251017052335_inheritance_architecture and
-- 20260202000000_simplify_offers_model) renamed and moved columns. The new
-- branch keeps the upstream names, so its migrations do not apply on top of
-- them. This script:
--
--   1. checks that the database is in the expected state, and stops if not;
--   2. moves every row that only OpenTranscripts has (workspaces that are not
--      cities, transcripts that are not meetings, speakers that are not
--      persons, and everything that hangs off them) into the schema ot_stash;
--   3. proves that the delete removed those rows and no other row;
--   4. restores the upstream columns, constraints and indexes;
--   5. removes the two fork migrations from _prisma_migrations.
--
-- 3-restore.sql puts the ot_stash rows back after the new migrations ran.
-- ot_stash stays in the database afterwards, as the record of what moved.
-- Everything runs in one transaction: an error leaves the copy unchanged.

\set ON_ERROR_STOP on
BEGIN;

-- ============================================================
-- 1. Preconditions
-- ============================================================
DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM _prisma_migrations
    WHERE migration_name IN ('20251017052335_inheritance_architecture', '20260202000000_simplify_offers_model')
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
    IF n <> 2 THEN
        RAISE EXCEPTION 'Expected both old fork migrations to be applied, found %', n;
    END IF;

    SELECT count(*) INTO n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION '% migration(s) are failed or unfinished. Resolve them first.', n;
    END IF;

    SELECT count(*) INTO n FROM information_schema.columns
    WHERE table_schema = 'public' AND (table_name, column_name) IN (
        ('TaskStatus', 'transcriptId'), ('TaskStatus', 'workspaceId'),
        ('SpeakerSegment', 'transcriptId'), ('SpeakerSegment', 'workspaceId'),
        ('SpeakerTag', 'speakerId'), ('VoicePrint', 'speakerId'),
        ('Administers', 'workspaceId'), ('Offer', 'workspaceId'));
    IF n <> 8 THEN
        RAISE EXCEPTION 'The database does not have the columns of the old fork schema (% of 8 found)', n;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'ot_stash') THEN
        RAISE EXCEPTION 'Schema ot_stash exists already. This script runs once, on a fresh copy.';
    END IF;

    -- An admin row that names a city in one column and another workspace in
    -- the other has no single meaning.
    SELECT count(*) INTO n FROM "Administers"
    WHERE "cityId" IS NOT NULL AND "workspaceId" IS NOT NULL AND "cityId" <> "workspaceId";
    IF n > 0 THEN
        RAISE EXCEPTION '% Administers row(s) name a different city and workspace', n;
    END IF;
END $$;

-- ============================================================
-- 2. The rows that only OpenTranscripts has
-- ============================================================
CREATE TEMP TABLE g_workspace ON COMMIT DROP AS
    SELECT w.id FROM "Workspace" w WHERE NOT EXISTS (SELECT 1 FROM "City" c WHERE c.id = w.id);
CREATE TEMP TABLE g_transcript ON COMMIT DROP AS
    SELECT t."workspaceId", t.id FROM "Transcript" t
    WHERE NOT EXISTS (SELECT 1 FROM "CouncilMeeting" cm WHERE cm."cityId" = t."workspaceId" AND cm.id = t.id);
CREATE TEMP TABLE g_speaker ON COMMIT DROP AS
    SELECT s.id FROM "Speaker" s WHERE NOT EXISTS (SELECT 1 FROM "Person" p WHERE p.id = s.id);
CREATE TEMP TABLE g_segment ON COMMIT DROP AS
    SELECT ss.id, ss."speakerTagId" FROM "SpeakerSegment" ss
    JOIN g_transcript t ON t."workspaceId" = ss."workspaceId" AND t.id = ss."transcriptId";
CREATE TEMP TABLE g_tag ON COMMIT DROP AS
    SELECT st.id FROM "SpeakerTag" st
    WHERE st.id IN (SELECT "speakerTagId" FROM g_segment) OR st."speakerId" IN (SELECT id FROM g_speaker);
CREATE TEMP TABLE g_utterance ON COMMIT DROP AS
    SELECT u.id FROM "Utterance" u WHERE u."speakerSegmentId" IN (SELECT id FROM g_segment);

DO $$
DECLARE
    n integer;
BEGIN
    -- A tag shared with a meeting segment cannot move: deleting it would
    -- cascade to the meeting.
    SELECT count(*) INTO n FROM "SpeakerSegment" ss
    WHERE ss."speakerTagId" IN (SELECT id FROM g_tag) AND ss.id NOT IN (SELECT id FROM g_segment);
    IF n > 0 THEN
        RAISE EXCEPTION '% meeting segment(s) use a speaker tag of an OpenTranscripts transcript or speaker', n;
    END IF;

    -- These tables hold meeting data only (subjects, highlights, podcasts).
    SELECT count(*) INTO n FROM "SubjectSpeakerSegment" WHERE "speakerSegmentId" IN (SELECT id FROM g_segment);
    IF n > 0 THEN RAISE EXCEPTION '% SubjectSpeakerSegment row(s) point to an OpenTranscripts segment', n; END IF;
    SELECT count(*) INTO n FROM "HighlightedUtterance" WHERE "utteranceId" IN (SELECT id FROM g_utterance);
    IF n > 0 THEN RAISE EXCEPTION '% HighlightedUtterance row(s) point to an OpenTranscripts utterance', n; END IF;
    SELECT count(*) INTO n FROM "PodcastPartAudioUtterance" WHERE "utteranceId" IN (SELECT id FROM g_utterance);
    IF n > 0 THEN RAISE EXCEPTION '% PodcastPartAudioUtterance row(s) point to an OpenTranscripts utterance', n; END IF;

    -- After the undo, an admin row names a city or nothing. A row for a
    -- generic workspace moves; a row for a city keeps its city.
    SELECT count(*) INTO n FROM "Administers"
    WHERE "workspaceId" IN (SELECT id FROM g_workspace) AND ("partyId" IS NOT NULL OR "personId" IS NOT NULL);
    IF n > 0 THEN RAISE EXCEPTION '% Administers row(s) combine a workspace with a party or person', n; END IF;
END $$;

-- ============================================================
-- 3. Stash, and record the row count of every table
-- ============================================================
CREATE SCHEMA ot_stash;

CREATE TABLE ot_stash."Workspace" AS SELECT * FROM "Workspace" WHERE id IN (SELECT id FROM g_workspace);
CREATE TABLE ot_stash."Transcript" AS SELECT t.* FROM "Transcript" t
    JOIN g_transcript g ON g."workspaceId" = t."workspaceId" AND g.id = t.id;
CREATE TABLE ot_stash."Speaker" AS SELECT * FROM "Speaker" WHERE id IN (SELECT id FROM g_speaker);
CREATE TABLE ot_stash."SpeakerTag" AS SELECT * FROM "SpeakerTag" WHERE id IN (SELECT id FROM g_tag);
CREATE TABLE ot_stash."SpeakerSegment" AS SELECT * FROM "SpeakerSegment" WHERE id IN (SELECT id FROM g_segment);
CREATE TABLE ot_stash."Utterance" AS SELECT * FROM "Utterance" WHERE id IN (SELECT id FROM g_utterance);
CREATE TABLE ot_stash."Word" AS SELECT * FROM "Word" WHERE "utteranceId" IN (SELECT id FROM g_utterance);
CREATE TABLE ot_stash."UtteranceEdit" AS SELECT * FROM "UtteranceEdit" WHERE "utteranceId" IN (SELECT id FROM g_utterance);
CREATE TABLE ot_stash."Summary" AS SELECT * FROM "Summary" WHERE "speakerSegmentId" IN (SELECT id FROM g_segment);
CREATE TABLE ot_stash."TopicLabel" AS SELECT * FROM "TopicLabel" WHERE "speakerSegmentId" IN (SELECT id FROM g_segment);
CREATE TABLE ot_stash."VoicePrint" AS SELECT * FROM "VoicePrint"
    WHERE "speakerId" IN (SELECT id FROM g_speaker) OR "sourceSegmentId" IN (SELECT id FROM g_segment);
CREATE TABLE ot_stash."TaskStatus" AS SELECT ts.* FROM "TaskStatus" ts
    JOIN g_transcript g ON g."workspaceId" = ts."workspaceId" AND g.id = ts."transcriptId";
CREATE TABLE ot_stash."Administers" AS SELECT * FROM "Administers" WHERE "workspaceId" IN (SELECT id FROM g_workspace);
-- Offers change shape completely; see 3-restore.sql.
CREATE TABLE ot_stash."Offer" AS SELECT * FROM "Offer";

CREATE FUNCTION pg_temp.table_counts() RETURNS TABLE (table_name text, n bigint) LANGUAGE plpgsql AS $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
             WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'
    LOOP
        table_name := t;
        EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
        RETURN NEXT;
    END LOOP;
END $$;

CREATE TEMP TABLE counts_before ON COMMIT DROP AS SELECT * FROM pg_temp.table_counts();

-- ============================================================
-- 4. Delete the stashed rows
-- ============================================================
-- The transcripts cascade to their segments, utterances, words, edits,
-- summaries, topic labels, voiceprints sourced from them, and tasks.
DELETE FROM "Transcript" t USING g_transcript g WHERE g."workspaceId" = t."workspaceId" AND g.id = t.id;
DELETE FROM "SpeakerTag" WHERE id IN (SELECT id FROM g_tag);
DELETE FROM "VoicePrint" WHERE "speakerId" IN (SELECT id FROM g_speaker);
DELETE FROM "Speaker" WHERE id IN (SELECT id FROM g_speaker);
DELETE FROM "Administers" WHERE "workspaceId" IN (SELECT id FROM g_workspace);
DELETE FROM "Workspace" WHERE id IN (SELECT id FROM g_workspace);
DELETE FROM "Offer";

-- The delete must have removed exactly the stashed rows. A cascade into any
-- other row fails the transaction here.
DO $$
DECLARE
    r record;
    stashed bigint;
BEGIN
    FOR r IN SELECT b.table_name, b.n AS before, a.n AS after
             FROM counts_before b JOIN pg_temp.table_counts() a USING (table_name)
    LOOP
        IF to_regclass(format('ot_stash.%I', r.table_name)) IS NULL THEN
            stashed := 0;
        ELSE
            EXECUTE format('SELECT count(*) FROM ot_stash.%I', r.table_name) INTO stashed;
        END IF;
        IF r.before - r.after <> stashed THEN
            RAISE EXCEPTION 'Table %: % rows deleted, % rows stashed', r.table_name, r.before - r.after, stashed;
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 5. Restore the upstream schema
-- ============================================================

-- City: no longer a child of Workspace.
ALTER TABLE "City" DROP CONSTRAINT "City_workspace_fkey";

-- CouncilMeeting: the old fork migration left the media and release columns
-- in place, but the old app read and wrote them on Transcript only. The
-- columns hold the values of the day of the fork; Transcript holds the
-- current ones.
UPDATE "CouncilMeeting" cm
SET "videoUrl" = t."videoUrl", "audioUrl" = t."audioUrl", "released" = t."released", "muxPlaybackId" = t."muxPlaybackId"
FROM "Transcript" t
WHERE t."workspaceId" = cm."cityId" AND t.id = cm.id;
ALTER TABLE "CouncilMeeting" DROP CONSTRAINT "CouncilMeeting_transcript_fkey";

-- Person: the image comes back from Speaker.
ALTER TABLE "Person" ADD COLUMN "image" TEXT;
UPDATE "Person" p SET "image" = s."image" FROM "Speaker" s WHERE s.id = p.id;
ALTER TABLE "Person" DROP CONSTRAINT "Person_speaker_fkey";

-- TaskStatus
ALTER TABLE "TaskStatus" ADD COLUMN "councilMeetingId" TEXT, ADD COLUMN "cityId" TEXT;
UPDATE "TaskStatus" SET "councilMeetingId" = "transcriptId", "cityId" = "workspaceId";
ALTER TABLE "TaskStatus" ALTER COLUMN "councilMeetingId" SET NOT NULL, ALTER COLUMN "cityId" SET NOT NULL;
ALTER TABLE "TaskStatus" DROP CONSTRAINT "TaskStatus_transcript_fkey";
DROP INDEX "TaskStatus_transcriptId_workspaceId_idx";
ALTER TABLE "TaskStatus" DROP COLUMN "transcriptId", DROP COLUMN "workspaceId";
ALTER TABLE "TaskStatus" ADD CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey"
    FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "CouncilMeeting"(id, "cityId") ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "TaskStatus_councilMeetingId_cityId_idx" ON "TaskStatus"("councilMeetingId", "cityId");

-- SpeakerSegment
ALTER TABLE "SpeakerSegment" ADD COLUMN "meetingId" TEXT, ADD COLUMN "cityId" TEXT;
UPDATE "SpeakerSegment" SET "meetingId" = "transcriptId", "cityId" = "workspaceId";
ALTER TABLE "SpeakerSegment" ALTER COLUMN "meetingId" SET NOT NULL, ALTER COLUMN "cityId" SET NOT NULL;
ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_transcript_fkey";
ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_speakerTag_fkey";
DROP INDEX "SpeakerSegment_transcriptId_workspaceId_idx";
DROP INDEX "SpeakerSegment_transcriptId_workspaceId_startTimestamp_idx";
ALTER TABLE "SpeakerSegment" DROP COLUMN "transcriptId", DROP COLUMN "workspaceId";
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey"
    FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting"(id, "cityId") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_speakerTagId_fkey"
    FOREIGN KEY ("speakerTagId") REFERENCES "SpeakerTag"(id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "SpeakerSegment_meetingId_cityId_startTimestamp_idx" ON "SpeakerSegment"("meetingId", "cityId", "startTimestamp");

-- SpeakerTag
ALTER TABLE "SpeakerTag" DROP CONSTRAINT "SpeakerTag_speaker_fkey";
ALTER TABLE "SpeakerTag" RENAME COLUMN "speakerId" TO "personId";
ALTER TABLE "SpeakerTag" ADD CONSTRAINT "SpeakerTag_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- VoicePrint
ALTER TABLE "VoicePrint" DROP CONSTRAINT "VoicePrint_speaker_fkey";
ALTER TABLE "VoicePrint" RENAME COLUMN "speakerId" TO "personId";
ALTER TABLE "VoicePrint" ADD CONSTRAINT "VoicePrint_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Administers: a city admin row may carry its city in workspaceId only.
UPDATE "Administers" SET "cityId" = "workspaceId" WHERE "cityId" IS NULL AND "workspaceId" IS NOT NULL;
ALTER TABLE "Administers" DROP CONSTRAINT "Administers_workspace_fkey";
DROP INDEX "Administers_userId_workspaceId_partyId_personId_key";
ALTER TABLE "Administers" DROP COLUMN "workspaceId";
CREATE UNIQUE INDEX "Administers_userId_cityId_partyId_personId_key" ON "Administers"("userId", "cityId", "partyId", "personId");

-- Offer: empty now (every row is in ot_stash), so the columns come back as they were.
ALTER TABLE "Offer" DROP COLUMN "workspaceId";
ALTER TABLE "Offer"
    ADD COLUMN "platformPrice" DOUBLE PRECISION NOT NULL,
    ADD COLUMN "cityId" TEXT,
    ADD COLUMN "correctnessGuarantee" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "meetingsToIngest" INTEGER,
    ADD COLUMN "hoursToGuarantee" INTEGER,
    ADD COLUMN "equipmentRentalDescription" TEXT,
    ADD COLUMN "equipmentRentalName" TEXT,
    ADD COLUMN "equipmentRentalPrice" DOUBLE PRECISION,
    ADD COLUMN "physicalPresenceHours" INTEGER;
ALTER TABLE "Offer" ALTER COLUMN "startDate" SET NOT NULL, ALTER COLUMN "endDate" SET NOT NULL;

-- The base tables, now empty of anything that is not a city, meeting or person.
DROP TABLE "Transcript";
DROP TABLE "Speaker";
DROP TABLE "Workspace";

DELETE FROM _prisma_migrations
WHERE migration_name IN ('20251017052335_inheritance_architecture', '20260202000000_simplify_offers_model');

COMMIT;
