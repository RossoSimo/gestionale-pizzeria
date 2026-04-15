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

function createBridgeUnavailableError(methodName) {
  const message =
    "Bridge IPC non disponibile. Avvia l'app con 'npm run dev' o 'npm start' per usare Electron.";
  const error = new Error(`${message} (metodo: ${methodName})`);
  error.code = "IPC_BRIDGE_UNAVAILABLE";
  error.details = {
    methodName,
    help: "Esegui il renderer dentro Electron: npm run dev",
  };
  return error;
}

function createBrowserFallbackBridge() {
  return {
    getAppSettings: async () => ({
      openingTime: "18:00",
      closingTime: "22:00",
      slotMinutes: 20,
      weeklySchedule: [
        { weekday: "LUNEDI", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "MARTEDI", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "MERCOLEDI", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "GIOVEDI", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "VENERDI", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "SABATO", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
        { weekday: "DOMENICA", isOpen: true, openingTime: "18:00", closingTime: "22:00", slotMinutes: 20 },
      ],
      meta: { source: "browser-fallback" },
    }),
    updateAppSettings: async () => {
      throw createBridgeUnavailableError("updateAppSettings");
    },
    // Read-only views can still render in pure browser mode using empty datasets.
    listOrders: async () => ({ data: [], meta: { source: "browser-fallback" } }),
    listCustomers: async () => ({ data: [], meta: { source: "browser-fallback" } }),
    listProducts: async () => ({ data: [], meta: { source: "browser-fallback" } }),
    listIngredients: async () => ({ data: [], meta: { source: "browser-fallback" } }),
    // Mutations require main-process handlers and local DB access.
    createOrder: async () => {
      throw createBridgeUnavailableError("createOrder");
    },
    updateOrder: async () => {
      throw createBridgeUnavailableError("updateOrder");
    },
    deleteOrder: async () => {
      throw createBridgeUnavailableError("deleteOrder");
    },
    updateOrderStatus: async () => {
      throw createBridgeUnavailableError("updateOrderStatus");
    },
    createCustomer: async () => {
      throw createBridgeUnavailableError("createCustomer");
    },
    updateCustomer: async () => {
      throw createBridgeUnavailableError("updateCustomer");
    },
    updateCustomerCoordinates: async () => {
      throw createBridgeUnavailableError("updateCustomerCoordinates");
    },
    deleteCustomer: async () => {
      throw createBridgeUnavailableError("deleteCustomer");
    },
    createProduct: async () => {
      throw createBridgeUnavailableError("createProduct");
    },
    updateProduct: async () => {
      throw createBridgeUnavailableError("updateProduct");
    },
    deleteProduct: async () => {
      throw createBridgeUnavailableError("deleteProduct");
    },
    createIngredient: async () => {
      throw createBridgeUnavailableError("createIngredient");
    },
    updateIngredient: async () => {
      throw createBridgeUnavailableError("updateIngredient");
    },
    deleteIngredient: async () => {
      throw createBridgeUnavailableError("deleteIngredient");
    },
    getPrintSettings: async () => ({
      mode: "SYSTEM",
      systemPrinterName: "",
      ethernetHost: "",
      ethernetPort: 9100,
      paperWidthMm: 80,
      copies: 1,
      deliveryFeeCents: 200,
      autoCut: true,
      headerLine1: "PIZZERIA",
      headerLine2: "",
      footerText: "Grazie e buon appetito",
      templateAsporto: "",
      templateDomicilioKitchen: "",
      templateDomicilioDelivery: "",
      meta: { source: "browser-fallback" },
    }),
    updatePrintSettings: async () => {
      throw createBridgeUnavailableError("updatePrintSettings");
    },
    listSystemPrinters: async () => [],
    getPrintQueueStatus: async () => ({
      processing: false,
      activeJobId: null,
      queuedCount: 0,
      queuedJobs: [],
      recentJobs: [],
    }),
    retryFailedPrintJob: async () => {
      throw createBridgeUnavailableError("retryFailedPrintJob");
    },
    reprintLastOrder: async () => {
      throw createBridgeUnavailableError("reprintLastOrder");
    },
    listCashClosures: async () => [],
    createCashClosure: async () => {
      throw createBridgeUnavailableError("createCashClosure");
    },
    printOrder: async () => {
      throw createBridgeUnavailableError("printOrder");
    },
    printTestReceipt: async () => {
      throw createBridgeUnavailableError("printTestReceipt");
    },
    getAppVersion: async () => "browser-preview",
    ping: async () => ({ ok: true, mode: "browser-fallback" }),
  };
}

const browserFallbackBridge = createBrowserFallbackBridge();

/**
 * Resolves a typed method exposed by preload bridge and fails fast if missing.
 */
function getBridgeMethod(methodName) {
  if (window.electronAPI && typeof window.electronAPI[methodName] === "function") {
    return window.electronAPI[methodName];
  }

  if (typeof browserFallbackBridge[methodName] === "function") {
    return browserFallbackBridge[methodName];
  }

  throw createBridgeUnavailableError(methodName);
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
