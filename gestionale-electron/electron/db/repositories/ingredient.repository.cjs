function normalizePositiveInt(value, fallback) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function createIngredientRepository(db) {
  if (!db) {
    throw new Error("DB client non inizializzato in createIngredientRepository");
  }

  return {
    async list(options = {}) {
      const page = normalizePositiveInt(options.page, 1);
      const pageSize = Math.min(normalizePositiveInt(options.pageSize, 100), 200);

      const where = {
        deletedAt: null,
      };

      if (options.search) {
        where.name = {
          contains: options.search,
        };
      }

      const [total, data] = await Promise.all([
        db.ingredient.count({ where }),
        db.ingredient.findMany({
          where,
          orderBy: {
            name: "asc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return {
        data,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },

    async create(input) {
      return db.ingredient.create({
        data: {
          name: input.name,
          extraPriceCents: input.extraPriceCents,
          removeDiscountCents: input.removeDiscountCents,
          syncStatus: "PENDING",
        },
      });
    },

    async update(ingredientId, input) {
      return db.ingredient.update({
        where: {
          id: ingredientId,
        },
        data: {
          name: input.name,
          extraPriceCents: input.extraPriceCents,
          removeDiscountCents: input.removeDiscountCents,
          version: {
            increment: 1,
          },
          syncStatus: "PENDING",
        },
      });
    },

    async softDelete(ingredientId) {
      return db.ingredient.update({
        where: {
          id: ingredientId,
        },
        data: {
          deletedAt: new Date(),
          version: {
            increment: 1,
          },
          syncStatus: "PENDING",
        },
      });
    },
  };
}

module.exports = { createIngredientRepository };
