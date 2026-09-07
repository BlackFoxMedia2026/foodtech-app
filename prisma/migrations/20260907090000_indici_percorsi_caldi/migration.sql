-- CreateIndex
CREATE INDEX "Campaign_venueId_status_createdAt_idx" ON "Campaign"("venueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Shift_venueId_weekday_active_idx" ON "Shift"("venueId", "weekday", "active");

-- CreateIndex
CREATE INDEX "TableBlock_tableId_startsAt_endsAt_idx" ON "TableBlock"("tableId", "startsAt", "endsAt");

