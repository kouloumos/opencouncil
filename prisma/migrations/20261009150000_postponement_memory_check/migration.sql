-- A meeting that a release hid is not public (#150 review). The database
-- holds the invariant, like the checks of the lifecycle migration.
ALTER TABLE "CouncilMeeting"
  ADD CONSTRAINT "CouncilMeeting_hidden_by_postponement_not_released"
  CHECK (NOT ("hiddenByPostponement" AND "released"));
