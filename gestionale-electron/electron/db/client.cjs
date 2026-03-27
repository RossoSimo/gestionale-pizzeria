const { PrismaClient } = require("@prisma/client");

let dbClient;

/**
 * Returns a singleton Prisma client for Electron main process.
 * A single shared instance prevents multiple SQLite connections and keeps
 * transaction behavior predictable across IPC handlers.
 */
function getDbClient() {
  if (!dbClient) {
    dbClient = new PrismaClient();
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
