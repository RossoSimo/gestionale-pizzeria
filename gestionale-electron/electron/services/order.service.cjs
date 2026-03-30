const VALID_ORDER_TYPES = new Set(["ASPORTO", "DOMICILIO"]);
const VALID_ORDER_STATUS = new Set([
  "IN_ATTESA",
  "CONFERMATO",
  "IN_PREPARAZIONE",
  "PRONTO",
  "CONSEGNATO",
  "ANNULLATO",
]);
const EDITABLE_ORDER_STATUS = new Set(["IN_ATTESA", "CONFERMATO", "IN_PREPARAZIONE", "PRONTO"]);

const ALLOWED_STATUS_TRANSITIONS = {
  IN_ATTESA: ["CONFERMATO", "IN_PREPARAZIONE", "ANNULLATO"],
  CONFERMATO: ["IN_PREPARAZIONE", "ANNULLATO"],
  IN_PREPARAZIONE: ["PRONTO", "ANNULLATO"],
  PRONTO: ["CONSEGNATO", "ANNULLATO"],
  CONSEGNATO: [],
  ANNULLATO: [],
};

/**
 * Creates a structured domain validation error reusable across order rules.
 */
function buildValidationError(message, details) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.details = details;
  return error;
}

/**
 * Ensures a non-empty string for mandatory textual fields.
 */
function ensureString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }
}

/**
 * Ensures positive integer values for quantities.
 */
function ensurePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }
}

/**
 * Ensures integer values for cents-based monetary amounts.
 */
function ensureInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }
}

function normalizeOptionalNotes(value, field) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

function computeTotalAmountCents(items) {
  // Total is recomputed server-side to prevent trusting client-provided amounts.
  return items.reduce((orderTotal, item) => {
    const baseAmount = item.quantity * item.unitPriceCents;
    const modifiersPerUnit = (item.modifiers ?? []).reduce(
      (sum, modifier) => sum + modifier.priceAppliedCents,
      0
    );
    const modifiersAmount = modifiersPerUnit * item.quantity;

    return orderTotal + baseAmount + modifiersAmount;
  }, 0);
}

/**
 * Validates and normalizes a create-order payload before persistence.
 * This function is intentionally strict because the same endpoint is used
 * by multiple UI flows and eventually sync replays.
 */
function validateCreateOrderInput(input) {
  if (!input || typeof input !== "object") {
    throw buildValidationError("Payload ordine non valido");
  }

  if (!VALID_ORDER_TYPES.has(input.type)) {
    throw buildValidationError("Tipo ordine non valido", { field: "type" });
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw buildValidationError("L'ordine deve contenere almeno una riga", { field: "items" });
  }

  input.items.forEach((item, index) => {
    ensureString(item.productId, `items[${index}].productId`);
    ensurePositiveInteger(item.quantity, `items[${index}].quantity`);
    ensureInteger(item.unitPriceCents, `items[${index}].unitPriceCents`);

    (item.modifiers ?? []).forEach((modifier, modifierIndex) => {
      ensureString(
        modifier.ingredientId,
        `items[${index}].modifiers[${modifierIndex}].ingredientId`
      );

      if (!["AGGIUNGI", "RIMUOVI"].includes(modifier.action)) {
        throw buildValidationError("Azione modifier non valida", {
          field: `items[${index}].modifiers[${modifierIndex}].action`,
        });
      }

      ensureInteger(
        modifier.priceAppliedCents,
        `items[${index}].modifiers[${modifierIndex}].priceAppliedCents`
      );
    });
  });

  ensureInteger(input.totalAmountCents, "totalAmountCents");

  const computedTotal = computeTotalAmountCents(input.items);

  if (input.totalAmountCents !== computedTotal) {
    throw buildValidationError("Totale ordine non coerente con le righe", {
      field: "totalAmountCents",
      expected: computedTotal,
      actual: input.totalAmountCents,
    });
  }

  return {
    ...input,
    notes: normalizeOptionalNotes(input.notes, "notes"),
    status: input.status && VALID_ORDER_STATUS.has(input.status) ? input.status : "IN_ATTESA",
  };
}

function validateUpdateOrderInput(input) {
  ensureString(input?.orderId, "orderId");

  const validatedInput = validateCreateOrderInput(input);

  return {
    orderId: input.orderId,
    type: validatedInput.type,
    customerId: validatedInput.customerId ?? null,
    businessDate: validatedInput.businessDate,
    expectedAt: validatedInput.expectedAt,
    notes: validatedInput.notes,
    totalAmountCents: validatedInput.totalAmountCents,
    items: validatedInput.items,
  };
}

/**
 * Validates a status transition according to the local workflow state machine.
 */
function validateStatusTransition(currentStatus, nextStatus) {
  if (!VALID_ORDER_STATUS.has(nextStatus)) {
    throw buildValidationError("Stato ordine non valido", { field: "nextStatus" });
  }

  // Enforce a strict workflow so status changes remain predictable across devices.
  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

  if (!allowedTransitions.includes(nextStatus)) {
    const error = new Error("Transizione stato non consentita");
    error.code = "INVALID_STATUS_TRANSITION";
    error.details = { currentStatus, nextStatus };
    throw error;
  }
}

function createOrderService(orderRepository) {
  return {
    async listOrders(filters) {
      // Listing is a thin pass-through because filtering is persistence-oriented.
      return orderRepository.list(filters);
    },

    async createOrder(input) {
      // Business validation is centralized here before touching persistence layer.
      const validatedInput = validateCreateOrderInput(input);
      return orderRepository.create(validatedInput);
    },

    async updateOrder(input) {
      const validatedInput = validateUpdateOrderInput(input);
      const order = await orderRepository.getById(validatedInput.orderId);

      if (!order) {
        const error = new Error("Ordine non trovato");
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      if (!EDITABLE_ORDER_STATUS.has(order.status)) {
        const error = new Error("Ordine non modificabile nello stato corrente");
        error.code = "ORDER_NOT_EDITABLE";
        error.details = { currentStatus: order.status };
        throw error;
      }

      return orderRepository.update(validatedInput.orderId, validatedInput);
    },

    async deleteOrder(input) {
      ensureString(input?.orderId, "orderId");

      const order = await orderRepository.getById(input.orderId);

      if (!order) {
        const error = new Error("Ordine non trovato");
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      return orderRepository.softDelete(input.orderId);
    },

    async updateOrderStatus(input) {
      // Service enforces transition rules before writing to repository.
      ensureString(input?.orderId, "orderId");
      ensureString(input?.nextStatus, "nextStatus");

      const order = await orderRepository.getById(input.orderId);

      if (!order) {
        const error = new Error("Ordine non trovato");
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      validateStatusTransition(order.status, input.nextStatus);
      return orderRepository.updateStatus(input.orderId, input.nextStatus);
    },
  };
}

module.exports = { createOrderService };
