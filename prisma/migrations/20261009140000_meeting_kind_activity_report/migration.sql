-- The απολογισμός πεπραγμένων (151) takes place in the 2nd, 3rd and 4th year
-- of the term, and the law also calls the financial accounts «απολογισμός»
-- (515). The kind takes the law's term (#150 review). No row holds the value
-- yet. The title function gets the new words; KIND_WORDS in
-- src/lib/meetingName.ts repeats them.
BEGIN;

ALTER TYPE "MeetingKind" RENAME VALUE 'annualReport' TO 'activityReport';

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

COMMIT;
