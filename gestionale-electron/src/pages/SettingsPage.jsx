import { useMemo, useState } from "react";
import { useAppSettings } from "../features/settings/hooks/useAppSettings";
import { updateAppSettings } from "../services/ipc/app-settings.ipc";
import { buildTimeSlotsFromDay, WEEKDAY_LABELS, WEEKDAY_ORDER } from "../lib/order-slots";

const SLOT_OPTIONS = [10, 15, 20, 30, 60];
const BASE_CATEGORY_KEYS = ["PIZZA", "BEVANDA", "ALTRO"];

function normalizeCategoryKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildCategoryRows(categoryLabels) {
  const entries = Object.entries(categoryLabels ?? {});

  return entries
    .map(([key, label]) => ({
      key,
      originalKey: key,
      label,
      locked: BASE_CATEGORY_KEYS.includes(key),
    }))
    .sort((a, b) => {
      const aBaseIndex = BASE_CATEGORY_KEYS.indexOf(a.key);
      const bBaseIndex = BASE_CATEGORY_KEYS.indexOf(b.key);

      if (aBaseIndex >= 0 && bBaseIndex >= 0) {
        return aBaseIndex - bBaseIndex;
      }

      if (aBaseIndex >= 0) {
        return -1;
      }

      if (bBaseIndex >= 0) {
        return 1;
      }

      return a.label.localeCompare(b.label, "it-IT");
    });
}

function buildFormState(settings) {
  return {
    categories: buildCategoryRows({
      PIZZA: settings.categoryLabels?.PIZZA ?? "Pizze",
      BEVANDA: settings.categoryLabels?.BEVANDA ?? "Bevanda",
      ALTRO: settings.categoryLabels?.ALTRO ?? "Altro",
      ...settings.categoryLabels,
    }),
    weeklySchedule: WEEKDAY_ORDER.map((weekday) => {
      const sourceDay = (settings.weeklySchedule ?? []).find((day) => day.weekday === weekday);

      return {
        weekday,
        isOpen: Boolean(sourceDay?.isOpen ?? true),
        openingTime: sourceDay?.openingTime ?? "18:00",
        closingTime: sourceDay?.closingTime ?? "23:00",
        slotMinutes: Number.isInteger(sourceDay?.slotMinutes) ? sourceDay.slotMinutes : 20,
      };
    }),
  };
}

