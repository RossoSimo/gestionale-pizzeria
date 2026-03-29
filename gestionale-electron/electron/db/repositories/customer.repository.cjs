function normalizePositiveInt(value, fallback) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function getTodayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function createCustomerRepository(db) {
  if (!db) {
    throw new Error("DB client non inizializzato in createCustomerRepository");
  }

  return {
    async list(options = {}) {
      const page = normalizePositiveInt(options.page, 1);
      const pageSize = Math.min(normalizePositiveInt(options.pageSize, 100), 200);

      const { start, end } = getTodayBounds();

      await db.customer.updateMany({
        where: {
          deletedAt: null,
          isTemporary: true,
          OR: [
            {
              temporaryBusinessDate: null,
            },
            {
              temporaryBusinessDate: {
                lt: start,
              },
            },
            {
              temporaryBusinessDate: {
                gte: end,
              },
            },
          ],
        },
        data: {
          deletedAt: new Date(),
          syncStatus: "PENDING",
        },
      });

      const where = {
        deletedAt: null,
        OR: [
          {
            isTemporary: false,
          },
          {
            isTemporary: true,
            temporaryBusinessDate: {
              gte: start,
              lt: end,
            },
          },
        ],
      };

      if (options.search) {
        where.AND = [
          {
            OR: [
              {
                name: {
                  contains: options.search,
                },
              },
              {
                phone: {
                  contains: options.search,
                },
              },
              {
                address: {
                  contains: options.search,
                },
              },
            ],
          },
        ];
      }

      const [total, data] = await Promise.all([
        db.customer.count({ where }),
        db.customer.findMany({
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
      return db.customer.create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          isTemporary: Boolean(input.isTemporary),
          temporaryBusinessDate: input.temporaryBusinessDate ?? null,
          syncStatus: "PENDING",
        },
      });
    },

    async update(customerId, input) {
      return db.customer.update({
        where: {
          id: customerId,
        },
        data: {
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          isTemporary: Boolean(input.isTemporary),
          temporaryBusinessDate: input.temporaryBusinessDate ?? null,
          version: {
            increment: 1,
          },
          syncStatus: "PENDING",
        },
      });
    },

    async softDelete(customerId) {
      return db.customer.update({
        where: {
          id: customerId,
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

module.exports = { createCustomerRepository };
