function createIngredientService(ingredientRepository) {
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

  function ensureInteger(value, field) {
    if (!Number.isInteger(value)) {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }
  }

  function ensureNonNegativeInteger(value, field) {
    ensureInteger(value, field);

    if (value < 0) {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }
  }

  function normalizePayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw buildValidationError("Payload ingrediente non valido");
    }

    ensureString(payload.name, "name");
    ensureNonNegativeInteger(payload.extraPriceCents, "extraPriceCents");
    ensureNonNegativeInteger(payload.removeDiscountCents, "removeDiscountCents");

    return {
      name: payload.name.trim(),
      extraPriceCents: payload.extraPriceCents,
      removeDiscountCents: payload.removeDiscountCents,
    };
  }

  return {
    async listIngredients(filters = {}) {
      const mappedFilters = {
        page: Number.isInteger(filters.page) ? filters.page : 1,
        pageSize: Number.isInteger(filters.pageSize) ? filters.pageSize : 100,
      };

      if (typeof filters.search === "string" && filters.search.trim()) {
        mappedFilters.search = filters.search.trim();
      }

      return ingredientRepository.list(mappedFilters);
    },

    async createIngredient(payload) {
      const normalizedPayload = normalizePayload(payload);
      return ingredientRepository.create(normalizedPayload);
    },

    async updateIngredient(payload) {
      if (!payload || typeof payload !== "object") {
        throw buildValidationError("Payload update ingrediente non valido");
      }

      ensureString(payload.id, "id");
      const normalizedPayload = normalizePayload(payload);
      return ingredientRepository.update(payload.id.trim(), normalizedPayload);
    },

    async deleteIngredient(payload) {
      if (!payload || typeof payload !== "object") {
        throw buildValidationError("Payload delete ingrediente non valido");
      }

      ensureString(payload.id, "id");
      return ingredientRepository.softDelete(payload.id.trim());
    },
  };
}

module.exports = { createIngredientService };
