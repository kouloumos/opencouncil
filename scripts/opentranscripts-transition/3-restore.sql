-- OpenTranscripts transition, step 3 of 3: put the OpenTranscripts rows back.
--
-- Run this after 1-unfork.sql and after `prisma migrate deploy` of the new
-- branch (step 2). It copies the rows in ot_stash into the new schema:
-- workspaces that are not cities, transcripts that are not meetings, speakers
-- that are not persons, and their tags, segments, utterances, words, edits,
-- summaries, topic labels, voiceprints, tasks and admins.
--
-- The new schema keeps the upstream column names, so some columns move:
--   SpeakerTag.speakerId                         -> personId
--   VoicePrint.speakerId                         -> personId
--   SpeakerSegment.transcriptId, workspaceId     -> meetingId, cityId
--   TaskStatus.transcriptId, workspaceId         -> councilMeetingId, cityId
--   Administers.workspaceId                      -> cityId
-- Every other column copies by name. A stashed column that has no place in
-- the new table stops the script, so no value is dropped without a decision.
--
-- Offers are not restored. The old OpenTranscripts offers lack the platform
-- price and the dates that an offer of the new schema requires, and this
-- script does not invent them. They stay in ot_stash."Offer".
--
-- Everything runs in one transaction: an error leaves the database as step 2
-- left it.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF to_regclass('ot_stash."Transcript"') IS NULL THEN
        RAISE EXCEPTION 'ot_stash is missing. Run 1-unfork.sql first.';
    END IF;
    IF to_regclass('public."Transcript"') IS NULL THEN
        RAISE EXCEPTION 'The new schema is missing. Run prisma migrate deploy first.';
    END IF;
    IF EXISTS (SELECT 1 FROM ot_stash."Transcript" s JOIN "Transcript" t ON t."workspaceId" = s."workspaceId" AND t.id = s.id) THEN
        RAISE EXCEPTION 'Stashed transcripts exist in the new schema already. This script runs once.';
    END IF;
    -- The admins of a generic workspace had no city: workspaceId alone becomes cityId.
    IF EXISTS (SELECT 1 FROM ot_stash."Administers" WHERE "cityId" IS NOT NULL) THEN
        RAISE EXCEPTION 'A stashed admin row names a city';
    END IF;
END $$;

-- Copies one stashed table into its new table. `renames` maps an old column to
-- its new name; `dropped` lists old columns that are left out on purpose.
CREATE FUNCTION pg_temp.restore_table(tbl text, renames jsonb DEFAULT '{}', dropped text[] DEFAULT '{}')
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    col record;
    target_col text;
    target_type text;
    insert_cols text[] := '{}';
    select_exprs text[] := '{}';
    lost text[] := '{}';
    stashed bigint;
    inserted bigint;
BEGIN
    FOR col IN SELECT column_name FROM information_schema.columns
               WHERE table_schema = 'ot_stash' AND table_name = tbl ORDER BY ordinal_position
    LOOP
        CONTINUE WHEN col.column_name = ANY (dropped);
        target_col := coalesce(renames ->> col.column_name, col.column_name);
        SELECT format_type(a.atttypid, a.atttypmod) INTO target_type
        FROM pg_attribute a
        WHERE a.attrelid = format('public.%I', tbl)::regclass AND a.attname = target_col AND NOT a.attisdropped;
        IF target_type IS NULL THEN
            lost := lost || col.column_name;
            CONTINUE;
        END IF;
        insert_cols := insert_cols || format('%I', target_col);
        -- Through text, so an enum of the old schema meets the enum of the new one.
        select_exprs := select_exprs || format('%I::text::%s', col.column_name, target_type);
    END LOOP;

    IF array_length(lost, 1) > 0 THEN
        RAISE EXCEPTION 'Table %: stashed column(s) % have no place in the new table', tbl, lost;
    END IF;

    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM ot_stash.%I',
                   tbl, array_to_string(insert_cols, ', '), array_to_string(select_exprs, ', '), tbl);
    GET DIAGNOSTICS inserted = ROW_COUNT;
    EXECUTE format('SELECT count(*) FROM ot_stash.%I', tbl) INTO stashed;
    IF inserted <> stashed THEN
        RAISE EXCEPTION 'Table %: % rows stashed, % rows restored', tbl, stashed, inserted;
    END IF;
    RAISE NOTICE 'Restored % row(s) into %', inserted, tbl;
    RETURN inserted;
END $$;

-- Parents before children.
SELECT pg_temp.restore_table('Workspace');
SELECT pg_temp.restore_table('Speaker');
SELECT pg_temp.restore_table('Transcript');
SELECT pg_temp.restore_table('SpeakerTag', '{"speakerId": "personId"}');
SELECT pg_temp.restore_table('SpeakerSegment', '{"transcriptId": "meetingId", "workspaceId": "cityId"}');
SELECT pg_temp.restore_table('Utterance');
SELECT pg_temp.restore_table('Word');
SELECT pg_temp.restore_table('UtteranceEdit');
SELECT pg_temp.restore_table('Summary');
SELECT pg_temp.restore_table('TopicLabel');
SELECT pg_temp.restore_table('VoicePrint', '{"speakerId": "personId"}');
SELECT pg_temp.restore_table('TaskStatus', '{"transcriptId": "councilMeetingId", "workspaceId": "cityId"}');
SELECT pg_temp.restore_table('Administers', '{"workspaceId": "cityId"}', ARRAY['cityId']);

-- What migration 20261002120000_add_speaker_identifications did to every tag
-- that existed then: a tag updated after its import was edited by a person.
UPDATE "SpeakerTag" SET "personSetBy" = 'user'
WHERE id IN (SELECT id FROM ot_stash."SpeakerTag")
  AND "updatedAt" > "createdAt" + INTERVAL '5 seconds';

COMMIT;
