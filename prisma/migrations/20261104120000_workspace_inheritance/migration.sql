-- OpenTranscripts inheritance layer: generic base tables under the council
-- tables.
--
--   Workspace  <- City            (same id)
--   Transcript <- CouncilMeeting  (same (workspaceId, id) = (cityId, id))
--   Speaker    <- Person          (same id)
--
-- The media columns and "released" move from CouncilMeeting to Transcript.
-- SpeakerSegment, TaskStatus, SpeakerTag, VoicePrint and Administers keep
-- their columns; only their foreign keys move to the base tables. A
-- transcript, a speaker or a workspace that is not a meeting, a person or a
-- city therefore has segments, tasks, tags, voiceprints and admins too.
--
-- Every existing row gets its base row, and the checks at the end fail the
-- migration when one is missing. Triggers keep the base rows in step with the
-- council rows from then on (see below).
BEGIN;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "muxPlaybackId" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("workspaceId","id")
);

-- CreateIndex
CREATE INDEX "Speaker_workspaceId_idx" ON "Speaker"("workspaceId");

-- CreateIndex
CREATE INDEX "Transcript_released_idx" ON "Transcript"("released");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_workspaceId_id_key" ON "Transcript"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "CouncilMeeting_cityId_dateTime_idx" ON "CouncilMeeting"("cityId", "dateTime");

-- Backfill the base rows
INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
SELECT "id", "name", "createdAt", "updatedAt"
FROM "City";

-- CouncilMeeting.name is null for new meetings: their title is derived from
-- kind, urgency and session number (src/lib/meetingName.ts). The id stands in.
INSERT INTO "Transcript" ("id", "workspaceId", "name", "videoUrl", "audioUrl", "muxPlaybackId", "released", "createdAt", "updatedAt")
SELECT "id", "cityId", COALESCE("name", "id"), "videoUrl", "audioUrl", "muxPlaybackId", "released", "createdAt", "updatedAt"
FROM "CouncilMeeting";

INSERT INTO "Speaker" ("id", "workspaceId", "name", "image", "createdAt", "updatedAt")
SELECT "id", "cityId", "name", "image", "createdAt", "updatedAt"
FROM "Person";

-- Read "released" from Transcript before the column leaves CouncilMeeting.
-- Same columns in the same order, so CREATE OR REPLACE keeps the grant to
-- notis_reader.
CREATE OR REPLACE VIEW "notis_meeting_events" AS
SELECT
  ts.id              AS "taskId",
  ts.type,
  ts."updatedAt"     AS "completedAt",
  ts."cityId",
  ts."councilMeetingId" AS "meetingId",
  cm.name            AS "meetingName",
  cm."dateTime"      AS "meetingDate",
  t.released,
  ab.name            AS "adminBodyName",
  c.realm::text      AS realm,
  c.language::text   AS language,
  c.timezone,
  cm.kind::text      AS "meetingKind",
  cm."sessionNumber",
  cm.urgent          AS "urgent"
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "Transcript" t ON t."workspaceId" = cm."cityId" AND t.id = cm.id
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded';

-- DropForeignKey
ALTER TABLE "TaskStatus" DROP CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey";

-- DropForeignKey
ALTER TABLE "VoicePrint" DROP CONSTRAINT "VoicePrint_personId_fkey";

-- DropForeignKey
ALTER TABLE "SpeakerTag" DROP CONSTRAINT "SpeakerTag_personId_fkey";

-- DropForeignKey
ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey";

-- DropForeignKey
ALTER TABLE "Administers" DROP CONSTRAINT "Administers_cityId_fkey";

-- DropIndex
DROP INDEX "CouncilMeeting_released_idx";

-- AlterTable
ALTER TABLE "CouncilMeeting" DROP COLUMN "audioUrl",
DROP COLUMN "muxPlaybackId",
DROP COLUMN "released",
DROP COLUMN "videoUrl";

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_id_fkey" FOREIGN KEY ("id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Speaker" ADD CONSTRAINT "Speaker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_id_fkey" FOREIGN KEY ("id") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_cityId_id_fkey" FOREIGN KEY ("cityId", "id") REFERENCES "Transcript"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatus" ADD CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey" FOREIGN KEY ("councilMeetingId", "cityId") REFERENCES "Transcript"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoicePrint" ADD CONSTRAINT "VoicePrint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerTag" ADD CONSTRAINT "SpeakerTag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES "Transcript"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Administers" ADD CONSTRAINT "Administers_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BEGIN base row sync triggers (tests/helpers/test-db.ts replays this block after prisma db push)
-- Keep each base row in step with its council row. Code that writes City,
-- Person and CouncilMeeting (all of upstream OpenCouncil) then needs no
-- change: an insert creates the base row, a rename renames it, and a delete
-- removes it with everything that references it (segments, tasks, tags).
CREATE FUNCTION "city_sync_workspace"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
        VALUES (NEW."id", NEW."name", NEW."createdAt", NEW."updatedAt")
        ON CONFLICT ("id") DO NOTHING;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE "Workspace" SET "name" = NEW."name", "updatedAt" = NEW."updatedAt"
        WHERE "id" = NEW."id" AND "name" IS DISTINCT FROM NEW."name";
        RETURN NEW;
    END IF;
    DELETE FROM "Workspace" WHERE "id" = OLD."id";
    RETURN OLD;
END $$;

CREATE TRIGGER "City_sync_workspace_insert" BEFORE INSERT ON "City"
    FOR EACH ROW EXECUTE FUNCTION "city_sync_workspace"();
