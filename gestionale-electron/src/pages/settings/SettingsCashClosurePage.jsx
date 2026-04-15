import { useEffect, useMemo, useState } from "react";
import { Download, Receipt, RefreshCw, Save } from "lucide-react";
import ToastNotifications, {
  useToastNotifications,
} from "../../components/common/ToastNotifications";
import { listOrders } from "../../services/ipc/orders.ipc";
import { createCashClosure, listCashClosures } from "../../services/ipc/cash-closure.ipc";

const EXCLUDED_ORDER_STATUSES = new Set(["ANNULLATO"]);
const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);

function centsToEuroLabel(cents) {
  return `${(Number(cents ?? 0) / 100).toFixed(2).replace(".", ",")} EUR`;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoRange(dateValue, startTime, endTime) {
  const date = typeof dateValue === "string" ? dateValue : toDateInputValue(new Date());
  const safeStart = typeof startTime === "string" && startTime ? startTime : "18:00";
  const safeEnd = typeof endTime === "string" && endTime ? endTime : "23:00";

  const start = new Date(`${date}T${safeStart}:00`);
  const end = new Date(`${date}T${safeEnd}:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const fallbackStart = new Date();
    fallbackStart.setHours(18, 0, 0, 0);
    const fallbackEnd = new Date();
    fallbackEnd.setHours(23, 0, 0, 0);

    return {
      shiftStartIso: fallbackStart.toISOString(),
      shiftEndIso: fallbackEnd.toISOString(),
    };
  }

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return {
    shiftStartIso: start.toISOString(),
    shiftEndIso: end.toISOString(),
  };
}

function getOrderDateIso(order) {
  if (typeof order?.expectedAt === "string" && order.expectedAt) {
    const expectedAt = new Date(order.expectedAt);

    if (!Number.isNaN(expectedAt.getTime())) {
      return expectedAt.toISOString();
    }
  }

  if (typeof order?.createdAt === "string" && order.createdAt) {
    const createdAt = new Date(order.createdAt);

    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt.toISOString();
    }
  }

  if (typeof order?.businessDate === "string" && order.businessDate) {
    const businessDate = new Date(order.businessDate);

    if (!Number.isNaN(businessDate.getTime())) {
      return businessDate.toISOString();
    }
  }

  return null;
}

function isPizzaCategory(category) {
  const normalized = typeof category === "string" ? category.trim().toUpperCase() : "";

  if (!normalized) {
    return false;
  }

  return PIZZA_FAMILY_CATEGORY_KEYS.has(normalized) || normalized.includes("PIZZA");
}

function buildStatusBreakdown(orders) {
  return orders.reduce((acc, order) => {
    const status = typeof order?.status === "string" ? order.status : "SCONOSCIUTO";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

async function fetchAllOrders() {
  const firstPage = await listOrders({ page: 1, pageSize: 100 });
  const data = Array.isArray(firstPage?.data) ? firstPage.data : [];
  const totalPages = Number(firstPage?.totalPages ?? 1);

  if (totalPages <= 1) {
    return data;
  }

  const remainingPageIndexes = [];

  for (let page = 2; page <= totalPages; page += 1) {
    remainingPageIndexes.push(page);
  }

  const results = await Promise.all(
    remainingPageIndexes.map((page) => listOrders({ page, pageSize: 100 }))
  );

  for (const result of results) {
    if (Array.isArray(result?.data)) {
      data.push(...result.data);
    }
  }

  return data;
}

function computeShiftReport(orders, shiftStartIso, shiftEndIso) {
  const start = new Date(shiftStartIso);
  const end = new Date(shiftEndIso);

  const inRangeOrders = orders.filter((order) => {
    const orderDateIso = getOrderDateIso(order);

    if (!orderDateIso) {
      return false;
    }

    const orderDate = new Date(orderDateIso);

    if (Number.isNaN(orderDate.getTime())) {
      return false;
    }

    return orderDate >= start && orderDate <= end;
  });

  const validOrders = inRangeOrders.filter((order) => !EXCLUDED_ORDER_STATUSES.has(order?.status));

  const totalRevenueCents = validOrders.reduce(
    (sum, order) => sum + Number(order?.totalAmountCents ?? 0),
    0
  );
  const asportoOrders = validOrders.filter((order) => order?.type === "ASPORTO").length;
  const domicilioOrders = validOrders.filter((order) => order?.type === "DOMICILIO").length;
  const averageTicketCents = validOrders.length > 0 ? Math.round(totalRevenueCents / validOrders.length) : 0;

  const productQtyMap = new Map();

  for (const order of validOrders) {
    for (const item of order?.items ?? []) {
      const category = item?.product?.category ?? item?.productCategory ?? "";

      if (!isPizzaCategory(category)) {
        continue;
      }

      const productName =
        typeof item?.product?.name === "string" && item.product.name.trim()
          ? item.product.name.trim()
          : (typeof item?.productName === "string" ? item.productName.trim() : "Pizza sconosciuta");
      const quantity = Number(item?.quantity ?? 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      productQtyMap.set(productName, (productQtyMap.get(productName) ?? 0) + quantity);
    }
  }

  const topProducts = Array.from(productQtyMap.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const orderSummaries = validOrders.map((order) => ({
    id: order.id,
    dailyNumber: Number.isInteger(order.dailyNumber) ? order.dailyNumber : null,
    type: order.type,
    status: order.status,
    totalAmountCents: Number(order.totalAmountCents ?? 0),
    customerName: order?.customer?.name ?? "",
    expectedAt: order?.expectedAt ?? null,
    createdAt: order?.createdAt ?? null,
  }));

  return {
    totals: {
      totalOrders: inRangeOrders.length,
      validOrders: validOrders.length,
      totalRevenueCents,
      asportoOrders,
      domicilioOrders,
      averageTicketCents,
      statusBreakdown: buildStatusBreakdown(inRangeOrders),
    },
    topProducts,
    orders: orderSummaries,
  };
}

function toCsv(closure) {
  const header = [
    "id",
    "closedAt",
    "businessDate",
    "shiftStartIso",
    "shiftEndIso",
    "totalOrders",
    "validOrders",
    "totalRevenueCents",
    "asportoOrders",
    "domicilioOrders",
    "averageTicketCents",
  ];

  const row = [
    closure.id,
    closure.closedAt,
    closure.businessDate,
    closure.shiftStartIso,
    closure.shiftEndIso,
    closure.totals.totalOrders,
    closure.totals.validOrders,
    closure.totals.totalRevenueCents,
    closure.totals.asportoOrders,
    closure.totals.domicilioOrders,
    closure.totals.averageTicketCents,
  ];

  const lines = [header.join(";"), row.join(";")];

  lines.push("");
  lines.push("top_products;quantity");

  for (const item of closure.topProducts ?? []) {
    lines.push(`${String(item.name ?? "").replace(/;/g, ",")};${Number(item.quantity ?? 0)}`);
  }

  lines.push("");
  lines.push("order_id;daily_number;type;status;total_amount_cents;customer_name");

  for (const order of closure.orders ?? []) {
    lines.push(
      [
        order.id ?? "",
        order.dailyNumber ?? "",
        order.type ?? "",
        order.status ?? "",
        Number(order.totalAmountCents ?? 0),
        String(order.customerName ?? "").replace(/;/g, ","),
      ].join(";")
    );
  }

  return lines.join("\n");
}

function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SettingsCashClosurePage() {
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const [businessDate, setBusinessDate] = useState(toDateInputValue(today));
  const [shiftStartTime, setShiftStartTime] = useState("18:00");
  const [shiftEndTime, setShiftEndTime] = useState("23:00");
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState([]);
  const [closures, setClosures] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingClosures, setLoadingClosures] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState(null);

  async function reloadOrders() {
    setLoadingOrders(true);
    setError(null);

    try {
      const allOrders = await fetchAllOrders();
      setOrders(allOrders);
    } catch (err) {
      setError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setLoadingOrders(false);
    }
  }

  async function reloadClosures() {
    setLoadingClosures(true);

    try {
      const result = await listCashClosures({ limit: 20 });
      setClosures(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setLoadingClosures(false);
    }
  }

  useEffect(() => {
    void reloadOrders();
    void reloadClosures();
  }, []);

  const shiftRange = useMemo(
    () => toIsoRange(businessDate, shiftStartTime, shiftEndTime),
    [businessDate, shiftStartTime, shiftEndTime]
  );

  const shiftReport = useMemo(
    () => computeShiftReport(orders, shiftRange.shiftStartIso, shiftRange.shiftEndIso),
    [orders, shiftRange.shiftEndIso, shiftRange.shiftStartIso]
  );

  async function handleCloseShift() {
    setClosing(true);
    setError(null);

    try {
      const payload = {
        businessDate,
        shiftStartIso: shiftRange.shiftStartIso,
        shiftEndIso: shiftRange.shiftEndIso,
        notes,
        totals: shiftReport.totals,
        topProducts: shiftReport.topProducts,
        orders: shiftReport.orders,
      };

      const closure = await createCashClosure(payload);
      pushToast({
        type: "success",
        title: "Chiusura cassa salvata",
        description: `Incasso turno: ${centsToEuroLabel(closure?.totals?.totalRevenueCents ?? 0)}`,
      });
      setNotes("");
      await reloadClosures();
    } catch (err) {
      setError(err);
      pushToast({ type: "error", title: "Chiusura cassa fallita", description: err.message });
    } finally {
      setClosing(false);
    }
  }

  function handleExportClosureCsv(closure) {
    const csv = toCsv(closure);
    const safeDate = String(closure?.businessDate ?? "turno").replace(/[^0-9-]/g, "");
    const filename = `chiusura-cassa-${safeDate || "report"}.csv`;
    downloadCsv(filename, csv);
  }

  return (
    <div className="space-y-4">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />

      <section className="ui-surface rounded-xl p-4">
        <h3 className="text-base font-semibold text-slate-900">Chiusura cassa e report turno</h3>
        <p className="mt-1 text-sm text-slate-600">
          Calcola il riepilogo economico del turno, salva uno snapshot e tieni uno storico delle chiusure.
        </p>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm text-slate-700">
            Data operativa
            <input
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Inizio turno
            <input
              type="time"
              value={shiftStartTime}
              onChange={(event) => setShiftStartTime(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Fine turno
            <input
              type="time"
              value={shiftEndTime}
              onChange={(event) => setShiftEndTime(event.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                void reloadOrders();
              }}
              disabled={loadingOrders || closing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={loadingOrders ? "animate-spin" : ""} />
              Aggiorna ordini
            </button>
          </div>
        </div>

        <label className="mt-3 grid gap-1 text-sm text-slate-700">
          Note chiusura (opzionale)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Es. differenza cassa contanti, note operative..."
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Ordini turno</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{shiftReport.totals.validOrders}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Incasso turno</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {centsToEuroLabel(shiftReport.totals.totalRevenueCents)}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Asporto / Domicilio</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {shiftReport.totals.asportoOrders} / {shiftReport.totals.domicilioOrders}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Scontrino medio</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {centsToEuroLabel(shiftReport.totals.averageTicketCents)}
            </p>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="space-y-1 text-sm">
            <p className="text-slate-600">
              Intervallo: {new Date(shiftRange.shiftStartIso).toLocaleString("it-IT")} - {" "}
              {new Date(shiftRange.shiftEndIso).toLocaleString("it-IT")}
            </p>
            {error ? <p className="text-rose-600">{error.message}</p> : null}
          </div>

          <button
            type="button"
            onClick={() => {
              void handleCloseShift();
            }}
            disabled={closing || loadingOrders}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={14} />
            {closing ? "Salvataggio..." : "Chiudi cassa turno"}
          </button>
        </div>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">Storico chiusure</h4>
          <button
            type="button"
            onClick={() => {
              void reloadClosures();
            }}
            disabled={loadingClosures || closing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={13} className={loadingClosures ? "animate-spin" : ""} />
            Aggiorna
          </button>
        </div>

        {closures.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Nessuna chiusura salvata.
          </p>
        ) : (
          <div className="space-y-2">
            {closures.map((closure) => (
              <article
                key={closure.id}
                className="rounded-xl border border-slate-200 bg-white p-3 ring-1 ring-slate-900/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {closure.businessDate} · {centsToEuroLabel(closure?.totals?.totalRevenueCents ?? 0)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Chiuso il {new Date(closure.closedAt).toLocaleString("it-IT")}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportClosureCsv(closure)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Download size={13} />
                    Export CSV
                  </button>
                </div>

                <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                  <p className="inline-flex items-center gap-1">
                    <Receipt size={12} className="text-slate-500" />
                    Ordini validi: {closure?.totals?.validOrders ?? 0}
                  </p>
                  <p>Asporto: {closure?.totals?.asportoOrders ?? 0}</p>
                  <p>Domicilio: {closure?.totals?.domicilioOrders ?? 0}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
