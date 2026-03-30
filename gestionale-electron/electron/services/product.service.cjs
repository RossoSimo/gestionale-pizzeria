function createProductService(productRepository) {
  const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);

  /**
   * Creates standardized validation errors for product operations.
   */
  function buildValidationError(message, details) {
    const error = new Error(message);
    error.code = "VALIDATION_ERROR";
    error.details = details;
    return error;
  }

  /**
   * Validates required string fields and rejects empty values.
   */
  function ensureString(value, field) {
    if (typeof value !== "string" || !value.trim()) {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }
  }

  /**
   * Validates integer-only fields (cents, counters, etc.).
   */
  function ensureInteger(value, field) {
    if (!Number.isInteger(value)) {
      throw buildValidationError(`Campo non valido: ${field}`, { field });
    }
  }

  /**
   * Normalizes create/update payloads so repository receives a clean structure.
   */
  function normalizeUpsertPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw buildValidationError("Payload prodotto non valido");
    }

    ensureString(payload.name, "name");
    ensureInteger(payload.priceCents, "priceCents");
    ensureString(payload.category, "category");

    if (payload.ingredientIds != null && !Array.isArray(payload.ingredientIds)) {
      throw buildValidationError("ingredientIds deve essere un array", { field: "ingredientIds" });
    }

    const ingredientIds = Array.isArray(payload.ingredientIds)
      ? payload.ingredientIds
          .filter((value) => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const dedupedIngredientIds = Array.from(new Set(ingredientIds));

    // Normalize strings once so repository receives clean, deterministic payloads.
    return {
      name: payload.name.trim(),
      description:
        typeof payload.description === "string" && payload.description.trim()
          ? payload.description.trim()
          : null,
      priceCents: payload.priceCents,
      category: payload.category.trim(),
      ingredientIds: PIZZA_FAMILY_CATEGORY_KEYS.has(payload.category.trim()) ? dedupedIngredientIds : [],
    };
  }

  return {
    async listProducts(filters = {}) {
      // Keep filter normalization in service so repository remains persistence-focused.
      const mappedFilters = {
        includeDeleted: Boolean(filters.includeDeleted),
        page: Number.isInteger(filters.page) ? filters.page : 1,
        pageSize: Number.isInteger(filters.pageSize) ? filters.pageSize : 50,
      };

      if (typeof filters.search === "string" && filters.search.trim()) {
        mappedFilters.search = filters.search.trim();
      }

      if (typeof filters.category === "string" && filters.category.trim()) {
        mappedFilters.category = filters.category.trim();
      }

      return productRepository.list(mappedFilters);
    },

    async createProduct(payload) {
      // Centralized payload normalization avoids duplication across callers.
      const normalizedPayload = normalizeUpsertPayload(payload);
      return productRepository.create(normalizedPayload);
    },

    async updateProduct(payload) {
      if (!payload || typeof payload !== "object") {
        throw buildValidationError("Payload update prodotto non valido");
      }

      ensureString(payload.id, "id");
      const normalizedPayload = normalizeUpsertPayload(payload);
      return productRepository.update(payload.id, normalizedPayload);
    },

    async deleteProduct(payload) {
      // Delete is soft-delete in repository, but service validates request semantics.
      if (!payload || typeof payload !== "object") {
        throw buildValidationError("Payload delete prodotto non valido");
      }

      ensureString(payload.id, "id");
      return productRepository.softDelete(payload.id);
    },
  };
}

module.exports = { createProductService };
