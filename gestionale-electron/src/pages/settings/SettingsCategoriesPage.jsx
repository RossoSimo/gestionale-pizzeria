import { useState } from "react";
import ToastNotifications, { useToastNotifications } from "../../components/common/ToastNotifications";
import { useAppSettings } from "../../features/settings/hooks/useAppSettings";
import { WEEKDAY_ORDER } from "../../lib/order-slots";
import { updateAppSettings } from "../../services/ipc/app-settings.ipc";

const BASE_CATEGORY_KEYS = ["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI", "BEVANDA", "ALTRO"];

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
  const rows = Object.entries({
    PIZZA: categoryLabels?.PIZZA ?? "Pizze",
    PIZZA_STAGIONALI: categoryLabels?.PIZZA_STAGIONALI ?? "Pizze stagionali",
    PIZZA_SPECIALI: categoryLabels?.PIZZA_SPECIALI ?? "Pizze speciali",
    BEVANDA: categoryLabels?.BEVANDA ?? "Bevanda",
    ALTRO: categoryLabels?.ALTRO ?? "Altro",
    ...(categoryLabels ?? {}),
  }).map(([key, label]) => ({
    key,
    originalKey: key,
    label,
    locked: BASE_CATEGORY_KEYS.includes(key),
  }));

  return rows.sort((a, b) => {
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

function buildCategoryLabelsPayload(categoryRows) {
  const labels = {};

  for (const row of categoryRows) {
    const normalizedKey = normalizeCategoryKey(row.key || row.originalKey);
    const normalizedLabel = String(row.label ?? "").trim();

    if (!normalizedKey || !normalizedLabel) {
      continue;
    }

    labels[normalizedKey] = normalizedLabel;
  }

  if (!labels.PIZZA) {
    labels.PIZZA = "Pizze";
  }

  if (!labels.PIZZA_STAGIONALI) {
    labels.PIZZA_STAGIONALI = "Pizze stagionali";
  }

  if (!labels.PIZZA_SPECIALI) {
    labels.PIZZA_SPECIALI = "Pizze speciali";
  }

  if (!labels.BEVANDA) {
    labels.BEVANDA = "Bevanda";
  }

  if (!labels.ALTRO) {
    labels.ALTRO = "Altro";
  }

  return labels;
}

function buildWeeklySchedulePayload(weeklySchedule) {
  return WEEKDAY_ORDER.map((weekday) => {
    const sourceDay = (weeklySchedule ?? []).find((day) => day.weekday === weekday);

    return {
      weekday,
      isOpen: Boolean(sourceDay?.isOpen ?? true),
      openingTime: sourceDay?.openingTime ?? "18:00",
      closingTime: sourceDay?.closingTime ?? "23:00",
      slotMinutes: Number.isInteger(sourceDay?.slotMinutes) ? sourceDay.slotMinutes : 20,
    };
  });
}

export default function SettingsCategoriesPage() {
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const { settings, loading, error, reload } = useAppSettings();
  const [categoryRows, setCategoryRows] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const effectiveCategoryRows = categoryRows ?? buildCategoryRows(settings.categoryLabels);

  function updateCategoryRow(index, field, value) {
    setActionError(null);
    setCategoryRows((prev) => {
      const sourceRows = prev ?? buildCategoryRows(settings.categoryLabels);

      return sourceRows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: value,
            }
          : row
      );
    });
  }

  function addCategoryRow() {
    setActionError(null);
    setCategoryRows((prev) => {
      const sourceRows = prev ?? buildCategoryRows(settings.categoryLabels);

      return [
        ...sourceRows,
        {
          key: "",
          originalKey: null,
          label: "",
          locked: false,
        },
      ];
    });
  }

  function removeCategoryRow(index) {
    setActionError(null);
    setCategoryRows((prev) => {
      const sourceRows = prev ?? buildCategoryRows(settings.categoryLabels);

      return sourceRows.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      await updateAppSettings({
        categoryLabels: buildCategoryLabelsPayload(effectiveCategoryRows),
        weeklySchedule: buildWeeklySchedulePayload(settings.weeklySchedule),
      });

      setCategoryRows(null);
      pushToast({ type: "success", title: "Categorie salvate" });
      await reload();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />

      <section className="ui-surface rounded-xl p-4">
        <h3 className="text-base font-semibold text-slate-900">Categorie prodotto</h3>
        <p className="mt-1 text-sm text-slate-600">
          Definisci le categorie base e crea categorie personalizzate usate in Prodotti e Ordini.
        </p>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            {effectiveCategoryRows.map((categoryRow, index) => (
              <article
                key={`${categoryRow.originalKey ?? "new"}-${index}`}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_auto]"
              >
                <label className="grid gap-1 text-sm text-slate-700">
                  Codice
                  <input
                    value={categoryRow.key}
                    onChange={(event) => updateCategoryRow(index, "key", event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                    disabled={loading || submitting || categoryRow.locked}
                    placeholder="ES: BIRRE"
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Nome visibile
                  <input
                    value={categoryRow.label}
                    onChange={(event) => updateCategoryRow(index, "label", event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                    disabled={loading || submitting}
                  />
                </label>

                <div className="flex items-end justify-end">
                  {!categoryRow.locked && (
                    <button
                      type="button"
                      onClick={() => removeCategoryRow(index)}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={loading || submitting}
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={addCategoryRow}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || submitting}
            >
              Aggiungi categoria
            </button>

            <button
              type="submit"
              disabled={submitting || loading}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Salvataggio..." : "Salva categorie"}
            </button>
          </div>

          <div className="space-y-1 text-sm">
            {loading && <p className="text-slate-500">Caricamento impostazioni...</p>}
            {error && <p className="text-rose-600">{error.message}</p>}
            {actionError && <p className="text-rose-600">{actionError.message}</p>}
          </div>
        </form>
      </section>
    </div>
  );
}
