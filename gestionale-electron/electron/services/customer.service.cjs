function createCustomerService(customerRepository) {
  const PHONE_ALLOWED_PATTERN = /^\+?[0-9\s()\-]{6,20}$/;

  function getTodayBusinessDate() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function buildValidationError(message, details) {
    const error = new Error(message);
    error.code = "VALIDATION_ERROR";
    error.details = details;
    return error;
  }

  function ensureString(value, field) {
    if (typeof value !== "string" || !value.trim()) {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }
  }

  function normalizeOptionalString(value, field) {
    if (value == null) {
      return null;
    }

    if (typeof value !== "string") {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  function normalizeOptionalPhone(value, field) {
    const normalized = normalizeOptionalString(value, field);

    if (normalized == null) {
      return null;
    }

    if (!PHONE_ALLOWED_PATTERN.test(normalized)) {
      throw buildValidationError("Numero di telefono non valido", { field });
    }

    const digitsOnly = normalized.replace(/\D/g, "");

    if (digitsOnly.length < 6 || digitsOnly.length > 15) {
      throw buildValidationError("Numero di telefono non valido", { field });
    }

    return normalized;
  }

  function normalizeCreatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw buildValidationError("Payload cliente non valido");
    }

    ensureString(payload.name, "name");

    const isTemporary = Boolean(payload.isTemporary);

    return {
      name: payload.name.trim(),
      phone: normalizeOptionalPhone(payload.phone, "phone"),
      address: normalizeOptionalString(payload.address, "address"),
      notes: normalizeOptionalString(payload.notes, "notes"),
      isTemporary,
      temporaryBusinessDate: isTemporary ? getTodayBusinessDate() : null,
    };
  }

  return {
    async listCustomers(filters = {}) {
      const mappedFilters = {
        page: Number.isInteger(filters.page) ? filters.page : 1,
        pageSize: Number.isInteger(filters.pageSize) ? filters.pageSize : 100,
      };

      if (typeof filters.search === "string" && filters.search.trim()) {
        mappedFilters.search = filters.search.trim();
      }

      return customerRepository.list(mappedFilters);
    },

    async createCustomer(payload) {
      const normalizedPayload = normalizeCreatePayload(payload);
      return customerRepository.create(normalizedPayload);
    },

    async updateCustomer(payload) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw buildValidationError("Payload update cliente non valido");
      }

      ensureString(payload.id, "id");
      const normalizedPayload = normalizeCreatePayload(payload);
      return customerRepository.update(payload.id.trim(), normalizedPayload);
    },

    async deleteCustomer(payload) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw buildValidationError("Payload delete cliente non valido");
      }

      ensureString(payload.id, "id");
      return customerRepository.softDelete(payload.id.trim());
    },
  };
}

module.exports = { createCustomerService };
