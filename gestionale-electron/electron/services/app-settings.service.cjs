const { Prisma } = require("@prisma/client");

const VALID_SLOT_MINUTES = new Set([5, 10, 15, 20, 30, 60]);
const IT_WEEKDAYS = [
  "LUNEDI",
  "MARTEDI",
  "MERCOLEDI",
  "GIOVEDI",
  "VENERDI",
  "SABATO",
  "DOMENICA",
];

const EN_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function getRuntimeWeekdays() {
  const runtimeWeekdayEnum = Prisma?.Weekday;

  if (runtimeWeekdayEnum && IT_WEEKDAYS.every((day) => runtimeWeekdayEnum[day] === day)) {
    return IT_WEEKDAYS;
  }

  if (runtimeWeekdayEnum && EN_WEEKDAYS.every((day) => runtimeWeekdayEnum[day] === day)) {
    return EN_WEEKDAYS;
  }

  return IT_WEEKDAYS;
}

const RUNTIME_WEEKDAYS = getRuntimeWeekdays();
const VALID_WEEKDAYS = new Set(RUNTIME_WEEKDAYS);

const DEFAULT_DAY_SETTINGS = {
  isOpen: true,
  openingTime: "18:00",
  closingTime: "23:00",
  slotMinutes: 20,
};

const DEFAULT_CATEGORY_LABELS = {
  PIZZA: "Pizze",
  PIZZA_STAGIONALI: "Pizze stagionali",
  PIZZA_SPECIALI: "Pizze speciali",
  BEVANDA: "Bevanda",
  ALTRO: "Altro",
};

const BASE_CATEGORY_KEYS = Object.keys(DEFAULT_CATEGORY_LABELS);

function normalizeCategoryKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildValidationError(message, details) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  error.details = details;
  return error;
}

function parseTimeToMinutes(value, field) {
  if (typeof value !== "string") {
    throw buildValidationError(`Campo non valido: ${field}`, { field });
  }

  const normalizedValue = value.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(normalizedValue);

  if (!match) {
    throw buildValidationError(`Formato orario non valido: ${field}`, { field });
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    throw buildValidationError(`Valore orario non valido: ${field}`, { field });
  }

  return {
    value: normalizedValue,
    minutesFromStart: hours * 60 + minutes,
  };
}

function normalizeSlotMinutes(value) {
  if (!Number.isInteger(value) || !VALID_SLOT_MINUTES.has(value)) {
    throw buildValidationError("Intervallo slot non valido", {
      field: "slotMinutes",
      allowedValues: Array.from(VALID_SLOT_MINUTES.values()),
    });
  }

  return value;
}

function normalizeWeekdayValue(weekday) {
  if (typeof weekday !== "string") {
    return weekday;
  }

  if (VALID_WEEKDAYS.has(weekday)) {
    return weekday;
  }

  const itIndex = IT_WEEKDAYS.indexOf(weekday);

  if (itIndex >= 0) {
    return RUNTIME_WEEKDAYS[itIndex] ?? weekday;
  }

  const enIndex = EN_WEEKDAYS.indexOf(weekday);

  if (enIndex >= 0) {
    return RUNTIME_WEEKDAYS[enIndex] ?? weekday;
  }

  return weekday;
}

