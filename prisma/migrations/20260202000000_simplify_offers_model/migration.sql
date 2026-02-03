-- AlterTable: Remove old columns from Offer
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "platformPrice";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "meetingsToIngest";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "hoursToGuarantee";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "correctnessGuarantee";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "equipmentRentalPrice";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "equipmentRentalName";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "equipmentRentalDescription";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "physicalPresenceHours";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "cityId";

-- AlterTable: Add workspaceId column
ALTER TABLE "Offer" ADD COLUMN "workspaceId" TEXT;

-- AlterTable: Make startDate and endDate optional
ALTER TABLE "Offer" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "endDate" DROP NOT NULL;
