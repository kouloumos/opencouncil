-- The stored name becomes an override (#150). Null means that the title is
-- derived from the session number and the kind (src/lib/meetingName.ts).
BEGIN;

ALTER TABLE "CouncilMeeting"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "name_en" DROP NOT NULL;

-- The title for the readers that are SQL, not TypeScript. It gives the same
-- string as meetingDisplayName for every city language, and it reads an empty
-- override as no override; an integration test compares the two, and
-- KIND_WORDS in src/lib/meetingName.ts repeats the words. "dateTime" is a
-- timestamp without zone that holds UTC, so it is read as UTC before the
-- conversion to the city's zone. STABLE, not IMMUTABLE: the conversion
-- depends on the timezone database.
CREATE OR REPLACE FUNCTION council_meeting_display_name(
  override text,
  kind "MeetingKind",
  session_number integer,
  held_at timestamp,
  tz text,
  lang text
) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(override, ''),
    CASE
      WHEN words.short_title IS NULL THEN
        CASE lang WHEN 'el' THEN 'Συνεδρίαση' WHEN 'fr' THEN 'Séance' WHEN 'sr' THEN 'Седница' ELSE 'Meeting' END
        || ' ' || to_char(
          (held_at AT TIME ZONE 'UTC') AT TIME ZONE tz,
          CASE WHEN lang = 'sr' THEN 'DD.MM.YYYY.' ELSE 'DD/MM/YYYY' END
        )
      WHEN session_number IS NULL THEN words.full_title
      ELSE session_number::text
        || CASE
             WHEN lang = 'el' THEN 'η'
             WHEN session_number % 100 BETWEEN 11 AND 13 THEN 'th'
             WHEN session_number % 10 = 1 THEN 'st'
             WHEN session_number % 10 = 2 THEN 'nd'
             WHEN session_number % 10 = 3 THEN 'rd'
             ELSE 'th'
           END
        || ' ' || words.short_title
    END
  )
  FROM (
    SELECT
      CASE lang || ':' || kind::text
        WHEN 'el:regular'            THEN 'Τακτική'
        WHEN 'el:urgent'             THEN 'Έκτακτη'
        WHEN 'el:accountability'     THEN 'Ειδική Λογοδοσίας'
        WHEN 'el:activityReport'     THEN 'Ειδική Απολογισμού Πεπραγμένων'
        WHEN 'el:budget'             THEN 'Ειδική Προϋπολογισμού'
        WHEN 'el:presidencyElection' THEN 'Ειδική Εκλογής Προεδρείου'
        WHEN 'en:regular'            THEN 'Regular'
        WHEN 'en:urgent'             THEN 'Urgent'
        WHEN 'en:accountability'     THEN 'Special (Accountability)'
        WHEN 'en:activityReport'     THEN 'Special (Activity Report)'
        WHEN 'en:budget'             THEN 'Special (Budget)'
        WHEN 'en:presidencyElection' THEN 'Special (Presidency Election)'
      END AS short_title,
      CASE lang || ':' || kind::text
        WHEN 'el:regular'            THEN 'Τακτική Συνεδρίαση'
        WHEN 'el:urgent'             THEN 'Έκτακτη Συνεδρίαση'
        WHEN 'el:accountability'     THEN 'Ειδική Συνεδρίαση Λογοδοσίας'
        WHEN 'el:activityReport'     THEN 'Ειδική Συνεδρίαση Απολογισμού Πεπραγμένων'
        WHEN 'el:budget'             THEN 'Ειδική Συνεδρίαση Προϋπολογισμού'
        WHEN 'el:presidencyElection' THEN 'Ειδική Συνεδρίαση Εκλογής Προεδρείου'
        WHEN 'en:regular'            THEN 'Regular Meeting'
        WHEN 'en:urgent'             THEN 'Urgent Meeting'
        WHEN 'en:accountability'     THEN 'Special Meeting (Accountability)'
        WHEN 'en:activityReport'     THEN 'Special Meeting (Activity Report)'
        WHEN 'en:budget'             THEN 'Special Meeting (Budget)'
        WHEN 'en:presidencyElection' THEN 'Special Meeting (Presidency Election)'
      END AS full_title
  ) AS words
$$;

-- Notis reads the meeting name from this view, and its consumer model
-- declares the column non-null. The columns and their types do not change.
CREATE OR REPLACE VIEW "notis_meeting_events" AS
SELECT
  ts.id              AS "taskId",
  ts.type,
  ts."updatedAt"     AS "completedAt",
  ts."cityId",
  ts."councilMeetingId" AS "meetingId",
  council_meeting_display_name(cm.name, cm.kind, cm."sessionNumber", cm."dateTime", c.timezone, c.language::text) AS "meetingName",
  cm."dateTime"      AS "meetingDate",
  cm.released,
  ab.name            AS "adminBodyName",
  c.realm::text      AS realm,
  c.language::text   AS language,
  c.timezone
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded';

COMMIT;
