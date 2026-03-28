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
          include: {
            productIngredients: {
              where: {
                deletedAt: null,
                ingredient: {
                  deletedAt: null,
                },
              },
              include: {
                ingredient: true,
              },
            },
          },
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
      // Product and base ingredients are created atomically to keep menu composition aligned.
      return db.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            name: input.name,
            description: input.description ?? null,
            priceCents: input.priceCents,
            category: input.category,
            syncStatus: "PENDING",
          },
        });

        if (Array.isArray(input.ingredientIds) && input.ingredientIds.length > 0) {
          await tx.productIngredient.createMany({
            data: input.ingredientIds.map((ingredientId) => ({
              productId: createdProduct.id,
              ingredientId,
              syncStatus: "PENDING",
            })),
          });
        }

        return tx.product.findUnique({
          where: {
            id: createdProduct.id,
          },
          include: {
            productIngredients: {
              where: {
                deletedAt: null,
                ingredient: {
                  deletedAt: null,
                },
              },
              include: {
                ingredient: true,
              },
            },
          },
        });
      });
    },

    async update(productId, input) {
      // Keep ingredient links in sync with current product composition.
      return db.$transaction(async (tx) => {
        const activeLinks = await tx.productIngredient.findMany({
          where: {
            productId,
            deletedAt: null,
          },
        });

        const requestedIds = new Set(Array.isArray(input.ingredientIds) ? input.ingredientIds : []);
        const activeByIngredientId = new Map(activeLinks.map((link) => [link.ingredientId, link]));

        const linkIdsToSoftDelete = activeLinks
          .filter((link) => !requestedIds.has(link.ingredientId))
          .map((link) => link.id);

        if (linkIdsToSoftDelete.length > 0) {
          await tx.productIngredient.updateMany({
            where: {
              id: {
                in: linkIdsToSoftDelete,
              },
            },
            data: {
              deletedAt: new Date(),
              version: {
                increment: 1,
              },
              syncStatus: "PENDING",
            },
          });
        }

        for (const ingredientId of requestedIds) {
          if (activeByIngredientId.has(ingredientId)) {
            continue;
          }

          const existingLink = await tx.productIngredient.findFirst({
            where: {
              productId,
              ingredientId,
            },
          });

          if (existingLink) {
            await tx.productIngredient.update({
              where: {
                id: existingLink.id,
              },
              data: {
                deletedAt: null,
                version: {
                  increment: 1,
                },
                syncStatus: "PENDING",
              },
            });
          } else {
            await tx.productIngredient.create({
              data: {
                productId,
                ingredientId,
                syncStatus: "PENDING",
              },
            });
          }
        }

        await tx.product.update({
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

        return tx.product.findUnique({
          where: {
            id: productId,
          },
          include: {
            productIngredients: {
              where: {
                deletedAt: null,
                ingredient: {
                  deletedAt: null,
                },
              },
              include: {
                ingredient: true,
              },
            },
          },
        });
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
