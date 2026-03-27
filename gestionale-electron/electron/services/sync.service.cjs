/**
 * Async delay helper used by retry backoff inside sync flush loop.
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Creates an in-memory sync queue with bounded retries.
 * `processEvent` can be injected to connect real HTTP/API behavior.
 */
function createSyncService(options = {}) {
  const queue = [];
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 3;
  const baseRetryDelayMs = Number.isInteger(options.baseRetryDelayMs)
    ? options.baseRetryDelayMs
    : 750;

  const processEvent =
    typeof options.processEvent === "function"
      ? options.processEvent
      : async () => {
          // TODO: integrare chiamata API cloud reale.
          return true;
        };

  return {
    async enqueue(event) {
      // Every mutation is queued with retry metadata for eventual delivery.
      if (!event || typeof event !== "object") {
        const error = new Error("Evento sync non valido");
        error.code = "VALIDATION_ERROR";
        throw error;
      }

      queue.push({
        event,
        attempts: 0,
      });

      return {
        queued: true,
        queueLength: queue.length,
      };
    },

    async flush() {
      // Flush processes queue sequentially to preserve event ordering.
      let processed = 0;
      let failed = 0;

      while (queue.length > 0) {
        const entry = queue[0];

        try {
          await processEvent(entry.event);
          queue.shift();
          processed += 1;
        } catch {
          // Failed events are retried with linear backoff until maxRetries.
          entry.attempts += 1;

          if (entry.attempts > maxRetries) {
            queue.shift();
            failed += 1;
            continue;
          }

          await sleep(baseRetryDelayMs * entry.attempts);
        }
      }

      return {
        processed,
        failed,
        pending: queue.length,
      };
    },
  };
}

module.exports = { createSyncService };
