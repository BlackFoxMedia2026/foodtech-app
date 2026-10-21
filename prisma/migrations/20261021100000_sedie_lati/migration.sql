-- CreateEnum
CREATE TYPE "ChairSides" AS ENUM ('ALL', 'LONG');

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "chairSides" "ChairSides" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "TablePreset" ADD COLUMN     "chairSides" "ChairSides" NOT NULL DEFAULT 'ALL';

