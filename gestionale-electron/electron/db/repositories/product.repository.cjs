/**
 * Parses positive integer inputs used for pagination and applies a fallback value.
 */
function normalizePositiveInt(value, fallback) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function createProductRepository(db) {
  if (!db) {
    throw new Error("DB client non inizializzato in createProductRepository");
  }

  return {
    async list(options = {}) {
      // Product list powers both management screens and order composition.
      const page = normalizePositiveInt(options.page, 1);
      const pageSize = Math.min(normalizePositiveInt(options.pageSize, 50), 100);

      const where = {};

      if (!options.includeDeleted) {
        // By default, soft-deleted products are hidden from operational views.
        where.deletedAt = null;
      }

      if (options.category) {
        where.category = options.category;
      }

      if (options.search) {
        where.name = {
          contains: options.search,
        };
      }

      const [total, data] = await Promise.all([
        db.product.count({ where }),
        db.product.findMany({
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
      // New products start as PENDING so sync can push them to cloud later.
      return db.product.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          category: input.category,
          syncStatus: "PENDING",
        },
      });
    },

    async update(productId, input) {
      // Version is incremented on every mutation to support conflict checks.
      return db.product.update({
        where: {
          id: productId,
        },
        data: {
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          category: input.category,
          version: {
            increment: 1,
          },
          syncStatus: "PENDING",
        },
      });
    },

    async softDelete(productId) {
      // Soft delete preserves row history for sync/conflict resolution.
      return db.product.update({
        where: {
          id: productId,
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

module.exports = { createProductRepository };
