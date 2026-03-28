export const WEEKDAY_ORDER = [
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

export const WEEKDAY_LABELS = {
  LUNEDI: "Lunedi",
  MARTEDI: "Martedi",
  MERCOLEDI: "Mercoledi",
  GIOVEDI: "Giovedi",
  VENERDI: "Venerdi",
  SABATO: "Sabato",
  DOMENICA: "Domenica",
};

const WEEKDAY_BY_JS_DAY = [
  "DOMENICA",
  "LUNEDI",
  "MARTEDI",
  "MERCOLEDI",
  "GIOVEDI",
  "VENERDI",
  "SABATO",
];

const DEFAULT_DAY_SETTINGS = {
  isOpen: true,
  openingTime: "18:00",
  closingTime: "23:00",
  slotMinutes: 20,
};

function parseTimeToMinutes(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function normalizeDaySettings(daySettings) {
  return {
    isOpen: Boolean(daySettings?.isOpen ?? DEFAULT_DAY_SETTINGS.isOpen),
    openingTime: daySettings?.openingTime ?? DEFAULT_DAY_SETTINGS.openingTime,
    closingTime: daySettings?.closingTime ?? DEFAULT_DAY_SETTINGS.closingTime,
    slotMinutes: Number.isInteger(daySettings?.slotMinutes)
      ? daySettings.slotMinutes
      : DEFAULT_DAY_SETTINGS.slotMinutes,
  };
}

function getWeekdayFromDateInput(dateValue) {
  if (typeof dateValue !== "string" || !dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return WEEKDAY_BY_JS_DAY[date.getDay()] ?? null;
}

function findDaySettings(settings, weekday) {
  if (!weekday) {
    return null;
  }

  const weeklySchedule = Array.isArray(settings?.weeklySchedule) ? settings.weeklySchedule : [];

  const directMatch = weeklySchedule.find((day) => day.weekday === weekday);

  if (directMatch) {
    return directMatch;
  }

  const weekdayIndex = WEEKDAY_ORDER.indexOf(weekday);

  if (weekdayIndex < 0) {
    return null;
  }

  const legacyEnglishWeekday = EN_WEEKDAY_ORDER[weekdayIndex];
  return weeklySchedule.find((day) => day.weekday === legacyEnglishWeekday) ?? null;
}

export function buildTimeSlotsFromDay(daySettings) {
  const normalized = normalizeDaySettings(daySettings);

  if (!normalized.isOpen) {
    return [];
  }

  const openingMinutes = parseTimeToMinutes(normalized.openingTime);
  const closingMinutes = parseTimeToMinutes(normalized.closingTime);

  if (
    openingMinutes == null ||
    closingMinutes == null ||
    !Number.isInteger(normalized.slotMinutes) ||
    normalized.slotMinutes <= 0 ||
    closingMinutes <= openingMinutes
  ) {
    return [];
  }

  const slots = [];

  for (let current = openingMinutes; current <= closingMinutes; current += normalized.slotMinutes) {
    slots.push(formatMinutes(current));
  }

  return slots;
}

export function buildTimeSlotsForDate(settings, dateValue) {
  const weekday = getWeekdayFromDateInput(dateValue);
  const daySettings = findDaySettings(settings, weekday);
  return buildTimeSlotsFromDay(daySettings ?? DEFAULT_DAY_SETTINGS);
}

export function buildExpectedAtIso(dateValue, slotValue) {
  if (typeof dateValue !== "string" || typeof slotValue !== "string") {
    return null;
  }

  if (!dateValue || !slotValue) {
    return null;
  }

  const datetime = new Date(`${dateValue}T${slotValue}:00`);

  if (Number.isNaN(datetime.getTime())) {
    return null;
  }

  return datetime.toISOString();
}

export function getTodayDateInputValue() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
