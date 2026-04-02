import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Car, ClipboardList, PackageSearch, ShoppingCart, Users } from "lucide-react";
import { useCustomers } from "../features/customers/hooks/useCustomers";
import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { centsToEuro } from "../lib/money";
import { getTodayDateInputValue } from "../lib/order-slots";

const ACTIVE_ORDER_STATUSES = new Set(["IN_ATTESA", "CONFERMATO", "IN_PREPARAZIONE", "PRONTO"]);
const CLOSED_DAY_STORAGE_KEY = "orders.closedBusinessDates.v1";

function formatDateInputFromIso(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDateFilterValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const raw = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
      return raw.slice(0, 10);
    }
  }

  return formatDateInputFromIso(value);
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "Non specificato";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Non specificato";
  }

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status) {
  const labels = {
    IN_ATTESA: "In attesa",
    CONFERMATO: "Confermato",
    IN_PREPARAZIONE: "In preparazione",
    PRONTO: "Pronto",
    CONSEGNATO: "Consegnato",
    ANNULLATO: "Annullato",
  };

  return labels[status] ?? status;
}

function formatEuroLabel(cents) {
  return `${centsToEuro(cents).replace(".", ",")} EUR`;
}

export default function DashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const { customers, loading: customersLoading } = useCustomers();

  const todayDate = useMemo(() => getTodayDateInputValue(), []);

  const todayOrders = useMemo(() => {
    return (orders ?? []).filter((order) => {
      const orderDate = extractDateFilterValue(order.businessDate ?? order.expectedAt ?? order.createdAt);
      return orderDate === todayDate;
    });
  }, [orders, todayDate]);

  const pendingOrders = todayOrders.filter((order) => order.status === "IN_ATTESA").length;
  const activeOrders = todayOrders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status)).length;
  const deliveryOrders = todayOrders.filter((order) => order.type === "DOMICILIO" && order.status !== "ANNULLATO").length;

  const totalRevenueCents = todayOrders
    .filter((order) => order.status !== "ANNULLATO")
    .reduce((sum, order) => sum + Number(order.totalAmountCents ?? 0), 0);

  const averageOrderCents = todayOrders.length > 0 ? Math.round(totalRevenueCents / todayOrders.length) : 0;

  const upcomingDeliveries = useMemo(() => {
    return todayOrders
      .filter((order) => order.type === "DOMICILIO" && order.status !== "ANNULLATO")
      .sort((a, b) => {
        const timestampA = new Date(a.expectedAt ?? a.businessDate ?? a.createdAt ?? 0).getTime() || 0;
        const timestampB = new Date(b.expectedAt ?? b.businessDate ?? b.createdAt ?? 0).getTime() || 0;
        return timestampA - timestampB;
      })
      .slice(0, 6);
  }, [todayOrders]);

  const isTodayClosed = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const rawValue = window.localStorage.getItem(CLOSED_DAY_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : [];
      return Array.isArray(parsed) && parsed.includes(todayDate);
    } catch {
      return false;
    }
  }, [todayDate]);

  const todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      <section className="ui-surface rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Panoramica operativa</p>
            <h2 className="text-2xl font-bold tracking-tight text-teal-800">Dashboard</h2>
            <p className="mt-1 text-sm text-slate-600 inline-flex items-center gap-2">
              <CalendarDays size={14} />
              {todayLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isTodayClosed ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Giornata chiusa
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Giornata aperta
              </span>
            )}

            <Link
              to="/orders?view=compose"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <ShoppingCart size={14} />
              Nuovo ordine
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/orders?view=list" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 inline-flex items-center gap-2">
            <ClipboardList size={14} className="text-slate-500" />
            Lista ordini
          </Link>
          <Link to="/customers" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 inline-flex items-center gap-2">
            <Users size={14} className="text-slate-500" />
            Clienti
          </Link>
          <Link to="/products" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 inline-flex items-center gap-2">
            <PackageSearch size={14} className="text-slate-500" />
            Prodotti
          </Link>
          <Link to="/statistics" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 inline-flex items-center gap-2">
            <ArrowRight size={14} className="text-slate-500" />
            Statistiche
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <article className="ui-surface border-l-4 border-l-teal-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ordini oggi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : todayOrders.length}</p>
        </article>

        <article className="ui-surface border-l-4 border-l-amber-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">In attesa</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : pendingOrders}</p>
        </article>

        <article className="ui-surface border-l-4 border-l-sky-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ordini attivi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : activeOrders}</p>
        </article>

        <article className="ui-surface border-l-4 border-l-emerald-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Incasso oggi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {ordersLoading ? "..." : formatEuroLabel(totalRevenueCents)}
          </p>
        </article>

        <article className="ui-surface border-l-4 border-l-indigo-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Scontrino medio</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {ordersLoading ? "..." : formatEuroLabel(averageOrderCents)}
          </p>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <article className="ui-surface rounded-xl border-l-4 border-l-cyan-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Consegne oggi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : deliveryOrders}</p>
        </article>

        <article className="ui-surface rounded-xl border-l-4 border-l-teal-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Catalogo prodotti</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{productsLoading ? "..." : products.length}</p>
        </article>

        <article className="ui-surface rounded-xl border-l-4 border-l-violet-500 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Clienti</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{customersLoading ? "..." : customers.length}</p>
        </article>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Prossime consegne di oggi</h3>
          <Link to="/orders?view=list" className="text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800">
            Vai alla lista
          </Link>
        </div>

        {ordersLoading && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Caricamento ordini in corso...
          </p>
        )}

        {!ordersLoading && upcomingDeliveries.length === 0 && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Nessuna consegna pianificata per oggi.
          </p>
        )}

        {!ordersLoading && upcomingDeliveries.length > 0 && (
          <ul className="mt-3 space-y-2">
            {upcomingDeliveries.map((order) => (
              <li key={order.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      #{order.dailyNumber} - {order.customer?.name ?? "Banco"}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTimeLabel(order.expectedAt ?? order.businessDate)}</p>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                      <Car size={11} />
                      {getStatusLabel(order.status)}
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {formatEuroLabel(Number(order.totalAmountCents ?? 0))}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
