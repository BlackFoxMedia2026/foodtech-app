-- CreateTable
CREATE TABLE "TableCombination" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT,
    "tableIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableCombination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableCombination_venueId_roomId_idx" ON "TableCombination"("venueId", "roomId");

-- AddForeignKey
ALTER TABLE "TableCombination" ADD CONSTRAINT "TableCombination_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCombination" ADD CONSTRAINT "TableCombination_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

