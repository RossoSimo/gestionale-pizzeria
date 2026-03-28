/**
 * Parses positive integer inputs used for pagination and falls back to a safe default.
 */
function normalizePositiveInt(value, fallback) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

/**
 * Converts any date-like value to the business-day key used by daily numbering.
 * The returned date is normalized to midnight local time.
 */
function normalizeBusinessDate(rawDate) {
  const date = rawDate ? new Date(rawDate) : new Date();

  if (Number.isNaN(date.getTime())) {
    const error = new Error("businessDate non valida");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function createOrderRepository(db) {
  if (!db) {
    throw new Error("DB client non inizializzato in createOrderRepository");
  }

  return {
    async list(options = {}) {
      // List supports operational filters used by kitchen/counter views.
      const page = normalizePositiveInt(options.page, 1);
      const pageSize = Math.min(normalizePositiveInt(options.pageSize, 20), 100);

      const where = {
        deletedAt: null,
      };

      if (options.status) {
        where.status = options.status;
      }

      if (options.businessDateFrom || options.businessDateTo) {
        where.businessDate = {};

        if (options.businessDateFrom) {
          where.businessDate.gte = normalizeBusinessDate(options.businessDateFrom);
        }

        if (options.businessDateTo) {
          where.businessDate.lte = normalizeBusinessDate(options.businessDateTo);
        }
      }

      // Count + page query are executed together to keep pagination metadata consistent.
      const [total, data] = await Promise.all([
        db.order.count({ where }),
        db.order.findMany({
          where,
          orderBy: [
            { businessDate: "desc" },
            { dailyNumber: "desc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            customer: true,
            items: {
              include: {
                modifiers: true,
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

    async getById(orderId) {
      // Used by services before applying domain transitions.
      return db.order.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
        },
      });
    },

    async create(input) {
      // Each order creation is atomic: header + items + modifiers in one transaction.
      const businessDate = normalizeBusinessDate(input.businessDate);
      const expectedAt = input.expectedAt ? new Date(input.expectedAt) : null;

      return db.$transaction(async (tx) => {
        // `dailyNumber` is generated per business day inside the same transaction.
        const lastOrder = await tx.order.findFirst({
          where: {
            businessDate,
            deletedAt: null,
          },
          orderBy: {
            dailyNumber: "desc",
          },
        });

        const nextDailyNumber = (lastOrder?.dailyNumber ?? 0) + 1;

        return tx.order.create({
          data: {
            businessDate,
            dailyNumber: nextDailyNumber,
            status: input.status,
            type: input.type,
            totalAmountCents: input.totalAmountCents,
            notes: input.notes ?? null,
            expectedAt,
            customerId: input.customerId ?? null,
            syncStatus: "PENDING",
            items: {
              create: input.items.map((item) => ({
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                notes: item.notes ?? null,
                productId: item.productId,
                syncStatus: "PENDING",
                modifiers: {
                  create: (item.modifiers ?? []).map((modifier) => ({
                    action: modifier.action,
                    priceAppliedCents: modifier.priceAppliedCents,
                    ingredientId: modifier.ingredientId,
                    syncStatus: "PENDING",
                  })),
                },
              })),
            },
          },
          include: {
            customer: true,
            items: {
              include: {
                modifiers: true,
              },
            },
          },
        });
      });
    },

    async updateStatus(orderId, nextStatus) {
      // Explicit existence check gives a domain-level error instead of a generic Prisma error.
      const existingOrder = await db.order.findFirst({
        where: {
          id: orderId,
          deletedAt: null,
        },
      });

      if (!existingOrder) {
        const error = new Error("Ordine non trovato");
        error.code = "ORDER_NOT_FOUND";
        throw error;
      }

      return db.order.update({
        where: {
          id: orderId,
        },
        data: {
          status: nextStatus,
          version: {
            increment: 1,
          },
          syncStatus: "PENDING",
        },
      });
    },
  };
}

module.exports = { createOrderRepository };
