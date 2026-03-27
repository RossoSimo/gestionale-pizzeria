import { useState } from "react";
import { useProducts } from "../features/products/hooks/useProducts";
import { createProduct, deleteProduct } from "../services/ipc/products.ipc";

function buildDefaultFormState() {
  // Shared default state used on first render and after successful submit.
  return {
    name: "",
    description: "",
    priceCents: 0,
    category: "PIZZA",
  };
}

export default function ProductsPage() {
  const { products, loading, error, reload } = useProducts();
  const [formData, setFormData] = useState(buildDefaultFormState());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function handleCreateProduct(event) {
    // Creates a product through IPC and refreshes local list from SQLite source of truth.
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      // Form values are normalized here before crossing IPC boundary.
      // Sends normalized form payload to main process where final validation runs.
      await createProduct({
        name: formData.name,
        description: formData.description,
        priceCents: Number(formData.priceCents),
        category: formData.category,
      });

      setFormData(buildDefaultFormState());
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteProduct(productId) {
    // Deletes are soft deletes at repository level to preserve sync history.
    setActionError(null);

    try {
      await deleteProduct({ id: productId });
      await reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight">Prodotti</h2>

      <form className="grid gap-3 bg-white p-4 shadow-sm md:grid-cols-2" onSubmit={handleCreateProduct}>
        <label className="grid gap-1 text-sm text-slate-600">
          Nome
          <input
            required
            value={formData.name}
            onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
            className="bg-slate-50 px-2 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1 text-sm text-slate-600">
          Categoria
          <select
            value={formData.category}
            onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            className="bg-slate-50 px-2 py-2 text-sm"
          >
            <option value="PIZZA">Pizza</option>
            <option value="BEVANDA">Bevanda</option>
            <option value="FRITTO">Fritto</option>
            <option value="DOLCE">Dolce</option>
            <option value="ALTRO">Altro</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm text-slate-600 md:col-span-2">
          Descrizione
          <input
            value={formData.description}
            onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
            className="bg-slate-50 px-2 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1 text-sm text-slate-600">
          Prezzo (centesimi)
          <input
            type="number"
            min={0}
            value={formData.priceCents}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, priceCents: Number(event.target.value) }))
            }
            className="bg-slate-50 px-2 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Salvataggio..." : "Aggiungi prodotto"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Catalogo</h3>
          <button type="button" onClick={() => reload()} className="text-sm font-medium text-slate-700">
            Ricarica
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Caricamento prodotti...</p>}

        {!loading && products.length === 0 && <p className="text-sm text-slate-500">Nessun prodotto disponibile.</p>}

        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 bg-white p-3 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {product.category} - {product.priceCents} cents
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteProduct(product.id)}
                className="bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
              >
                Elimina
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
