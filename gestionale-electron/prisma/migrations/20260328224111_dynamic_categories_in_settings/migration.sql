-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "openingTime" TEXT NOT NULL DEFAULT '18:00',
    "closingTime" TEXT NOT NULL DEFAULT '23:00',
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,
    "categoryPizzaLabel" TEXT NOT NULL DEFAULT 'Pizze',
    "categoryBevandaLabel" TEXT NOT NULL DEFAULT 'Bevanda',
    "categoryAltroLabel" TEXT NOT NULL DEFAULT 'Altro',
    "extraCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" DATETIME
);
INSERT INTO "new_AppSettings" ("categoryAltroLabel", "categoryBevandaLabel", "categoryPizzaLabel", "closingTime", "createdAt", "id", "lastSyncedAt", "openingTime", "slotMinutes", "syncStatus", "updatedAt", "version") SELECT "categoryAltroLabel", "categoryBevandaLabel", "categoryPizzaLabel", "closingTime", "createdAt", "id", "lastSyncedAt", "openingTime", "slotMinutes", "syncStatus", "updatedAt", "version" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
