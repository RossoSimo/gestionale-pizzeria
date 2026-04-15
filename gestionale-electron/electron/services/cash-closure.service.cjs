const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_CLOSURES = 200;
const MAX_ORDERS_IN_SNAPSHOT = 1500;

function buildValidationError(message, details) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.details = details ?? null;
  return error;
}

function ensureString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }

  return value.trim();
}

function ensureIsoDateString(value, field) {
  const normalized = ensureString(value, field);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }

  return parsed.toISOString();
}

function ensureNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }

  return value;
}

function normalizeStatusBreakdown(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const normalized = {};

  for (const [status, count] of Object.entries(source)) {
    if (typeof status !== "string" || !status.trim()) {
      continue;
    }

    const safeCount = Number.isInteger(count) && count >= 0 ? count : 0;
    normalized[status.trim().toUpperCase()] = safeCount;
  }

  return normalized;
}

function normalizeOrderSummaries(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .slice(0, MAX_ORDERS_IN_SNAPSHOT)
    .map((item) => {
      const id = typeof item?.id === "string" ? item.id : "";
      const dailyNumber = Number.isInteger(item?.dailyNumber) ? item.dailyNumber : null;
      const type = typeof item?.type === "string" ? item.type : "ASPORTO";
      const status = typeof item?.status === "string" ? item.status : "CONFERMATO";
      const totalAmountCents = Number.isInteger(item?.totalAmountCents)
        ? Math.max(0, item.totalAmountCents)
        : 0;
      const customerName = typeof item?.customerName === "string" ? item.customerName.trim() : "";
      const expectedAt = typeof item?.expectedAt === "string" ? item.expectedAt : null;
      const createdAt = typeof item?.createdAt === "string" ? item.createdAt : null;

      return {
        id,
        dailyNumber,
        type,
        status,
        totalAmountCents,
        customerName,
        expectedAt,
        createdAt,
      };
    });
}

function normalizeTopProducts(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 20).map((item) => ({
    name: typeof item?.name === "string" ? item.name.trim() : "Prodotto",
    quantity: Number.isInteger(item?.quantity) && item.quantity >= 0 ? item.quantity : 0,
  }));
}

function normalizeClosureInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw buildValidationError("Payload chiusura cassa non valido");
  }

  const businessDate = ensureString(input.businessDate, "businessDate");
  const shiftStartIso = ensureIsoDateString(input.shiftStartIso, "shiftStartIso");
  const shiftEndIso = ensureIsoDateString(input.shiftEndIso, "shiftEndIso");

  const shiftStart = new Date(shiftStartIso);
  const shiftEnd = new Date(shiftEndIso);

  if (shiftEnd <= shiftStart) {
    throw buildValidationError("Intervallo turno non valido", {
      shiftStartIso,
      shiftEndIso,
    });
  }

  return {
    businessDate,
    shiftStartIso,
    shiftEndIso,
    notes: typeof input.notes === "string" ? input.notes.trim() : "",
    totals: {
      totalOrders: ensureNonNegativeInteger(input?.totals?.totalOrders, "totals.totalOrders"),
      validOrders: ensureNonNegativeInteger(input?.totals?.validOrders, "totals.validOrders"),
      totalRevenueCents: ensureNonNegativeInteger(
        input?.totals?.totalRevenueCents,
        "totals.totalRevenueCents"
      ),
      asportoOrders: ensureNonNegativeInteger(input?.totals?.asportoOrders, "totals.asportoOrders"),
      domicilioOrders: ensureNonNegativeInteger(
        input?.totals?.domicilioOrders,
        "totals.domicilioOrders"
      ),
      averageTicketCents: ensureNonNegativeInteger(
        input?.totals?.averageTicketCents,
        "totals.averageTicketCents"
      ),
      statusBreakdown: normalizeStatusBreakdown(input?.totals?.statusBreakdown),
    },
    topProducts: normalizeTopProducts(input.topProducts),
    orders: normalizeOrderSummaries(input.orders),
  };
}

function createCashClosureService({ app }) {
  if (!app || typeof app.getPath !== "function") {
    throw new Error("app non valido in createCashClosureService");
  }

  const closuresFilePath = path.join(app.getPath("userData"), "cash-closures.json");

  async function readAllClosures() {
    try {
      const raw = await fs.readFile(closuresFilePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.error("Unable to read cash closures:", error);
      }

      return [];
    }
  }

  async function writeAllClosures(items) {
    await fs.mkdir(path.dirname(closuresFilePath), { recursive: true });
    await fs.writeFile(closuresFilePath, JSON.stringify(items, null, 2), "utf8");
  }

  return {
    async listClosures(payload) {
      const limitRaw = payload && typeof payload === "object" ? payload.limit : null;
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
      const closures = await readAllClosures();

      return closures
        .slice()
        .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
        .slice(0, limit);
    },

    async createClosure(payload) {
      const normalized = normalizeClosureInput(payload);
      const nowIso = new Date().toISOString();

      const snapshot = {
        id: randomUUID(),
        businessDate: normalized.businessDate,
        shiftStartIso: normalized.shiftStartIso,
        shiftEndIso: normalized.shiftEndIso,
        notes: normalized.notes,
        totals: normalized.totals,
        topProducts: normalized.topProducts,
        orders: normalized.orders,
        closedAt: nowIso,
      };

      const existing = await readAllClosures();
      const merged = [snapshot, ...existing].slice(0, MAX_CLOSURES);
      await writeAllClosures(merged);

      return snapshot;
    },
  };
}

module.exports = {
  createCashClosureService,
};
