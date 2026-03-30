const { Prisma } = require("@prisma/client");

const DEFAULT_SETTINGS_ID = "default";
const DEFAULT_APP_SETTINGS = {
  openingTime: "18:00",
  closingTime: "23:00",
  slotMinutes: 20,
  categoryPizzaLabel: "Pizze",
  categoryBevandaLabel: "Bevanda",
  categoryAltroLabel: "Altro",
  extraCategoriesJson:
    '[{"key":"PIZZA_STAGIONALI","label":"Pizze stagionali"},{"key":"PIZZA_SPECIALI","label":"Pizze speciali"}]',
};

const BASE_CATEGORY_KEYS = ["PIZZA", "BEVANDA", "ALTRO"];

function parseExtraCategoryEntries(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        key: typeof entry.key === "string" ? entry.key.trim() : "",
        label: typeof entry.label === "string" ? entry.label.trim() : "",
      }))
      .filter((entry) => entry.key && entry.label && !BASE_CATEGORY_KEYS.includes(entry.key));
  } catch {
    return [];
  }
}

function buildCategoryLabels(appSettings) {
  const labels = {
    PIZZA: appSettings.categoryPizzaLabel,
    BEVANDA: appSettings.categoryBevandaLabel,
    ALTRO: appSettings.categoryAltroLabel,
  };

  for (const categoryEntry of parseExtraCategoryEntries(appSettings.extraCategoriesJson)) {
    labels[categoryEntry.key] = categoryEntry.label;
  }

  return labels;
}

function buildExtraCategoriesJson(categoryLabels) {
  const extras = Object.entries(categoryLabels ?? {})
    .filter(([key, label]) => !BASE_CATEGORY_KEYS.includes(key) && typeof label === "string" && label.trim())
    .map(([key, label]) => ({ key, label: label.trim() }));

  return JSON.stringify(extras);
}

const IT_WEEKDAY_ORDER = [
  "LUNEDI",
  "MARTEDI",
  "MERCOLEDI",
  "GIOVEDI",
  "VENERDI",
  "SABATO",
  "DOMENICA",
];

const EN_WEEKDAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const WEEKDAY_ALIASES_TO_IT = {
  MONDAY: "LUNEDI",
  TUESDAY: "MARTEDI",
  WEDNESDAY: "MERCOLEDI",
  THURSDAY: "GIOVEDI",
  FRIDAY: "VENERDI",
  SATURDAY: "SABATO",
  SUNDAY: "DOMENICA",
};

function getRuntimeWeekdayOrder() {
  const runtimeWeekdayEnum = Prisma?.Weekday;

  if (runtimeWeekdayEnum && IT_WEEKDAY_ORDER.every((day) => runtimeWeekdayEnum[day] === day)) {
    return IT_WEEKDAY_ORDER;
  }

  if (runtimeWeekdayEnum && EN_WEEKDAY_ORDER.every((day) => runtimeWeekdayEnum[day] === day)) {
    return EN_WEEKDAY_ORDER;
  }

  return IT_WEEKDAY_ORDER;
}

const WEEKDAY_ORDER = getRuntimeWeekdayOrder();

function normalizeWeekdayForRuntime(weekday) {
  if (typeof weekday !== "string") {
    return weekday;
  }

  if (WEEKDAY_ORDER.includes(weekday)) {
    return weekday;
  }

  if (IT_WEEKDAY_ORDER.includes(weekday) && EN_WEEKDAY_ORDER.includes(weekday) === false) {
    const itIndex = IT_WEEKDAY_ORDER.indexOf(weekday);
    return WEEKDAY_ORDER[itIndex] ?? weekday;
  }

  if (EN_WEEKDAY_ORDER.includes(weekday) && IT_WEEKDAY_ORDER.includes(weekday) === false) {
    const enIndex = EN_WEEKDAY_ORDER.indexOf(weekday);
    return WEEKDAY_ORDER[enIndex] ?? weekday;
  }

  const normalizedFromAlias = WEEKDAY_ALIASES_TO_IT[weekday] ?? weekday;
  const aliasIndex = IT_WEEKDAY_ORDER.indexOf(normalizedFromAlias);
  return aliasIndex >= 0 ? WEEKDAY_ORDER[aliasIndex] : weekday;
}

const DEFAULT_DAY_SETTINGS = {
  isOpen: true,
  openingTime: "18:00",
  closingTime: "23:00",
  slotMinutes: 20,
};

function sortWeeklySchedule(days) {
  const orderMap = new Map(WEEKDAY_ORDER.map((day, index) => [day, index]));
  return [...days].sort(
    (a, b) =>
      (orderMap.get(normalizeWeekdayForRuntime(a.weekday)) ?? 99) -
      (orderMap.get(normalizeWeekdayForRuntime(b.weekday)) ?? 99)
  );
}

