import { useMemo, useState } from "react";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
import { useProducts } from "../features/products/hooks/useProducts";
import { createIngredient, deleteIngredient, updateIngredient } from "../services/ipc/ingredients.ipc";
import { createProduct, deleteProduct, updateProduct } from "../services/ipc/products.ipc";

function buildDefaultFormState() {
  return {
    id: null,
    name: "",
    description: "",
    priceEuro: "0,00",
    category: "PIZZA",
    ingredientIds: [],
  };
}

function buildDefaultIngredientFormState() {
  return {
    id: null,
    name: "",
    extraPriceEuro: "0,00",
    removeDiscountEuro: "0,00",
  };
}

function formatCentsToEuroInput(cents) {
  return (Number(cents ?? 0) / 100).toFixed(2).replace(".", ",");
}

function formatCentsToEuroLabel(cents) {
  return `${formatCentsToEuroInput(cents)} EUR`;
}

function parseEuroInputToCents(value, fieldLabel) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    throw new Error(`${fieldLabel} non valido`);
  }

  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} non valido`);
  }

  return Math.round(parsed * 100);
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">
            Chiudi
          </button>
        </header>
        <section className="p-4">{children}</section>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { products, loading, error, reload } = useProducts();
  const {
    ingredients,
    loading: ingredientsLoading,
    error: ingredientsError,
    reload: reloadIngredients,
  } = useIngredients();
  const [formData, setFormData] = useState(buildDefaultFormState());
  const [ingredientForm, setIngredientForm] = useState(buildDefaultIngredientFormState());
  const [productSearch, setProductSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [productIngredientSearch, setProductIngredientSearch] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ingredientSubmitting, setIngredientSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const isEditing = Boolean(formData.id);
  const isEditingIngredient = Boolean(ingredientForm.id);

  const ingredientsById = useMemo(() => {
    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  }, [ingredients]);

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();

    if (!search) {
      return products;
    }

    return products.filter((product) => {
      return [product.name, product.description, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [products, productSearch]);

  const filteredIngredients = useMemo(() => {
    const search = ingredientSearch.trim().toLowerCase();

    if (!search) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(search));
  }, [ingredients, ingredientSearch]);

  const filteredModalIngredients = useMemo(() => {
    const search = productIngredientSearch.trim().toLowerCase();

    if (!search) {
      return ingredients;
    }

    return ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(search));
  }, [ingredients, productIngredientSearch]);

  function resetProductForm() {
    setFormData(buildDefaultFormState());
  }

  function resetIngredientForm() {
    setIngredientForm(buildDefaultIngredientFormState());
  }

  function openCreateProductModal() {
    resetProductForm();
    setProductIngredientSearch("");
    setIsProductModalOpen(true);
  }

  function openEditProductModal(product) {
    loadProductInForm(product);
    setProductIngredientSearch("");
    setIsProductModalOpen(true);
  }

  function openCreateIngredientModal() {
    resetIngredientForm();
    setIsIngredientModalOpen(true);
  }

  function openEditIngredientModal(ingredient) {
    setIngredientForm({
      id: ingredient.id,
      name: ingredient.name,
      extraPriceEuro: formatCentsToEuroInput(ingredient.extraPriceCents),
      removeDiscountEuro: formatCentsToEuroInput(ingredient.removeDiscountCents),
    });
    setIsIngredientModalOpen(true);
  }

  function loadProductInForm(product) {
    setFormData({
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      priceEuro: formatCentsToEuroInput(product.priceCents),
      category: product.category,
      ingredientIds: Array.isArray(product.productIngredients)
        ? product.productIngredients
            .map((link) => link.ingredient?.id)
            .filter(Boolean)
        : [],
    });
  }

  function handleToggleProductIngredient(ingredientId, checked) {
    setFormData((prev) => {
      const selected = new Set(prev.ingredientIds);

      if (checked) {
        selected.add(ingredientId);
      } else {
        selected.delete(ingredientId);
      }

      return {
        ...prev,
        ingredientIds: Array.from(selected),
      };
    });
  }

  async function handleCreateProduct(event) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        priceCents: parseEuroInputToCents(formData.priceEuro, "Prezzo prodotto"),
        category: formData.category,
        ingredientIds: formData.category === "PIZZA" ? formData.ingredientIds : [],
      };

      if (isEditing) {
        await updateProduct({
          id: formData.id,
          ...payload,
        });
      } else {
        await createProduct(payload);
      }

      resetProductForm();
      setIsProductModalOpen(false);
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateIngredient(event) {
    event.preventDefault();
    setIngredientSubmitting(true);
    setActionError(null);

    try {
      const payload = {
        name: ingredientForm.name,
        extraPriceCents: parseEuroInputToCents(ingredientForm.extraPriceEuro, "Prezzo extra ingrediente"),
        removeDiscountCents: parseEuroInputToCents(
          ingredientForm.removeDiscountEuro,
          "Sconto rimozione ingrediente"
        ),
      };

      if (isEditingIngredient) {
        await updateIngredient({ id: ingredientForm.id, ...payload });
      } else {
        await createIngredient(payload);
      }

      resetIngredientForm();
      setIsIngredientModalOpen(false);
      await reloadIngredients();
    } catch (err) {
      setActionError(err);
    } finally {
      setIngredientSubmitting(false);
    }
  }

  async function handleDeleteProduct(productId) {
    setActionError(null);

    try {
      await deleteProduct({ id: productId });
      if (formData.id === productId) {
        resetProductForm();
        setIsProductModalOpen(false);
      }
      await reload();
    } catch (err) {
      setActionError(err);
    }
  }

  async function handleDeleteIngredient(ingredientId) {
    setActionError(null);

    try {
      await deleteIngredient({ id: ingredientId });

      setFormData((prev) => ({
        ...prev,
        ingredientIds: prev.ingredientIds.filter((id) => id !== ingredientId),
      }));

      await Promise.all([reloadIngredients(), reload()]);
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold tracking-tight">Prodotti</h2>

      <section className="space-y-3 border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Catalogo prodotti</h3>
          <button
            type="button"
            onClick={openCreateProductModal}
            className="bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Aggiungi prodotto
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Cerca prodotto..."
            className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
          />
          <button type="button" onClick={() => setProductSearch("")} className="px-3 py-2 text-sm text-slate-700">
            Pulisci
          </button>
          <button type="button" onClick={() => reload()} className="px-3 py-2 text-sm text-slate-700">
            Ricarica
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Caricamento prodotti...</p>}
        {!loading && filteredProducts.length === 0 && (
          <p className="text-sm text-slate-500">Nessun prodotto trovato.</p>
        )}

        <ul className="space-y-2">
          {filteredProducts.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {product.category} - {formatCentsToEuroLabel(product.priceCents)}
                </p>
                {Array.isArray(product.productIngredients) && product.productIngredients.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Ingredienti: {product.productIngredients
                      .map((link) => ingredientsById.get(link.ingredientId)?.name ?? link.ingredient?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditProductModal(product)}
                  className="bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                >
                  Modifica
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteProduct(product.id)}
                  className="bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ingredienti</h3>
          <button
            type="button"
            onClick={openCreateIngredientModal}
            className="bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Aggiungi ingrediente
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            value={ingredientSearch}
            onChange={(event) => setIngredientSearch(event.target.value)}
            placeholder="Cerca ingrediente..."
            className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setIngredientSearch("")}
            className="px-3 py-2 text-sm text-slate-700"
          >
            Pulisci
          </button>
          <button type="button" onClick={() => reloadIngredients()} className="px-3 py-2 text-sm text-slate-700">
            Ricarica
          </button>
        </div>

        {ingredientsError && <p className="text-sm text-red-600">{ingredientsError.message}</p>}
        {ingredientsLoading && <p className="text-sm text-slate-500">Caricamento ingredienti...</p>}

        {!ingredientsLoading && filteredIngredients.length === 0 && (
          <p className="text-sm text-slate-500">Nessun ingrediente trovato.</p>
        )}

        {!ingredientsLoading && filteredIngredients.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Ingrediente</th>
                  <th className="px-2 py-2 font-semibold">Extra</th>
                  <th className="px-2 py-2 font-semibold">Sconto</th>
                  <th className="px-2 py-2 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map((ingredient) => (
                  <tr key={ingredient.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-800">{ingredient.name}</td>
                    <td className="px-2 py-2 text-slate-600">{formatCentsToEuroLabel(ingredient.extraPriceCents)}</td>
                    <td className="px-2 py-2 text-slate-600">{formatCentsToEuroLabel(ingredient.removeDiscountCents)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditIngredientModal(ingredient)}
                          className="bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteIngredient(ingredient.id)}
                          className="bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}

      {isProductModalOpen && (
        <Modal title={isEditing ? "Modifica prodotto" : "Nuovo prodotto"} onClose={() => setIsProductModalOpen(false)}>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateProduct}>
            <label className="grid gap-1 text-sm text-slate-600">
              Nome
              <input
                required
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Categoria
              <select
                value={formData.category}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    category: event.target.value,
                    ingredientIds: event.target.value === "PIZZA" ? prev.ingredientIds : [],
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
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
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Prezzo (EUR)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={formData.priceEuro}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, priceEuro: event.target.value }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Aggiungi prodotto"}
              </button>
            </div>

            {formData.category === "PIZZA" && (
              <section className="space-y-2 border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ingredienti base pizza
                </p>
                <input
                  type="text"
                  value={productIngredientSearch}
                  onChange={(event) => setProductIngredientSearch(event.target.value)}
                  placeholder="Cerca ingrediente nel modal..."
                  className="w-full border border-slate-200 bg-white px-2 py-2 text-sm"
                />
                {ingredients.length === 0 ? (
                  <p className="text-sm text-slate-500">Aggiungi prima degli ingredienti.</p>
                ) : filteredModalIngredients.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun ingrediente trovato.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredModalIngredients.map((ingredient) => (
                      <label
                        key={ingredient.id}
                        className="flex items-center justify-between border border-slate-200 bg-white px-2 py-2 text-sm"
                      >
                        <span className="text-slate-700">{ingredient.name}</span>
                        <input
                          type="checkbox"
                          checked={formData.ingredientIds.includes(ingredient.id)}
                          onChange={(event) =>
                            handleToggleProductIngredient(ingredient.id, event.target.checked)
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
            )}
          </form>
        </Modal>
      )}

      {isIngredientModalOpen && (
        <Modal
          title={isEditingIngredient ? "Modifica ingrediente" : "Nuovo ingrediente"}
          onClose={() => setIsIngredientModalOpen(false)}
        >
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleCreateIngredient}>
            <label className="grid gap-1 text-sm text-slate-600 md:col-span-3">
              Nome
              <input
                required
                value={ingredientForm.name}
                onChange={(event) =>
                  setIngredientForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Extra (EUR)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={ingredientForm.extraPriceEuro}
                onChange={(event) =>
                  setIngredientForm((prev) => ({
                    ...prev,
                    extraPriceEuro: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Sconto rimozione (EUR)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={ingredientForm.removeDiscountEuro}
                onChange={(event) =>
                  setIngredientForm((prev) => ({
                    ...prev,
                    removeDiscountEuro: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <div className="flex items-end justify-end">
              <button
                type="submit"
                disabled={ingredientSubmitting}
                className="bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {ingredientSubmitting ? "Salvataggio..." : isEditingIngredient ? "Salva modifiche" : "Aggiungi ingrediente"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
