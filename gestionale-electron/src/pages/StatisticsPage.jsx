import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, RefreshCw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { useOrders } from "../features/orders/hooks/useOrders";
import { centsToEuro } from "../lib/money";

const TYPE_LABELS = {
  ASPORTO: "Asporto",
  DOMICILIO: "Domicilio",
};

const TYPE_COLORS = {
  ASPORTO: "#14b8a6",
  DOMICILIO: "#0ea5e9",
};

const TOP_PIZZA_COLORS = ["#f97316", "#fb923c", "#f59e0b", "#f43f5e", "#ef4444", "#e11d48"];
const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);
const EXCLUDED_ORDER_STATUSES = new Set(["ANNULLATO"]);

function isPizzaCategory(category) {
  const normalized = typeof category === "string" ? category.trim().toUpperCase() : "";

  if (!normalized) {
    return false;
  }

  return PIZZA_FAMILY_CATEGORY_KEYS.has(normalized) || normalized.includes("PIZZA");
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseDateValue(dateValue) {
  if (typeof dateValue !== "string") {
    return null;
  }

  const [year, month, day] = dateValue.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMonthValue(monthValue) {
  if (typeof monthValue !== "string") {
    return null;
  }

  const [year, month] = monthValue.split("-").map(Number);

  if (!year || !month) {
    return null;
  }

  const parsed = new Date(year, month - 1, 1);
  parsed.setHours(0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStartOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + mondayOffset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getEndOfWeek(date) {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getStartOfMonth(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getEndOfMonth(date) {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  result.setHours(23, 59, 59, 999);
  return result;
}

function getOrderDate(order) {
  if (typeof order?.businessDate === "string" && order.businessDate) {
    const parsedBusiness = parseDateValue(order.businessDate);
    if (parsedBusiness) {
      return parsedBusiness;
    }
  }

  const expected = new Date(order?.expectedAt ?? order?.createdAt ?? "");

  if (Number.isNaN(expected.getTime())) {
    return null;
  }

  return expected;
}

function buildDateKey(date) {
  return toDateInputValue(date);
}

function formatDateLabel(date) {
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatEuroLabel(cents) {
  return `${centsToEuro(cents).replace(".", ",")} EUR`;
}

function buildRangeLabel(start, end) {
  const startLabel = start.toLocaleDateString("it-IT");
  const endLabel = end.toLocaleDateString("it-IT");
  return `${startLabel} - ${endLabel}`;
}

function eachDayInRange(start, end) {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = 366;

  while (cursor <= end && days.length < limit) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export default function StatisticsPage() {
  const { orders, loading, error, reload } = useOrders();
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const [rangeType, setRangeType] = useState("week");
  const [referenceDate, setReferenceDate] = useState(toDateInputValue(today));
  const [referenceMonth, setReferenceMonth] = useState(toMonthInputValue(today));
  const [customFrom, setCustomFrom] = useState(toDateInputValue(getStartOfWeek(today)));
  const [customTo, setCustomTo] = useState(toDateInputValue(today));

  const computedRange = useMemo(() => {
    if (rangeType === "day") {
      const dayDate = parseDateValue(referenceDate) ?? today;
      return {
        start: dayDate,
        end: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59, 999),
      };
    }

    if (rangeType === "month") {
      const monthDate = parseMonthValue(referenceMonth) ?? today;
      return {
        start: getStartOfMonth(monthDate),
        end: getEndOfMonth(monthDate),
      };
    }

    if (rangeType === "custom") {
      const start = parseDateValue(customFrom) ?? today;
      const endBase = parseDateValue(customTo) ?? today;
      const end = new Date(endBase);
      end.setHours(23, 59, 59, 999);

      if (end < start) {
        return {
          start: endBase,
          end: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999),
        };
      }

      return { start, end };
    }

    const weekDate = parseDateValue(referenceDate) ?? today;
    return {
      start: getStartOfWeek(weekDate),
      end: getEndOfWeek(weekDate),
    };
  }, [customFrom, customTo, rangeType, referenceDate, referenceMonth, today]);

  const filteredOrders = useMemo(() => {
    return (orders ?? []).filter((order) => {
      if (EXCLUDED_ORDER_STATUSES.has(order?.status)) {
        return false;
      }

      const orderDate = getOrderDate(order);

      if (!orderDate) {
        return false;
      }

      return orderDate >= computedRange.start && orderDate <= computedRange.end;
    });
  }, [orders, computedRange.end, computedRange.start]);

  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalRevenueCents = filteredOrders.reduce((sum, order) => sum + Number(order.totalAmountCents ?? 0), 0);
    const averageTicketCents = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0;

    const deliveryCount = filteredOrders.filter((order) => order.type === "DOMICILIO").length;
    const deliveryRate = totalOrders > 0 ? Math.round((deliveryCount / totalOrders) * 100) : 0;

    return {
      totalOrders,
      totalRevenueCents,
      averageTicketCents,
      deliveryRate,
    };
  }, [filteredOrders]);

  const revenueByDay = useMemo(() => {
    const days = eachDayInRange(computedRange.start, computedRange.end);
    const rowsByDay = new Map(
      days.map((day) => [
        buildDateKey(day),
        {
          day: formatDateLabel(day),
          dateKey: buildDateKey(day),
          orders: 0,
          revenueCents: 0,
        },
      ])
    );

    for (const order of filteredOrders) {
      const orderDate = getOrderDate(order);

      if (!orderDate) {
        continue;
      }

      const key = buildDateKey(orderDate);

      if (!rowsByDay.has(key)) {
        rowsByDay.set(key, {
          day: formatDateLabel(orderDate),
          dateKey: key,
          orders: 0,
          revenueCents: 0,
        });
      }

      const row = rowsByDay.get(key);
      row.orders += 1;
      row.revenueCents += Number(order.totalAmountCents ?? 0);
    }

    return Array.from(rowsByDay.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [computedRange.end, computedRange.start, filteredOrders]);

  const topPizzas = useMemo(() => {
    const quantityByPizza = new Map();

    for (const order of filteredOrders) {
      for (const item of order.items ?? []) {
        const category = item?.product?.category ?? item?.productCategory ?? "";

        if (!isPizzaCategory(category)) {
          continue;
        }

        const quantity = Number(item.quantity ?? 0);

        if (!Number.isFinite(quantity) || quantity <= 0) {
          continue;
        }

        const pizzaName =
          typeof item?.product?.name === "string" && item.product.name.trim()
            ? item.product.name.trim()
            : "Pizza sconosciuta";

        quantityByPizza.set(pizzaName, (quantityByPizza.get(pizzaName) ?? 0) + quantity);
      }
    }

    return Array.from(quantityByPizza.entries())
      .map(([name, value], index) => ({
        name,
        value,
        color: TOP_PIZZA_COLORS[index % TOP_PIZZA_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredOrders]);

  const typeBreakdown = useMemo(() => {
    const map = new Map();

    for (const order of filteredOrders) {
      const type = order.type ?? "ASPORTO";
      map.set(type, (map.get(type) ?? 0) + 1);
    }

    return Array.from(map.entries()).map(([type, value]) => ({
      type,
      name: TYPE_LABELS[type] ?? type,
      value,
      color: TYPE_COLORS[type] ?? "#64748b",
    }));
  }, [filteredOrders]);

  return (
    <div className="space-y-4">
      <section className="ui-surface rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Statistiche ordini</h3>
            <p className="mt-1 text-sm text-slate-600">
              Analisi ordini e incassi.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Aggiorna dati
          </button>
        </div>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRangeType("day")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              rangeType === "day"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <CalendarDays size={14} />
            Giorno
          </button>
          <button
            type="button"
            onClick={() => setRangeType("week")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              rangeType === "week"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <CalendarDays size={14} />
            Settimana
          </button>
          <button
            type="button"
            onClick={() => setRangeType("month")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              rangeType === "month"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <CalendarRange size={14} />
            Mese
          </button>
          <button
            type="button"
            onClick={() => setRangeType("custom")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              rangeType === "custom"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <TrendingUp size={14} />
            Intervallo
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {rangeType === "day" && (
            <label className="grid gap-1 text-sm text-slate-700">
              Giorno
              <input
                type="date"
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
          )}

          {rangeType === "week" && (
            <label className="grid gap-1 text-sm text-slate-700">
              Data di riferimento
              <input
                type="date"
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
          )}

          {rangeType === "month" && (
            <label className="grid gap-1 text-sm text-slate-700">
              Mese
              <input
                type="month"
                value={referenceMonth}
                onChange={(event) => setReferenceMonth(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
          )}

          {rangeType === "custom" && (
            <>
              <label className="grid gap-1 text-sm text-slate-700">
                Dal
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                Al
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>
            </>
          )}
        </div>

        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          Intervallo attivo: {buildRangeLabel(computedRange.start, computedRange.end)}
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="ui-surface rounded-xl border-l-4 border-l-teal-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ordini</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.totalOrders}</p>
        </article>

        <article className="ui-surface rounded-xl border-l-4 border-l-emerald-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Incasso totale</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatEuroLabel(stats.totalRevenueCents)}</p>
        </article>

        <article className="ui-surface rounded-xl border-l-4 border-l-sky-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Scontrino medio</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatEuroLabel(stats.averageTicketCents)}</p>
        </article>

        <article className="ui-surface rounded-xl border-l-4 border-l-indigo-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Quota domicilio</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.deliveryRate}%</p>
        </article>
      </section>

      {error && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error.message || "Impossibile caricare i dati statistici."}
        </section>
      )}

      {!loading && filteredOrders.length === 0 && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          Nessun ordine nel periodo selezionato.
        </section>
      )}

      {filteredOrders.length > 0 && (
        <section className="grid gap-3 xl:grid-cols-2">
          <article className="ui-surface rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-800">Andamento incassi giornalieri</h4>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 12 }} minTickGap={18} />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 100)} EUR`}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "revenueCents") {
                        return [formatEuroLabel(Number(value)), "Incasso"];
                      }

                      return [value, "Ordini"];
                    }}
                    labelFormatter={(label) => `Giorno ${label}`}
                  />
                  <Legend
                    formatter={(value) => (value === "revenueCents" ? "Incasso" : "Ordini")}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenueCents"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    name="revenueCents"
                  />
                  <Area type="monotone" dataKey="orders" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0} name="orders" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="ui-surface rounded-xl p-4">
            <h4 className="text-sm font-semibold text-slate-800">Pizze piu ordinate</h4>
            <div className="mt-3 h-72">
              {topPizzas.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  Nessuna pizza trovata nel periodo selezionato.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topPizzas} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fill: "#475569", fontSize: 12 }}
                      interval={0}
                    />
                    <Tooltip formatter={(value) => [`${value} pizze`, "Quantita"]} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {topPizzas.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="ui-surface rounded-xl p-4 xl:col-span-2">
            <h4 className="text-sm font-semibold text-slate-800">Ordini per tipologia</h4>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeBreakdown} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value} ordini`, "Totale"]} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {typeBreakdown.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