async function ensureDefaultSettingsRow(tx) {
  // Use SQL-first bootstrap/repair so Prisma does not crash when legacy rows contain invalid types.
  await tx.$executeRaw`
    INSERT OR IGNORE INTO "AppSettings" (
      "id",
      "openingTime",
      "closingTime",
      "slotMinutes",
      "categoryPizzaLabel",
      "categoryBevandaLabel",
      "categoryAltroLabel",
      "extraCategoriesJson",
      "createdAt",
      "updatedAt",
      "version",
      "syncStatus"
    ) VALUES (
      ${DEFAULT_SETTINGS_ID},
      ${DEFAULT_APP_SETTINGS.openingTime},
      ${DEFAULT_APP_SETTINGS.closingTime},
      ${DEFAULT_APP_SETTINGS.slotMinutes},
      ${DEFAULT_APP_SETTINGS.categoryPizzaLabel},
      ${DEFAULT_APP_SETTINGS.categoryBevandaLabel},
      ${DEFAULT_APP_SETTINGS.categoryAltroLabel},
      ${DEFAULT_APP_SETTINGS.extraCategoriesJson},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      1,
      'PENDING'
    )
  `;

  await tx.$executeRaw`
    UPDATE "AppSettings"
    SET
      "slotMinutes" = CASE
        WHEN typeof("slotMinutes") = 'integer' THEN "slotMinutes"
        ELSE ${DEFAULT_APP_SETTINGS.slotMinutes}
      END,
      "version" = CASE
        WHEN typeof("version") = 'integer' THEN "version"
        ELSE 1
      END,
      "categoryPizzaLabel" = COALESCE(NULLIF(TRIM("categoryPizzaLabel"), ''), ${DEFAULT_APP_SETTINGS.categoryPizzaLabel}),
      "categoryBevandaLabel" = COALESCE(NULLIF(TRIM("categoryBevandaLabel"), ''), ${DEFAULT_APP_SETTINGS.categoryBevandaLabel}),
      "categoryAltroLabel" = COALESCE(NULLIF(TRIM("categoryAltroLabel"), ''), ${DEFAULT_APP_SETTINGS.categoryAltroLabel}),
      "extraCategoriesJson" = COALESCE(NULLIF(TRIM("extraCategoriesJson"), ''), ${DEFAULT_APP_SETTINGS.extraCategoriesJson}),
      "syncStatus" = CASE
        WHEN TRIM("syncStatus") IN ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT') THEN TRIM("syncStatus")
        ELSE 'PENDING'
      END,
      "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
    WHERE "id" = ${DEFAULT_SETTINGS_ID}
  `;

  return tx.appSettings.findUnique({
    where: {
      id: DEFAULT_SETTINGS_ID,
    },
  });
}

async function ensureDefaultBusinessDays(tx) {
  const existingDays = await tx.businessDaySettings.findMany({
    where: {
      settingsId: DEFAULT_SETTINGS_ID,
      deletedAt: null,
    },
  });

  const existingWeekdays = new Set(existingDays.map((day) => day.weekday));

  for (const runtimeWeekday of WEEKDAY_ORDER) {
    const weekday = normalizeWeekdayForRuntime(runtimeWeekday);
    if (existingWeekdays.has(weekday)) {
      continue;
    }

    await tx.businessDaySettings.create({
      data: {
        settingsId: DEFAULT_SETTINGS_ID,
        weekday,
        ...DEFAULT_DAY_SETTINGS,
        syncStatus: "PENDING",
      },
    });
  }
}

function createAppSettingsRepository(db) {
  if (!db) {
    throw new Error("DB client non inizializzato in createAppSettingsRepository");
  }

  return {
    async get() {
      return db.$transaction(async (tx) => {
        const appSettings = await ensureDefaultSettingsRow(tx);
        await ensureDefaultBusinessDays(tx);

        const weeklySchedule = await tx.businessDaySettings.findMany({
          where: {
            settingsId: DEFAULT_SETTINGS_ID,
            deletedAt: null,
          },
        });

        return {
          ...appSettings,
          categoryLabels: buildCategoryLabels(appSettings),
          weeklySchedule: sortWeeklySchedule(weeklySchedule),
        };
      });
    },

    async update(input) {
      await db.$transaction(async (tx) => {
        await ensureDefaultSettingsRow(tx);

        await tx.appSettings.update({
          where: {
            id: DEFAULT_SETTINGS_ID,
          },
          data: {
            openingTime: input.openingTime,
            closingTime: input.closingTime,
            slotMinutes: input.slotMinutes,
            categoryPizzaLabel: input.categoryLabels.PIZZA,
            categoryBevandaLabel: input.categoryLabels.BEVANDA,
            categoryAltroLabel: input.categoryLabels.ALTRO,
            extraCategoriesJson: buildExtraCategoriesJson(input.categoryLabels),
            version: {
              increment: 1,
            },
            syncStatus: "PENDING",
          },
        });

        for (const day of input.weeklySchedule) {
          const runtimeWeekday = normalizeWeekdayForRuntime(day.weekday);
          const existing = await tx.businessDaySettings.findUnique({
            where: {
              weekday: runtimeWeekday,
            },
          });

          if (existing) {
            await tx.businessDaySettings.update({
              where: {
                weekday: runtimeWeekday,
              },
              data: {
                settingsId: DEFAULT_SETTINGS_ID,
                isOpen: day.isOpen,
                openingTime: day.openingTime,
                closingTime: day.closingTime,
                slotMinutes: day.slotMinutes,
                deletedAt: null,
                version: {
                  increment: 1,
                },
                syncStatus: "PENDING",
              },
            });
            continue;
          }

          await tx.businessDaySettings.create({
            data: {
              settingsId: DEFAULT_SETTINGS_ID,
              weekday: runtimeWeekday,
              isOpen: day.isOpen,
              openingTime: day.openingTime,
              closingTime: day.closingTime,
              slotMinutes: day.slotMinutes,
              syncStatus: "PENDING",
            },
          });
        }
      });

      return this.get();
    },
  };
}

module.exports = { createAppSettingsRepository };
