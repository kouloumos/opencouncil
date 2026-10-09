-- The memory of a postponement (#150 review): the release of a new meeting
-- unreleased this meeting. Only such a meeting is released again when the
-- new meeting stops being public, so a postponed draft stays a draft.
-- AlterTable
ALTER TABLE "CouncilMeeting" ADD COLUMN     "hiddenByPostponement" BOOLEAN NOT NULL DEFAULT false;
