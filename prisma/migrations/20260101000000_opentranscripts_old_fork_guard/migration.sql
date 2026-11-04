-- OpenTranscripts: stop every migration on a database of the old fork.
--
-- The old opentranscripts branch renamed columns (TaskStatus.transcriptId,
-- SpeakerSegment.transcriptId, SpeakerTag.speakerId and more). The upstream
-- migrations that follow this one do not apply on top of them: run on such a
-- database, they would fail part-way and leave it half migrated. This
-- migration sorts before every one of them, so it fails first, while the
-- database is still as it was.
--
-- Move the database with scripts/opentranscripts-transition/transition.sh and
-- point DATABASE_URL at its target. On any other database this does nothing.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'TaskStatus' AND column_name = 'transcriptId'
    ) THEN
        RAISE EXCEPTION 'This database has the schema of the old opentranscripts branch. Run scripts/opentranscripts-transition/transition.sh and point DATABASE_URL at its target database.';
    END IF;
END $$;
