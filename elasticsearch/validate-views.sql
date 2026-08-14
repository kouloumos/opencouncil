-- ============================================================================
-- Elasticsearch View Validation
-- ============================================================================
-- This script validates that all PGSync views are working correctly.
-- Run after creating views with: psql "$PSQL_URL" < elasticsearch/validate-views.sql
-- ============================================================================

\echo ''
\echo '========================================='
\echo 'Validating Elasticsearch PGSync Views'
\echo '========================================='
\echo ''

-- ============================================================================
-- 1. Check all views exist
-- ============================================================================
\echo '1. Checking all required views exist...'
SELECT 
  viewname,
  CASE WHEN viewname IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname IN (
    'LocationSearchView', 
    'IntroducedByPartyView', 
    'SubjectSpeakerSegmentSearchView',
    'SubjectSearchView',
    'SpeakerContributionSearchView',
    'MeetingAdministrativeBodyView'
  )
ORDER BY viewname;

\echo ''

-- ============================================================================
-- 2. Validate SubjectSearchView - reference stripping
-- ============================================================================
\echo '2. Validating SubjectSearchView (reference stripping)...'
SELECT 
  COUNT(*) AS total_subjects,
  COUNT(CASE WHEN description ~ '\[.*\]\(REF:' THEN 1 END) AS refs_not_stripped,
  CASE 
    WHEN COUNT(CASE WHEN description ~ '\[.*\]\(REF:' THEN 1 END) = 0 
    THEN 'PASS: All references stripped'
    ELSE 'FAIL: Some references not stripped'
  END AS validation_result
FROM "SubjectSearchView"
WHERE description IS NOT NULL;

\echo ''
\echo '   Sample descriptions (first 3):'
SELECT 
  id,
  LEFT(description, 100) || CASE WHEN LENGTH(description) > 100 THEN '...' ELSE '' END AS description_preview
FROM "SubjectSearchView"
WHERE description IS NOT NULL AND description != ''
LIMIT 3;

\echo ''

-- ============================================================================
-- 2b. Validate SubjectSearchView - discussion metrics
-- ============================================================================
\echo '2b. Validating SubjectSearchView (discussion metrics)...'
SELECT
  COUNT(*) AS total_subjects,
  COUNT(CASE WHEN contributor_count IS NULL OR discussion_speaking_seconds IS NULL THEN 1 END) AS null_metrics,
  COUNT(CASE WHEN contributor_count < 0 OR discussion_speaking_seconds < 0 THEN 1 END) AS negative_metrics,
  CASE
    WHEN COUNT(CASE WHEN contributor_count IS NULL OR discussion_speaking_seconds IS NULL THEN 1 END) > 0
      THEN 'FAIL: Metrics must never be NULL'
    WHEN COUNT(CASE WHEN contributor_count < 0 OR discussion_speaking_seconds < 0 THEN 1 END) > 0
      THEN 'FAIL: Negative metrics found'
    ELSE 'PASS: Metrics are non-null and non-negative'
  END AS validation_result
FROM "SubjectSearchView";

\echo ''
\echo '   Checking the speaking time reads the current source (tagged utterances)...'
-- The regression this catches: the view sums SubjectSpeakerSegment, which the summarize task
-- no longer writes, so every subject from the contribution pipeline reports 0 seconds.
WITH tagged AS (
  SELECT u."discussionSubjectId" AS id,
         SUM(u."endTimestamp" - u."startTimestamp")
           FILTER (WHERE sm.type IS NULL OR sm.type::text <> 'procedural') AS seconds
  FROM "Utterance" u
  INNER JOIN "SpeakerSegment" ss ON ss.id = u."speakerSegmentId"
  LEFT JOIN "Summary" sm ON sm."speakerSegmentId" = ss.id
  WHERE u."discussionStatus"::text = 'SUBJECT_DISCUSSION'
    AND u."discussionSubjectId" IS NOT NULL
  GROUP BY 1
)
SELECT
  COUNT(*) AS subjects_with_tagged_time,
  COUNT(CASE WHEN v.discussion_speaking_seconds = 0 THEN 1 END) AS reporting_zero,
  CASE
    WHEN COUNT(*) = 0
      THEN 'SKIP: No tagged utterances in this database'
    WHEN COUNT(CASE WHEN v.discussion_speaking_seconds = 0 THEN 1 END) > 0
      THEN 'FAIL: Subjects with tagged discussion time report 0 seconds'
    ELSE 'PASS: Speaking time follows the tagged utterances'
  END AS validation_result
