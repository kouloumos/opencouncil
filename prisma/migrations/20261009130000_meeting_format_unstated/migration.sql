-- The kind and the format of a meeting stay unstated until somebody states
-- them or reads them from the invitation (#150). The kind is already nullable.
-- AlterTable
ALTER TABLE "CouncilMeeting" ALTER COLUMN "format" DROP NOT NULL,
ALTER COLUMN "format" DROP DEFAULT;

-- 20261006130000_meeting_lifecycle gave 'inPerson' to every meeting that
-- existed when it ran. Nobody stated that value, so it becomes unstated. A
-- meeting created or edited after it may hold a format that somebody set:
-- it stays. An edit of another field also moves "updatedAt", so a few
-- default values stay too; processAgenda compares those with the invitation.
UPDATE "CouncilMeeting" SET "format" = NULL
WHERE "format" = 'inPerson'
  AND "updatedAt" < (
    -- A failed attempt that was retried leaves a row of its own.
    SELECT max("finished_at") FROM "_prisma_migrations"
    WHERE "migration_name" = '20261006130000_meeting_lifecycle'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
  );