function normalizeCategoryLabels(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  const normalizedBase = {
    PIZZA:
      typeof source.PIZZA === "string" && source.PIZZA.trim()
        ? source.PIZZA.trim()
        : DEFAULT_CATEGORY_LABELS.PIZZA,
    PIZZA_STAGIONALI:
      typeof source.PIZZA_STAGIONALI === "string" && source.PIZZA_STAGIONALI.trim()
        ? source.PIZZA_STAGIONALI.trim()
        : DEFAULT_CATEGORY_LABELS.PIZZA_STAGIONALI,
    PIZZA_SPECIALI:
      typeof source.PIZZA_SPECIALI === "string" && source.PIZZA_SPECIALI.trim()
        ? source.PIZZA_SPECIALI.trim()
        : DEFAULT_CATEGORY_LABELS.PIZZA_SPECIALI,
    BEVANDA:
      typeof source.BEVANDA === "string" && source.BEVANDA.trim()
        ? source.BEVANDA.trim()
        : DEFAULT_CATEGORY_LABELS.BEVANDA,
    ALTRO:
      typeof source.ALTRO === "string" && source.ALTRO.trim()
        ? source.ALTRO.trim()
        : DEFAULT_CATEGORY_LABELS.ALTRO,
  };

  const extraCategories = {};

  for (const [rawKey, rawLabel] of Object.entries(source)) {
    const key = normalizeCategoryKey(rawKey);

    if (!key || BASE_CATEGORY_KEYS.includes(key)) {
      continue;
    }

    const normalizedLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";

    if (!normalizedLabel) {
      continue;
    }

    extraCategories[key] = normalizedLabel;
  }

  return {
    ...normalizedBase,
    ...extraCategories,
  };
}

function normalizeDaySchedule(day, index) {
  if (!day || typeof day !== "object" || Array.isArray(day)) {
    throw buildValidationError("Configurazione giorno non valida", {
      field: `weeklySchedule[${index}]`,
    });
  }

  const normalizedWeekday = normalizeWeekdayValue(day.weekday);

  if (!VALID_WEEKDAYS.has(normalizedWeekday)) {
    throw buildValidationError("Giorno settimana non valido", {
      field: `weeklySchedule[${index}].weekday`,
    });
  }

  const isOpen = Boolean(day.isOpen);
  const opening = parseTimeToMinutes(day.openingTime, `weeklySchedule[${index}].openingTime`);
  const closing = parseTimeToMinutes(day.closingTime, `weeklySchedule[${index}].closingTime`);
  const slotMinutes = normalizeSlotMinutes(day.slotMinutes);

  if (isOpen && closing.minutesFromStart <= opening.minutesFromStart) {
    throw buildValidationError("L'orario di chiusura deve essere successivo all'orario di apertura", {
      field: `weeklySchedule[${index}].closingTime`,
      weekday: day.weekday,
    });
  }

  if (isOpen && closing.minutesFromStart - opening.minutesFromStart < slotMinutes) {
    throw buildValidationError("La finestra di apertura deve contenere almeno uno slot", {
      field: `weeklySchedule[${index}].slotMinutes`,
      weekday: day.weekday,
    });
  }

  return {
    weekday: normalizedWeekday,
    isOpen,
    openingTime: opening.value,
    closingTime: closing.value,
    slotMinutes,
  };
}

function createAppSettingsService(appSettingsRepository) {
  return {
    async getSettings() {
      return appSettingsRepository.get();
    },

    async updateSettings(payload) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw buildValidationError("Payload impostazioni non valido");
      }

      if (!Array.isArray(payload.weeklySchedule) || payload.weeklySchedule.length === 0) {
        throw buildValidationError("La configurazione settimanale e obbligatoria", {
          field: "weeklySchedule",
        });
      }

      const normalizedWeeklySchedule = payload.weeklySchedule.map(normalizeDaySchedule);

      const distinctWeekdays = new Set(normalizedWeeklySchedule.map((day) => day.weekday));

      if (distinctWeekdays.size !== normalizedWeeklySchedule.length) {
        throw buildValidationError("La configurazione contiene giorni duplicati", {
          field: "weeklySchedule",
        });
      }

      if (distinctWeekdays.size !== VALID_WEEKDAYS.size) {
        throw buildValidationError("La configurazione settimanale deve includere tutti i giorni", {
          field: "weeklySchedule",
        });
      }

      const firstOpenDay =
        normalizedWeeklySchedule.find((day) => day.isOpen) ?? DEFAULT_DAY_SETTINGS;

      return appSettingsRepository.update({
        openingTime: firstOpenDay.openingTime,
        closingTime: firstOpenDay.closingTime,
        slotMinutes: firstOpenDay.slotMinutes,
        categoryLabels: normalizeCategoryLabels(payload.categoryLabels),
        weeklySchedule: normalizedWeeklySchedule,
      });
    },
  };
}

module.exports = { createAppSettingsService };
