-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isTemporary" BOOLEAN NOT NULL DEFAULT false,
    "temporaryBusinessDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" DATETIME
);
INSERT INTO "new_Customer" ("address", "createdAt", "deletedAt", "id", "lastSyncedAt", "name", "notes", "phone", "syncStatus", "updatedAt", "version") SELECT "address", "createdAt", "deletedAt", "id", "lastSyncedAt", "name", "notes", "phone", "syncStatus", "updatedAt", "version" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_updatedAt_idx" ON "Customer"("updatedAt");
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");
CREATE INDEX "Customer_syncStatus_idx" ON "Customer"("syncStatus");
CREATE INDEX "Customer_isTemporary_temporaryBusinessDate_idx" ON "Customer"("isTemporary", "temporaryBusinessDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