CREATE TRIGGER "City_sync_workspace_update" AFTER UPDATE OF "name" ON "City"
    FOR EACH ROW EXECUTE FUNCTION "city_sync_workspace"();
CREATE TRIGGER "City_sync_workspace_delete" AFTER DELETE ON "City"
    FOR EACH ROW EXECUTE FUNCTION "city_sync_workspace"();

CREATE FUNCTION "person_sync_speaker"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "Speaker" ("id", "workspaceId", "name", "image", "createdAt", "updatedAt")
        VALUES (NEW."id", NEW."cityId", NEW."name", NEW."image", NEW."createdAt", NEW."updatedAt")
        ON CONFLICT ("id") DO NOTHING;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE "Speaker"
        SET "workspaceId" = NEW."cityId", "name" = NEW."name", "image" = NEW."image", "updatedAt" = NEW."updatedAt"
        WHERE "id" = NEW."id"
          AND ("workspaceId", "name", "image") IS DISTINCT FROM (NEW."cityId", NEW."name", NEW."image");
        RETURN NEW;
    END IF;
    DELETE FROM "Speaker" WHERE "id" = OLD."id";
    RETURN OLD;
END $$;

CREATE TRIGGER "Person_sync_speaker_insert" BEFORE INSERT ON "Person"
    FOR EACH ROW EXECUTE FUNCTION "person_sync_speaker"();
CREATE TRIGGER "Person_sync_speaker_update" AFTER UPDATE OF "cityId", "name", "image" ON "Person"
    FOR EACH ROW EXECUTE FUNCTION "person_sync_speaker"();
CREATE TRIGGER "Person_sync_speaker_delete" AFTER DELETE ON "Person"
    FOR EACH ROW EXECUTE FUNCTION "person_sync_speaker"();

CREATE FUNCTION "meeting_sync_transcript"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "Transcript" ("id", "workspaceId", "name", "createdAt", "updatedAt")
        VALUES (NEW."id", NEW."cityId", COALESCE(NEW."name", NEW."id"), NEW."createdAt", NEW."updatedAt")
        ON CONFLICT ("workspaceId", "id") DO NOTHING;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE "Transcript" SET "name" = COALESCE(NEW."name", NEW."id"), "updatedAt" = NEW."updatedAt"
        WHERE "workspaceId" = NEW."cityId" AND "id" = NEW."id"
          AND "name" IS DISTINCT FROM COALESCE(NEW."name", NEW."id");
        RETURN NEW;
    END IF;
    DELETE FROM "Transcript" WHERE "workspaceId" = OLD."cityId" AND "id" = OLD."id";
    RETURN OLD;
END $$;

CREATE TRIGGER "CouncilMeeting_sync_transcript_insert" BEFORE INSERT ON "CouncilMeeting"
    FOR EACH ROW EXECUTE FUNCTION "meeting_sync_transcript"();
CREATE TRIGGER "CouncilMeeting_sync_transcript_update" AFTER UPDATE OF "name" ON "CouncilMeeting"
    FOR EACH ROW EXECUTE FUNCTION "meeting_sync_transcript"();
CREATE TRIGGER "CouncilMeeting_sync_transcript_delete" AFTER DELETE ON "CouncilMeeting"
    FOR EACH ROW EXECUTE FUNCTION "meeting_sync_transcript"();
-- END base row sync triggers

-- BEGIN hidden meeting check (tests/integration/meeting-lifecycle-schema.test.ts replays this block)
-- The release state left CouncilMeeting, and its check constraint
-- CouncilMeeting_hidden_by_postponement_not_released left with it: a meeting
-- that the release of a later meeting hid is not public. The rule now spans
-- two tables, so constraint triggers keep it. They are deferred: the
-- lifecycle code changes the meeting and its transcript in one transaction,
-- one statement after the other.
CREATE FUNCTION "meeting_hidden_not_released"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    workspace_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'Transcript' THEN
        workspace_id := NEW."workspaceId";
    ELSE
        workspace_id := NEW."cityId";
    END IF;
    IF EXISTS (
        SELECT 1 FROM "CouncilMeeting" m
        JOIN "Transcript" t ON t."workspaceId" = m."cityId" AND t."id" = m."id"
        WHERE m."cityId" = workspace_id AND m."id" = NEW."id"
          AND m."hiddenByPostponement" AND t."released"
    ) THEN
        RAISE EXCEPTION 'new row for relation "CouncilMeeting" violates check constraint "CouncilMeeting_hidden_by_postponement_not_released"'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'CouncilMeeting_hidden_by_postponement_not_released';
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "CouncilMeeting_hidden_by_postponement_not_released"
    AFTER INSERT OR UPDATE OF "hiddenByPostponement" ON "CouncilMeeting"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "meeting_hidden_not_released"();
CREATE CONSTRAINT TRIGGER "Transcript_released_not_hidden_by_postponement"
    AFTER INSERT OR UPDATE OF "released" ON "Transcript"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "meeting_hidden_not_released"();
-- END hidden meeting check

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "City") <> (SELECT COUNT(*) FROM "Workspace") THEN
        RAISE EXCEPTION 'City and Workspace counts differ';
    END IF;
    IF (SELECT COUNT(*) FROM "CouncilMeeting") <> (SELECT COUNT(*) FROM "Transcript") THEN
        RAISE EXCEPTION 'CouncilMeeting and Transcript counts differ';
    END IF;
    IF (SELECT COUNT(*) FROM "Person") <> (SELECT COUNT(*) FROM "Speaker") THEN
        RAISE EXCEPTION 'Person and Speaker counts differ';
    END IF;
END $$;

COMMIT;
