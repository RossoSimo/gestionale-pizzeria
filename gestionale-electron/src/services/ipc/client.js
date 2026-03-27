/**
 * Normalizes heterogeneous IPC errors into a stable frontend error contract.
 */
function normalizeIpcError(error) {
  const fallback = {
    code: "IPC_ERROR",
    message: "Errore di comunicazione IPC",
    details: null,
  };

  if (!error || typeof error !== "object") {
    return fallback;
  }

  // IPC errors can arrive as serialized JSON strings from main process handlers.
  if (typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === "object") {
        return {
          code: parsed.code ?? fallback.code,
          message: parsed.message ?? fallback.message,
          details: parsed.details ?? null,
        };
      }
    } catch {
      return {
        ...fallback,
        message: error.message,
      };
    }
  }

  return fallback;
}

/**
 * Resolves a typed method exposed by preload bridge and fails fast if missing.
 */
function getBridgeMethod(methodName) {
  if (!window.electronAPI || typeof window.electronAPI[methodName] !== "function") {
    throw new Error(`Bridge IPC non disponibile: ${methodName}`);
  }

  return window.electronAPI[methodName];
}

/**
 * Executes a preload bridge method and rethrows normalized domain-friendly errors.
 */
export async function callBridge(methodName, payload) {
  const method = getBridgeMethod(methodName);

  try {
    return await method(payload);
  } catch (error) {
    // Convert transport-level error into a normalized app-level error object.
    const normalizedError = normalizeIpcError(error);
    const mappedError = new Error(normalizedError.message);
    mappedError.code = normalizedError.code;
    mappedError.details = normalizedError.details;
    throw mappedError;
  }
}
