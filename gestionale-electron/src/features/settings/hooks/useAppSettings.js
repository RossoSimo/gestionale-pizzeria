import { useCallback, useEffect, useState } from "react";
import { getAppSettings } from "../../../services/ipc/app-settings.ipc";
import { WEEKDAY_ORDER } from "../../../lib/order-slots";

const EN_TO_IT_WEEKDAY = {
  MONDAY: "LUNEDI",
  TUESDAY: "MARTEDI",
  WEDNESDAY: "MERCOLEDI",
  THURSDAY: "GIOVEDI",
  FRIDAY: "VENERDI",
  SATURDAY: "SABATO",
  SUNDAY: "DOMENICA",
};

const DEFAULT_CATEGORY_LABELS = {
  PIZZA: "Pizze",
  PIZZA_STAGIONALI: "Pizze stagionali",
  PIZZA_SPECIALI: "Pizze speciali",
  BEVANDA: "Bevanda",
  ALTRO: "Altro",
};

const BASE_CATEGORY_KEYS = Object.keys(DEFAULT_CATEGORY_LABELS);

const DEFAULT_APP_SETTINGS = {
  openingTime: "18:00",
  closingTime: "23:00",
  slotMinutes: 20,
  categoryLabels: DEFAULT_CATEGORY_LABELS,
  weeklySchedule: WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    isOpen: true,
    openingTime: "18:00",
    closingTime: "23:00",
    slotMinutes: 20,
  })),
};

function normalizeWeeklySchedule(schedule) {
  const byWeekday = new Map(
    (Array.isArray(schedule) ? schedule : []).map((day) => [EN_TO_IT_WEEKDAY[day.weekday] ?? day.weekday, day])
  );

  return WEEKDAY_ORDER.map((weekday) => {
    const item = byWeekday.get(weekday);

    return {
      weekday,
      isOpen: Boolean(item?.isOpen ?? true),
      openingTime: item?.openingTime ?? "18:00",
      closingTime: item?.closingTime ?? "23:00",
      slotMinutes: Number.isInteger(item?.slotMinutes) ? item.slotMinutes : 20,
    };
  });
}

function normalizeCategoryLabels(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  const normalized = {
    PIZZA: typeof source.PIZZA === "string" && source.PIZZA.trim()
      ? source.PIZZA.trim()
      : DEFAULT_APP_SETTINGS.categoryLabels.PIZZA,
    PIZZA_STAGIONALI:
      typeof source.PIZZA_STAGIONALI === "string" && source.PIZZA_STAGIONALI.trim()
        ? source.PIZZA_STAGIONALI.trim()
        : DEFAULT_APP_SETTINGS.categoryLabels.PIZZA_STAGIONALI,
    PIZZA_SPECIALI:
      typeof source.PIZZA_SPECIALI === "string" && source.PIZZA_SPECIALI.trim()
        ? source.PIZZA_SPECIALI.trim()
        : DEFAULT_APP_SETTINGS.categoryLabels.PIZZA_SPECIALI,
    BEVANDA: typeof source.BEVANDA === "string" && source.BEVANDA.trim()
      ? source.BEVANDA.trim()
      : DEFAULT_APP_SETTINGS.categoryLabels.BEVANDA,
    ALTRO: typeof source.ALTRO === "string" && source.ALTRO.trim()
      ? source.ALTRO.trim()
      : DEFAULT_APP_SETTINGS.categoryLabels.ALTRO,
  };

  for (const [rawKey, rawLabel] of Object.entries(source)) {
    const key = String(rawKey ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!key || BASE_CATEGORY_KEYS.includes(key)) {
      continue;
    }

    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

    if (!label) {
      continue;
    }

    normalized[key] = label;
  }

  return normalized;
}

export function useAppSettings() {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getAppSettings();
      setSettings({
        openingTime: result?.openingTime ?? DEFAULT_APP_SETTINGS.openingTime,
        closingTime: result?.closingTime ?? DEFAULT_APP_SETTINGS.closingTime,
        slotMinutes: Number.isInteger(result?.slotMinutes)
          ? result.slotMinutes
          : DEFAULT_APP_SETTINGS.slotMinutes,
        categoryLabels: normalizeCategoryLabels(result?.categoryLabels),
        weeklySchedule: normalizeWeeklySchedule(result?.weeklySchedule),
      });
    } catch (err) {
      setSettings(DEFAULT_APP_SETTINGS);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, loading, error, reload };
}
