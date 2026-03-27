const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

let dbClient;

/**
 * Resolves the runtime datasource URL required by Prisma 7 client initialization.
 * Falls back to local SQLite default when DATABASE_URL is not explicitly set.
 */
function resolveDatasourceUrl() {
  if (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  return "file:./dev.db";
}

/**
 * Returns a singleton Prisma client for Electron main process.
 * A single shared instance prevents multiple SQLite connections and keeps
 * transaction behavior predictable across IPC handlers.
 */
function getDbClient() {
  if (!dbClient) {
    const datasourceUrl = resolveDatasourceUrl();
    const adapter = new PrismaBetterSqlite3({ url: datasourceUrl });
    dbClient = new PrismaClient({ adapter });
  }

  return dbClient;
}

/**
 * Gracefully closes the Prisma connection when the app is shutting down.
 * This avoids dangling handles that can block process exit on Windows.
 */
async function disconnectDb() {
  if (dbClient) {
    await dbClient.$disconnect();
    dbClient = undefined;
  }
}

module.exports = { getDbClient, disconnectDb };
