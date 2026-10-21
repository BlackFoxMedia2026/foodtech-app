-- CreateTable
CREATE TABLE "TablePreset" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "shape" "TableShape" NOT NULL,
    "seats" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TablePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TablePreset_venueId_label_key" ON "TablePreset"("venueId", "label");

-- AddForeignKey
ALTER TABLE "TablePreset" ADD CONSTRAINT "TablePreset_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

