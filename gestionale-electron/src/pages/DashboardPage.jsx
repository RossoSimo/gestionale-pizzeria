import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { centsToEuro } from "../lib/money";

function formatEuroLabel(cents) {
  return `${centsToEuro(cents).replace(".", ",")} EUR`;
}

export default function DashboardPage() {
  const { orders, loading: ordersLoading } = useOrders();
  const { products, loading: productsLoading } = useProducts();

  const pendingOrders = orders.filter((order) => order.status === "IN_ATTESA").length;
  const inPrepOrders = orders.filter((order) => order.status === "IN_PREPARAZIONE").length;
  const totalRevenueCents = orders.reduce((sum, order) => sum + (order.totalAmountCents ?? 0), 0);
  const averageOrderCents = orders.length > 0 ? Math.round(totalRevenueCents / orders.length) : 0;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <article className="bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ordini totali</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : orders.length}</p>
        </article>

        <article className="bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">In attesa</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : pendingOrders}</p>
        </article>

        <article className="bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">In preparazione</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{ordersLoading ? "..." : inPrepOrders}</p>
        </article>

        <article className="bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Incasso ordini</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {ordersLoading ? "..." : formatEuroLabel(totalRevenueCents)}
          </p>
        </article>

        <article className="bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Scontrino medio</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {ordersLoading ? "..." : formatEuroLabel(averageOrderCents)}
          </p>
        </article>
      </section>

      <section className="bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Catalogo prodotti</p>
        <p className="mt-2 text-2xl font-bold text-slate-900">{productsLoading ? "..." : products.length}</p>
      </section>
    </div>
  );
}
