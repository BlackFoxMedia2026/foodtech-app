-- Il cestino del passo «Modelli»: bozze eliminate e modelli nascosti, recuperabili.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "hiddenCampaignTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[];
