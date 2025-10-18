-- ============================================
-- OpenTranscripts Inheritance Migration
-- ============================================
--
-- This migration implements:
-- 1. Workspace → City (same ID, explicit FK)
-- 2. Transcript → CouncilMeeting (uses existing id, explicit FK)
-- 3. Speaker → Person (simple keys, explicit FK)
--
-- CRITICAL: This is an ADDITIVE migration
-- - Adds new tables (Workspace, Transcript, Speaker)
-- - Populates them from existing data
-- - Updates relations to point to new base tables
-- - Adds explicit FKs to enforce inheritance
-- - NO column renames (keeps existing naming)
-- - NO PK changes on CouncilMeeting (keeps [cityId, id])
-- - Person uses simple keys (no composite)
--
-- WARNING: Back up your database before running!
-- ============================================

BEGIN;

-- ============================================
-- PHASE 1: Create Base Tables
-- ============================================

-- 1.1: Create Workspace table
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- 1.2: Create Transcript table
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

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("workspaceId", "id"),
    CONSTRAINT "Transcript_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Transcript_workspaceId_id_key" ON "Transcript"("workspaceId", "id");
CREATE INDEX "Transcript_released_idx" ON "Transcript"("released");

-- 1.3: Create Speaker table (simple key!)
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Speaker_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Speaker_workspaceId_idx" ON "Speaker"("workspaceId");

DO $$ BEGIN
    RAISE NOTICE 'Phase 1 Complete: Created base tables (Workspace, Transcript, Speaker)';
END $$;

-- ============================================
-- PHASE 2: Populate Workspace from City
-- ============================================

INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
SELECT 
    "id",
    "name",
    "createdAt",
    "updatedAt"
FROM "City";

-- Verification
DO $$
DECLARE
    city_count INTEGER;
    workspace_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO city_count FROM "City";
    SELECT COUNT(*) INTO workspace_count FROM "Workspace";
    
    IF city_count != workspace_count THEN
        RAISE EXCEPTION 'Workspace population failed: City count (%) != Workspace count (%)', 
            city_count, workspace_count;
    END IF;
    
    RAISE NOTICE 'Phase 2 Complete: % workspaces created from cities', workspace_count;
END $$;

-- ============================================
-- PHASE 3: Populate Transcript from CouncilMeeting
-- ============================================

INSERT INTO "Transcript" ("id", "workspaceId", "name", "videoUrl", "audioUrl", "muxPlaybackId", "released", "createdAt", "updatedAt")
SELECT 
    "id",
    "cityId" as "workspaceId",
    "name",
    "videoUrl",
    "audioUrl",
    "muxPlaybackId",
    "released",
    "createdAt",
    "updatedAt"
FROM "CouncilMeeting";

-- Verification
DO $$
DECLARE
    meeting_count INTEGER;
    transcript_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO meeting_count FROM "CouncilMeeting";
    SELECT COUNT(*) INTO transcript_count FROM "Transcript";
    
    IF meeting_count != transcript_count THEN
        RAISE EXCEPTION 'Transcript population failed: CouncilMeeting count (%) != Transcript count (%)', 
            meeting_count, transcript_count;
    END IF;
    
    RAISE NOTICE 'Phase 3 Complete: % transcripts created from council meetings', transcript_count;
END $$;

-- ============================================
-- PHASE 4: Populate Speaker from Person
-- ============================================

INSERT INTO "Speaker" ("id", "workspaceId", "name", "image", "createdAt", "updatedAt")
SELECT 
    "id",  -- Use same ID as Person!
    "cityId" as "workspaceId",
    "name",
    "image",
    "createdAt",
    "updatedAt"
FROM "Person";

-- Verification
DO $$
DECLARE
    person_count INTEGER;
    speaker_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO person_count FROM "Person";
    SELECT COUNT(*) INTO speaker_count FROM "Speaker";
    
    IF person_count != speaker_count THEN
        RAISE EXCEPTION 'Speaker population failed: Person count (%) != Speaker count (%)', 
            person_count, speaker_count;
    END IF;
    
    RAISE NOTICE 'Phase 4 Complete: % speakers created from persons', speaker_count;