FROM tagged
INNER JOIN "SubjectSearchView" v ON v.id = tagged.id
WHERE tagged.seconds > 0;

\echo ''
\echo '   Most discussed subjects (first 3):'
SELECT
  id,
  contributor_count,
  ROUND(discussion_speaking_seconds::numeric, 1) AS speaking_seconds
FROM "SubjectSearchView"
ORDER BY discussion_speaking_seconds DESC
LIMIT 3;

\echo ''

-- ============================================================================
-- 3. Validate SpeakerContributionSearchView - reference stripping + party resolution
-- ============================================================================
\echo '3. Validating SpeakerContributionSearchView...'
SELECT 
  COUNT(*) AS total_contributions,
  COUNT(speaker_person_id) AS with_speaker,
  COUNT(speaker_party_id) AS with_party,
  COUNT(CASE WHEN text ~ '\[.*\]\(REF:' THEN 1 END) AS refs_not_stripped,
  CASE 
    WHEN COUNT(CASE WHEN text ~ '\[.*\]\(REF:' THEN 1 END) = 0 
    THEN 'PASS: All references stripped'
    ELSE 'FAIL: Some references not stripped'
  END AS validation_result
FROM "SpeakerContributionSearchView";

\echo ''
\echo '   Sample contributions (first 3):'
SELECT 
  contribution_id,
  speaker_person_name,
  speaker_party_name,
  LEFT(text, 80) || CASE WHEN LENGTH(text) > 80 THEN '...' ELSE '' END AS text_preview
FROM "SpeakerContributionSearchView"
WHERE text IS NOT NULL AND text != ''
LIMIT 3;

\echo ''

-- ============================================================================
-- 4. Validate SubjectSpeakerSegmentSearchView - party resolution
-- ============================================================================
\echo '4. Validating SubjectSpeakerSegmentSearchView...'
SELECT 
  COUNT(*) AS total_segments,
  COUNT(speaker_person_id) AS with_speaker,
  COUNT(speaker_party_id) AS with_party,
  COUNT(text) AS with_text,
  COUNT(summary) AS with_summary
FROM "SubjectSpeakerSegmentSearchView";

\echo ''

-- ============================================================================
-- 5. Validate IntroducedByPartyView - party resolution
-- ============================================================================
\echo '5. Validating IntroducedByPartyView...'
SELECT 
  COUNT(*) AS total_mappings,
  COUNT(DISTINCT person_id) AS unique_persons,
  COUNT(DISTINCT party_id) AS unique_parties,
  COUNT(DISTINCT city_id) AS unique_cities
FROM "IntroducedByPartyView";

\echo ''

-- ============================================================================
-- 6. Validate LocationSearchView - GeoJSON conversion
-- ============================================================================
\echo '6. Validating LocationSearchView...'
SELECT 
  COUNT(*) AS total_locations,
  COUNT(geojson) AS with_geojson,
  COUNT(*) - COUNT(geojson) AS missing_geojson
FROM "LocationSearchView";

\echo ''

-- ============================================================================
-- 7. Validate MeetingAdministrativeBodyView - two-hop join and enum cast
-- ============================================================================
\echo '7. Validating MeetingAdministrativeBodyView...'
SELECT
  COUNT(*) AS total_meetings,
  COUNT(administrative_body_id) AS with_body,
  COUNT(*) - COUNT(administrative_body_id) AS without_body,
  CASE
    WHEN COUNT(CASE WHEN administrative_body_id IS NOT NULL AND administrative_body_type IS NULL THEN 1 END) > 0
      THEN 'FAIL: Body present but type missing'
    WHEN COUNT(CASE WHEN administrative_body_type NOT IN ('council', 'committee', 'community') THEN 1 END) > 0
      THEN 'FAIL: Unexpected administrative body type'
    ELSE 'PASS: Types resolve correctly'
  END AS validation_result
FROM "MeetingAdministrativeBodyView";

\echo ''
\echo '   Meetings per type:'
SELECT
  COALESCE(administrative_body_type, '(none)') AS administrative_body_type,
  COUNT(*) AS meetings
FROM "MeetingAdministrativeBodyView"
GROUP BY 1
ORDER BY 2 DESC;

\echo ''

-- ============================================================================
-- Summary
-- ============================================================================
\echo '========================================='
\echo 'Validation Complete'
\echo '========================================='
\echo ''
\echo 'If all checks show PASS and counts look reasonable,'
\echo 'the views are ready for PGSync.'
\echo ''
