-- CreateTable
CREATE TABLE "BusinessDaySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settingsId" TEXT NOT NULL DEFAULT 'default',
    "weekday" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openingTime" TEXT NOT NULL DEFAULT '18:00',
    "closingTime" TEXT NOT NULL DEFAULT '23:00',
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" DATETIME,
    CONSTRAINT "BusinessDaySettings_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "AppSettings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDaySettings_weekday_key" ON "BusinessDaySettings"("weekday");

-- CreateIndex
CREATE INDEX "BusinessDaySettings_settingsId_idx" ON "BusinessDaySettings"("settingsId");

-- CreateIndex
CREATE INDEX "BusinessDaySettings_updatedAt_idx" ON "BusinessDaySettings"("updatedAt");

-- CreateIndex
CREATE INDEX "BusinessDaySettings_deletedAt_idx" ON "BusinessDaySettings"("deletedAt");

-- CreateIndex
CREATE INDEX "BusinessDaySettings_syncStatus_idx" ON "BusinessDaySettings"("syncStatus");