END $$;

-- ============================================
-- PHASE 5: Add Explicit FK from City to Workspace
-- ============================================

ALTER TABLE "City"
    ADD CONSTRAINT "City_workspace_fkey" 
    FOREIGN KEY ("id") 
    REFERENCES "Workspace"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

DO $$ BEGIN
    RAISE NOTICE 'Phase 5 Complete: City → Workspace FK added';
END $$;

-- ============================================
-- PHASE 6: Add Explicit FK from CouncilMeeting to Transcript
-- ============================================
-- Note: CouncilMeeting PK stays [cityId, id] - NO CHANGE!

ALTER TABLE "CouncilMeeting"
    ADD CONSTRAINT "CouncilMeeting_transcript_fkey" 
    FOREIGN KEY ("cityId", "id") 
    REFERENCES "Transcript"("workspaceId", "id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

DO $$ BEGIN
    RAISE NOTICE 'Phase 6 Complete: CouncilMeeting → Transcript FK added (PK unchanged!)';
END $$;

-- ============================================
-- PHASE 7: Update Person to Link to Speaker
-- ============================================

-- 7.1: Add FK to Speaker (using same ID!)
ALTER TABLE "Person"
    ADD CONSTRAINT "Person_speaker_fkey" 
    FOREIGN KEY ("id") 
    REFERENCES "Speaker"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- 7.2: Remove image column (moved to Speaker)
ALTER TABLE "Person" DROP COLUMN "image";

DO $$ BEGIN
    RAISE NOTICE 'Phase 7 Complete: Person → Speaker FK added (uses same ID!)';
END $$;

-- ============================================
-- PHASE 8: Update TaskStatus to point to Transcript
-- ============================================

-- 8.1: Add new columns
ALTER TABLE "TaskStatus" ADD COLUMN "transcriptId" TEXT;
ALTER TABLE "TaskStatus" ADD COLUMN "workspaceId" TEXT;

-- 8.2: Populate from existing councilMeetingId and cityId
UPDATE "TaskStatus"
SET 
    "transcriptId" = "councilMeetingId",
    "workspaceId" = "cityId";

-- 8.3: Make NOT NULL
ALTER TABLE "TaskStatus" ALTER COLUMN "transcriptId" SET NOT NULL;
ALTER TABLE "TaskStatus" ALTER COLUMN "workspaceId" SET NOT NULL;

-- 8.4: Drop old FK
ALTER TABLE "TaskStatus" DROP CONSTRAINT "TaskStatus_councilMeetingId_cityId_fkey";

-- 8.5: Add FK to Transcript
ALTER TABLE "TaskStatus"
    ADD CONSTRAINT "TaskStatus_transcript_fkey" 
    FOREIGN KEY ("transcriptId", "workspaceId") 
    REFERENCES "Transcript"("id", "workspaceId") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- 8.6: Update indexes
DROP INDEX IF EXISTS "TaskStatus_councilMeetingId_cityId_idx";
CREATE INDEX "TaskStatus_transcriptId_workspaceId_idx" 
    ON "TaskStatus"("transcriptId", "workspaceId");

-- 8.7: Drop old columns
ALTER TABLE "TaskStatus" DROP COLUMN "councilMeetingId";
ALTER TABLE "TaskStatus" DROP COLUMN "cityId";

DO $$ BEGIN
    RAISE NOTICE 'Phase 8 Complete: TaskStatus now points to Transcript';
END $$;

-- ============================================
-- PHASE 9: Update SpeakerSegment to point to Transcript
-- ============================================

-- 9.1: Add new columns
ALTER TABLE "SpeakerSegment" ADD COLUMN "transcriptId" TEXT;
ALTER TABLE "SpeakerSegment" ADD COLUMN "workspaceId" TEXT;

-- 9.2: Populate from existing meetingId and cityId
UPDATE "SpeakerSegment"
SET 
    "transcriptId" = "meetingId",
    "workspaceId" = "cityId";

-- 9.3: Make NOT NULL
ALTER TABLE "SpeakerSegment" ALTER COLUMN "transcriptId" SET NOT NULL;
ALTER TABLE "SpeakerSegment" ALTER COLUMN "workspaceId" SET NOT NULL;

-- 9.4: Drop old FK
ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey";

-- 9.5: Update speakerTag FK to use CASCADE
ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_speakerTagId_fkey";
ALTER TABLE "SpeakerSegment"
    ADD CONSTRAINT "SpeakerSegment_speakerTag_fkey" 
    FOREIGN KEY ("speakerTagId") 
    REFERENCES "SpeakerTag"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- 9.6: Add FK to Transcript
ALTER TABLE "SpeakerSegment"
    ADD CONSTRAINT "SpeakerSegment_transcript_fkey" 
    FOREIGN KEY ("transcriptId", "workspaceId") 
    REFERENCES "Transcript"("id", "workspaceId") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- 9.7: Update indexes
DROP INDEX IF EXISTS "SpeakerSegment_meetingId_cityId_startTimestamp_idx";
CREATE INDEX "SpeakerSegment_transcriptId_workspaceId_idx" 
    ON "SpeakerSegment"("transcriptId", "workspaceId");
CREATE INDEX "SpeakerSegment_transcriptId_workspaceId_startTimestamp_idx" 
    ON "SpeakerSegment"("transcriptId", "workspaceId", "startTimestamp");

-- 9.8: Drop old columns
ALTER TABLE "SpeakerSegment" DROP COLUMN "meetingId";
ALTER TABLE "SpeakerSegment" DROP COLUMN "cityId";

DO $$ BEGIN
    RAISE NOTICE 'Phase 9 Complete: SpeakerSegment now points to Transcript';
END $$;

-- ============================================
-- PHASE 10: Update SpeakerTag to point to Speaker
-- ============================================

-- 10.1: Drop old FK
ALTER TABLE "SpeakerTag" DROP CONSTRAINT IF EXISTS "SpeakerTag_personId_fkey";

-- 10.2: Rename column for clarity (do this BEFORE adding new FK!)
ALTER TABLE "SpeakerTag" RENAME COLUMN "personId" TO "speakerId";

-- 10.3: Add FK to point to Speaker (personId is now speakerId, same value!)
ALTER TABLE "SpeakerTag"
    ADD CONSTRAINT "SpeakerTag_speaker_fkey" 
    FOREIGN KEY ("speakerId") 
    REFERENCES "Speaker"("id") 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

DO $$ BEGIN
    RAISE NOTICE 'Phase 10 Complete: SpeakerTag now points to Speaker (same ID!)';
END $$;

-- ============================================
-- PHASE 11: Update VoicePrint to point to Speaker
-- ============================================

-- 11.1: Drop old FK
ALTER TABLE "VoicePrint" DROP CONSTRAINT "VoicePrint_personId_fkey";

-- 11.2: Rename column for clarity (do this BEFORE adding new FK!)
ALTER TABLE "VoicePrint" RENAME COLUMN "personId" TO "speakerId";

-- 11.3: Add FK to point to Speaker (personId is now speakerId, same value!)
ALTER TABLE "VoicePrint"
    ADD CONSTRAINT "VoicePrint_speaker_fkey" 
    FOREIGN KEY ("speakerId") 
    REFERENCES "Speaker"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

DO $$ BEGIN
    RAISE NOTICE 'Phase 11 Complete: VoicePrint now points to Speaker (same ID!)';
END $$;

-- ============================================
-- PHASE 12: Update Administers to support Workspace
-- ============================================

-- 12.1: Add workspaceId column
ALTER TABLE "Administers" ADD COLUMN "workspaceId" TEXT;

-- 12.2: Populate workspaceId from cityId (for existing city admins)
UPDATE "Administers"
SET "workspaceId" = "cityId"
WHERE "cityId" IS NOT NULL;

-- 12.3: Add FK to Workspace
ALTER TABLE "Administers"
    ADD CONSTRAINT "Administers_workspace_fkey" 
    FOREIGN KEY ("workspaceId") 
    REFERENCES "Workspace"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- 12.4: Update unique constraint
DROP INDEX IF EXISTS "Administers_userId_cityId_partyId_personId_key";
CREATE UNIQUE INDEX "Administers_userId_workspaceId_partyId_personId_key" 
    ON "Administers"("userId", "workspaceId", "partyId", "personId");

DO $$ BEGIN
    RAISE NOTICE 'Phase 12 Complete: Administers updated to support Workspace';
END $$;

-- ============================================
-- PHASE 13: Final Verification
-- ============================================

DO $$
DECLARE
    city_count INTEGER;
    workspace_count INTEGER;
    meeting_count INTEGER;
    transcript_count INTEGER;
    person_count INTEGER;
    speaker_count INTEGER;
    orphan_tasks INTEGER;
    orphan_segments INTEGER;
BEGIN
    -- Verify counts match
    SELECT COUNT(*) INTO city_count FROM "City";
    SELECT COUNT(*) INTO workspace_count FROM "Workspace";
    SELECT COUNT(*) INTO meeting_count FROM "CouncilMeeting";
    SELECT COUNT(*) INTO transcript_count FROM "Transcript";
    SELECT COUNT(*) INTO person_count FROM "Person";
    SELECT COUNT(*) INTO speaker_count FROM "Speaker";
    
    IF city_count != workspace_count THEN
        RAISE EXCEPTION 'Verification failed: City count (%) != Workspace count (%)', 
            city_count, workspace_count;
    END IF;
    
    IF meeting_count != transcript_count THEN
        RAISE EXCEPTION 'Verification failed: CouncilMeeting count (%) != Transcript count (%)', 
            meeting_count, transcript_count;
    END IF;
    
    IF person_count != speaker_count THEN
        RAISE EXCEPTION 'Verification failed: Person count (%) != Speaker count (%)', 
            person_count, speaker_count;
    END IF;
    
    -- Verify TaskStatus points to existing transcripts
    SELECT COUNT(*) INTO orphan_tasks FROM "TaskStatus" ts
    WHERE NOT EXISTS (
        SELECT 1 FROM "Transcript" t 
        WHERE t."workspaceId" = ts."workspaceId" 
        AND t."id" = ts."transcriptId"
    );
    
    IF orphan_tasks > 0 THEN
        RAISE EXCEPTION 'Verification failed: % TaskStatus records point to non-existent transcripts', 
            orphan_tasks;
    END IF;
    
    -- Verify SpeakerSegment points to existing transcripts
    SELECT COUNT(*) INTO orphan_segments FROM "SpeakerSegment" ss
    WHERE NOT EXISTS (
        SELECT 1 FROM "Transcript" t 
        WHERE t."workspaceId" = ss."workspaceId" 
        AND t."id" = ss."transcriptId"
    );
    
    IF orphan_segments > 0 THEN
        RAISE EXCEPTION 'Verification failed: % SpeakerSegment records point to non-existent transcripts', 
            orphan_segments;
    END IF;
    
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MIGRATION COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Workspaces created: %', workspace_count;
    RAISE NOTICE 'Transcripts created: %', transcript_count;
    RAISE NOTICE 'Speakers created: %', speaker_count;
    RAISE NOTICE 'All verification checks passed!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Mark migration as applied: npx prisma migrate resolve --applied <migration_name>';
    RAISE NOTICE '2. Update schema: cp docs/FINAL-SCHEMA-DESIGN.prisma prisma/schema.prisma';
    RAISE NOTICE '3. Generate client: npx prisma generate';
    RAISE NOTICE '4. Test the application';
    RAISE NOTICE '============================================';
END $$;

COMMIT;

-- ============================================
-- Migration Complete!
-- ============================================
