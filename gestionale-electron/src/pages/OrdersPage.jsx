import { useState } from "react";
import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { centsToEuro } from "../lib/money";
import { createOrder, updateOrderStatus } from "../services/ipc/orders.ipc";

const NEXT_STATUS_OPTIONS = {
  IN_ATTESA: ["CONFERMATO", "IN_PREPARAZIONE", "ANNULLATO"],
  CONFERMATO: ["IN_PREPARAZIONE", "ANNULLATO"],
  IN_PREPARAZIONE: ["PRONTO", "ANNULLATO"],
  PRONTO: ["CONSEGNATO", "ANNULLATO"],
  CONSEGNATO: [],
  ANNULLATO: [],
};

function buildDefaultFormState() {
  // Keeps the form reset behavior centralized and consistent after submit.
  return {
    type: "ASPORTO",
    productId: "",
    productName: "",
    quantity: 1,
    unitPriceCents: 0,
  };
}

export default function OrdersPage() {
  const { orders, loading, error, reload } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const [formData, setFormData] = useState(buildDefaultFormState());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const selectedProduct = products.find((product) => product.id === formData.productId) ?? null;

  async function handleCreateOrder(event) {
    // Creates a minimal single-item order payload for the current MVP flow.
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      // Minimal UI payload for now: one line item, no modifiers.
      const quantity = Number(formData.quantity);
      const unitPriceCents = Number(formData.unitPriceCents);

      await createOrder({
        type: formData.type,
        totalAmountCents: quantity * unitPriceCents,
        items: [
          {
            productId: formData.productId,
            quantity,
            unitPriceCents,
            modifiers: [],
          },
        ],
      });

      setFormData(buildDefaultFormState());
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(orderId, nextStatus) {
    // Persist status transition first, then refresh list from local DB source of truth.
    setActionError(null);

    try {
      await updateOrderStatus({ orderId, nextStatus });
      await reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight">Ordini</h2>

      <form className="grid gap-3 bg-white p-4 shadow-sm md:grid-cols-4" onSubmit={handleCreateOrder}>
        <label className="grid gap-1 text-sm text-slate-600">
          Tipo
          <select
            value={formData.type}
            onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
            className="bg-slate-50 px-2 py-2 text-sm"
          >
            <option value="ASPORTO">Asporto</option>
            <option value="DOMICILIO">Domicilio</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm text-slate-600">
          Prodotto
          <select
            value={formData.productId}
            onChange={(event) => {
              const product = products.find((candidate) => candidate.id === event.target.value) ?? null;

              setFormData((prev) => ({
                ...prev,
                productId: product?.id ?? "",
                productName: product?.name ?? "",
                unitPriceCents: product?.priceCents ?? 0,
              }));
            }}
            required
            disabled={productsLoading || products.length === 0}
            className="bg-slate-50 px-2 py-2 text-sm disabled:opacity-60"
          >
            <option value="">Seleziona prodotto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - {centsToEuro(product.priceCents)} EUR
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm text-slate-600">
          Quantita
          <input
            type="number"
            min={1}
            value={formData.quantity}
            onChange={(event) => setFormData((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
            className="bg-slate-50 px-2 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1 text-sm text-slate-600">
          Prezzo (centesimi)
          <input
            type="number"
            min={0}
            value={formData.unitPriceCents}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, unitPriceCents: Number(event.target.value) }))
            }
            className="bg-slate-50 px-2 py-2 text-sm"
          />
        </label>

        <p className="text-sm text-slate-600 md:col-span-2">
          Totale riga: <strong>{centsToEuro(formData.quantity * formData.unitPriceCents)} EUR</strong>
          {selectedProduct ? ` (${selectedProduct.name})` : ""}
        </p>

        <button
          type="submit"
          disabled={submitting || !formData.productId}
          className="bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4"
        >
          {submitting ? "Salvataggio..." : "Crea ordine"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lista ordini</h3>
          <button type="button" onClick={() => reload()} className="text-sm font-medium text-slate-700">
            Ricarica
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Caricamento ordini...</p>}

        {!loading && orders.length === 0 && <p className="text-sm text-slate-500">Nessun ordine disponibile.</p>}

        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id} className="bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    #{order.dailyNumber} - {order.type}
                  </p>
                  <p className="text-xs text-slate-500">Stato: {order.status}</p>
                </div>

                <div className="flex gap-2">
                  {(NEXT_STATUS_OPTIONS[order.status] ?? []).map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      onClick={() => handleStatusChange(order.id, nextStatus)}
                      className="bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {nextStatus}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
