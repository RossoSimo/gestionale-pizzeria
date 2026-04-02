import { useMemo, useState } from "react";
import ToastNotifications, { useToastNotifications } from "../../components/common/ToastNotifications";
import { useAppSettings } from "../../features/settings/hooks/useAppSettings";
import { buildTimeSlotsFromDay, WEEKDAY_LABELS, WEEKDAY_ORDER } from "../../lib/order-slots";
import { updateAppSettings } from "../../services/ipc/app-settings.ipc";

const SLOT_OPTIONS = [10, 15, 20, 30, 60];

function buildWeeklySchedule(settings) {
  return WEEKDAY_ORDER.map((weekday) => {
    const sourceDay = (settings.weeklySchedule ?? []).find((day) => day.weekday === weekday);

    return {
      weekday,
      isOpen: Boolean(sourceDay?.isOpen ?? true),
      openingTime: sourceDay?.openingTime ?? "18:00",
      closingTime: sourceDay?.closingTime ?? "23:00",
      slotMinutes: Number.isInteger(sourceDay?.slotMinutes) ? sourceDay.slotMinutes : 20,
    };
  });
}

function buildCategoryLabelsPayload(categoryLabels) {
  return {
    PIZZA: categoryLabels?.PIZZA ?? "Pizze",
    PIZZA_STAGIONALI: categoryLabels?.PIZZA_STAGIONALI ?? "Pizze stagionali",
    PIZZA_SPECIALI: categoryLabels?.PIZZA_SPECIALI ?? "Pizze speciali",
    BEVANDA: categoryLabels?.BEVANDA ?? "Bevanda",
    ALTRO: categoryLabels?.ALTRO ?? "Altro",
    ...(categoryLabels ?? {}),
  };
}

export default function SettingsSchedulePage() {
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const { settings, loading, error, reload } = useAppSettings();
  const [weeklySchedule, setWeeklySchedule] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const effectiveWeeklySchedule = weeklySchedule ?? buildWeeklySchedule(settings);

  const weeklyPreview = useMemo(
    () =>
      effectiveWeeklySchedule.map((day) => ({
        weekday: day.weekday,
        slots: buildTimeSlotsFromDay(day),
      })),
    [effectiveWeeklySchedule]
  );

  function updateDayField(weekday, field, value) {
    setActionError(null);
    setWeeklySchedule((prev) => {
      const source = prev ?? buildWeeklySchedule(settings);

      return source.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              [field]: value,
            }
          : day
      );
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      await updateAppSettings({
        categoryLabels: buildCategoryLabelsPayload(settings.categoryLabels),
        weeklySchedule: effectiveWeeklySchedule.map((day) => ({
          weekday: day.weekday,
          isOpen: Boolean(day.isOpen),
          openingTime: day.openingTime,
          closingTime: day.closingTime,
          slotMinutes: Number(day.slotMinutes),
        })),
      });

      setWeeklySchedule(null);
      pushToast({ type: "success", title: "Orari salvati" });
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
        <h3 className="text-base font-semibold text-slate-900">Orari e slot consegna</h3>
        <p className="mt-1 text-sm text-slate-600">
          Configura apertura giornaliera, orari e intervalli slot per la pianificazione ordini.
        </p>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            {effectiveWeeklySchedule.map((day) => (
              <div
                key={day.weekday}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[140px_120px_1fr_1fr_180px]"
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
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                  />
                  Aperto
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Apertura
                  <input
                    type="time"
                    value={day.openingTime}
                    onChange={(event) => updateDayField(day.weekday, "openingTime", event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                    disabled={loading || submitting || !day.isOpen}
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Chiusura
                  <input
                    type="time"
                    value={day.closingTime}
                    onChange={(event) => updateDayField(day.weekday, "closingTime", event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                    disabled={loading || submitting || !day.isOpen}
                  />
                </label>

                <label className="grid gap-1 text-sm text-slate-700">
                  Intervallo slot
                  <select
                    value={day.slotMinutes}
                    onChange={(event) => updateDayField(day.weekday, "slotMinutes", Number(event.target.value))}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
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
            <div className="space-y-1 text-sm">
              {loading && <p className="text-slate-500">Caricamento impostazioni...</p>}
              {error && <p className="text-rose-600">{error.message}</p>}
              {actionError && <p className="text-rose-600">{actionError.message}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Salvataggio..." : "Salva orari"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