export default function SettingsPage() {
  const { settings, loading, error, reload } = useAppSettings();
  const [formState, setFormState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionMessage, setActionMessage] = useState("");

  const effectiveFormState = formState ?? buildFormState(settings);
  const weeklyPreview = useMemo(
    () =>
      effectiveFormState.weeklySchedule.map((day) => ({
        weekday: day.weekday,
        slots: buildTimeSlotsFromDay(day),
      })),
    [effectiveFormState]
  );

  function updateDayField(weekday, field, value) {
    setActionMessage("");
    setFormState((prev) => ({
      ...(prev ?? buildFormState(settings)),
      weeklySchedule: (prev?.weeklySchedule ?? buildFormState(settings).weeklySchedule).map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              [field]: value,
            }
          : day
      ),
    }));
  }

  function updateCategoryRow(index, field, value) {
    setActionMessage("");
    setFormState((prev) => {
      const next = prev ?? buildFormState(settings);

      return {
        ...next,
        categories: next.categories.map((row, rowIndex) =>
          rowIndex === index
            ? {
                ...row,
                [field]: value,
              }
            : row
        ),
      };
    });
  }

  function addCategoryRow() {
    setActionMessage("");
    setFormState((prev) => {
      const next = prev ?? buildFormState(settings);

      return {
        ...next,
        categories: [
          ...next.categories,
          {
            key: "",
            originalKey: null,
            label: "",
            locked: false,
          },
        ],
      };
    });
  }

  function removeCategoryRow(index) {
    setActionMessage("");
    setFormState((prev) => {
      const next = prev ?? buildFormState(settings);

      return {
        ...next,
        categories: next.categories.filter((_, rowIndex) => rowIndex !== index),
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);
    setActionMessage("");

    try {
      const categoryLabels = {};

      for (const row of effectiveFormState.categories) {
        const normalizedKey = normalizeCategoryKey(row.key || row.originalKey);
        const normalizedLabel = String(row.label ?? "").trim();

        if (!normalizedKey || !normalizedLabel) {
          continue;
        }

        categoryLabels[normalizedKey] = normalizedLabel;
      }

      if (!categoryLabels.PIZZA) {
        categoryLabels.PIZZA = "Pizze";
      }

      if (!categoryLabels.BEVANDA) {
        categoryLabels.BEVANDA = "Bevanda";
      }

      if (!categoryLabels.ALTRO) {
        categoryLabels.ALTRO = "Altro";
      }

      await updateAppSettings({
        categoryLabels,
        weeklySchedule: effectiveFormState.weeklySchedule.map((day) => ({
          weekday: day.weekday,
          isOpen: Boolean(day.isOpen),
          openingTime: day.openingTime,
          closingTime: day.closingTime,
          slotMinutes: Number(day.slotMinutes),
        })),
      });

      setFormState(null);
      setActionMessage("Impostazioni salvate.");
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1 p-4">
        <p className="text-sm text-slate-600">
          Configura i giorni di apertura e gli slot orari per ciascun giorno della settimana.
        </p>
      </header>

      <section className="ui-surface p-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <section className="ui-surface-soft space-y-2 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Categorie prodotto
            </h3>

            <div className="grid gap-2 md:grid-cols-2">
              {effectiveFormState.categories.map((categoryRow, index) => (
                <div key={`${categoryRow.originalKey ?? "new"}-${index}`} className="ui-surface grid gap-2 p-2 md:grid-cols-[1fr_1fr_auto]">
                  <label className="grid gap-1 text-sm text-slate-700">
                    Codice
                    <input
                      value={categoryRow.key}
                      onChange={(event) => updateCategoryRow(index, "key", event.target.value)}
                      className="border border-slate-200 bg-white px-2 py-2 text-sm"
                      disabled={loading || submitting || categoryRow.locked}
                      placeholder="ES: BIRRE"
                    />
                  </label>

                  <label className="grid gap-1 text-sm text-slate-700">
                    Nome visibile
                    <input
                      value={categoryRow.label}
                      onChange={(event) => updateCategoryRow(index, "label", event.target.value)}
                      className="border border-slate-200 bg-white px-2 py-2 text-sm"
                      disabled={loading || submitting}
                    />
                  </label>

                  <div className="flex items-end justify-end">
                    {!categoryRow.locked && (
                      <button
                        type="button"
                        onClick={() => removeCategoryRow(index)}
                        className="ui-btn ui-btn-danger text-xs"
                        disabled={loading || submitting}
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <button
                type="button"
                onClick={addCategoryRow}
                className="ui-btn ui-btn-accent text-xs"
                disabled={loading || submitting}
              >
                Aggiungi categoria
              </button>
            </div>
          </section>

          <div className="space-y-2">
            {effectiveFormState.weeklySchedule.map((day) => (
              <div
                key={day.weekday}
                className="grid gap-2 border border-slate-200 bg-white p-3 md:grid-cols-[140px_120px_1fr_1fr_180px]"
              >
                <div className="flex items-center text-sm font-semibold text-slate-800">
                  {WEEKDAY_LABELS[day.weekday]}
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={day.isOpen}
                    onChange={(event) => updateDayField(day.weekday, "isOpen", event.target.checked)}
                    disabled={loading || submitting}
                  />
                  Aperto
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Apertura
                  <input
                    type="time"
                    value={day.openingTime}
                    onChange={(event) => updateDayField(day.weekday, "openingTime", event.target.value)}
                    className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm disabled:opacity-50"
                    disabled={loading || submitting || !day.isOpen}
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Chiusura
                  <input
                    type="time"
                    value={day.closingTime}
                    onChange={(event) => updateDayField(day.weekday, "closingTime", event.target.value)}
                    className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm disabled:opacity-50"
                    disabled={loading || submitting || !day.isOpen}
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Intervallo slot
                  <select
                    value={day.slotMinutes}
                    onChange={(event) => updateDayField(day.weekday, "slotMinutes", Number(event.target.value))}
                    className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm disabled:opacity-50"
                    disabled={loading || submitting || !day.isOpen}
                  >
                    {SLOT_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        ogni {minutes} minuti
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {loading && <p className="text-sm text-slate-500">Caricamento impostazioni...</p>}
              {error && <p className="text-sm text-red-600">{error.message}</p>}
              {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}
              {!error && !actionError && actionMessage && (
                <p className="text-sm text-emerald-700">{actionMessage}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="ui-btn ui-btn-success text-sm"
            >
              {submitting ? "Salvataggio..." : "Salva orari"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
