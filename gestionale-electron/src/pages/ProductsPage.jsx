import { useMemo, useState } from "react";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
import { useProducts } from "../features/products/hooks/useProducts";
import { useAppSettings } from "../features/settings/hooks/useAppSettings";
import { createIngredient, deleteIngredient, updateIngredient } from "../services/ipc/ingredients.ipc";
import { createProduct, deleteProduct, updateProduct } from "../services/ipc/products.ipc";
import ToastNotifications, { useToastNotifications } from "../components/common/ToastNotifications";
import { Search, Plus, Utensils, Egg, Edit2, Trash2, Tag, RefreshCw, X, Check } from "lucide-react";

const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);
const BASE_CATEGORY_ORDER = ["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI", "BEVANDA", "ALTRO"];

function getCategoryLabel(category, categoryLabels) {
  if (categoryLabels && typeof categoryLabels[category] === "string" && categoryLabels[category].trim()) {
    return categoryLabels[category].trim();
  }

  const defaults = {
    PIZZA: "Pizze",
    PIZZA_STAGIONALI: "Pizze stagionali",
    PIZZA_SPECIALI: "Pizze speciali",
    BEVANDA: "Bevanda",
    ALTRO: "Altro",
  };

  return defaults[category] ?? category;
}

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

function isPizzaFamilyCategory(category) {
  return PIZZA_FAMILY_CATEGORY_KEYS.has(category);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const { products, loading, error, reload } = useProducts();
  const { settings: appSettings } = useAppSettings();
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
  const [activeTab, setActiveTab] = useState("products");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ingredientSubmitting, setIngredientSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const isEditing = Boolean(formData.id);
  const isEditingIngredient = Boolean(ingredientForm.id);

  const categoryOrder = useMemo(() => {
    const settingKeys = Object.keys(appSettings?.categoryLabels ?? {});
    const productKeys = products.map((product) => product.category).filter(Boolean);
    const unique = new Set([...BASE_CATEGORY_ORDER, ...settingKeys, ...productKeys]);
    const ordered = Array.from(unique);

    return ordered.sort((a, b) => {
      const aBaseIndex = BASE_CATEGORY_ORDER.indexOf(a);
      const bBaseIndex = BASE_CATEGORY_ORDER.indexOf(b);

      if (aBaseIndex >= 0 && bBaseIndex >= 0) {
        return aBaseIndex - bBaseIndex;
      }

      if (aBaseIndex >= 0) {
        return -1;
      }

      if (bBaseIndex >= 0) {
        return 1;
      }

      return getCategoryLabel(a, appSettings?.categoryLabels).localeCompare(
        getCategoryLabel(b, appSettings?.categoryLabels),
        "it-IT"
      );
    });
  }, [appSettings?.categoryLabels, products]);

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
    const selectedIngredientIds = new Set(formData.ingredientIds);

    const sourceIngredients = !search
      ? ingredients
      : ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(search));

    return [...sourceIngredients].sort((a, b) => {
      const aSelected = selectedIngredientIds.has(a.id);
      const bSelected = selectedIngredientIds.has(b.id);

      if (aSelected !== bSelected) {
        return aSelected ? -1 : 1;
      }

      return a.name.localeCompare(b.name, "it-IT");
    });
  }, [formData.ingredientIds, ingredients, productIngredientSearch]);

  function resetProductForm() {
    setFormData(buildDefaultFormState());
  }

  function resetIngredientForm() {
    setIngredientForm(buildDefaultIngredientFormState());
  }

  function openCreateProductModal() {
      resetProductForm();
      setFormData((prev) => ({
        ...prev,
        category: categoryOrder[0] ?? "PIZZA",
      }));
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
        ingredientIds: isPizzaFamilyCategory(formData.category) ? formData.ingredientIds : [],
      };

      if (isEditing) {
        await updateProduct({
          id: formData.id,
          ...payload,
        });
        pushToast({ type: "success", title: "Prodotto aggiornato" });
      } else {
        await createProduct(payload);
        pushToast({ type: "success", title: "Prodotto creato" });
      }

      resetProductForm();
      setIsProductModalOpen(false);
      await reload();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
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
        pushToast({ type: "success", title: "Ingrediente aggiornato" });
      } else {
        await createIngredient(payload);
        pushToast({ type: "success", title: "Ingrediente creato" });
      }

      resetIngredientForm();
      setIsIngredientModalOpen(false);
      await reloadIngredients();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
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
      pushToast({ type: "info", title: "Prodotto eliminato" });
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore durante l'eliminazione", description: err.message });
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
      pushToast({ type: "info", title: "Ingrediente eliminato" });
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore durante l'eliminazione", description: err.message });
    }
  }

  return (
    <div className="space-y-6">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />
      
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Menù e Listini</h2>
        
        <div className="flex space-x-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button 
            type="button"
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "products" ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-200/60" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Utensils size={16} />
            Prodotti
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab("ingredients")}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "ingredients" ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-200/60" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Egg size={16} />
            Ingredienti
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-rose-600">{error.message}</p>}
      {actionError && <p className="text-sm text-rose-600">{actionError.message}</p>}

      <main className="ui-surface min-h-[500px]">
        {activeTab === "products" ? (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cerca prodotto..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {productSearch && (
                  <button onClick={() => setProductSearch("")} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600" title="Pulisci ricerca">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => reload()} className="ui-btn ui-btn-neutral flex items-center gap-2 px-3 py-2 text-slate-600" title="Ricarica">
                  <RefreshCw size={16} />
                  <span className="hidden sm:inline">Ricarica</span>
                </button>
                <button type="button" onClick={openCreateProductModal} className="ui-btn ui-btn-success flex items-center gap-2 px-4 py-2 shadow-sm">
                  <Plus size={16} />
                  Aggiungi <span className="hidden sm:inline">Prodotto</span>
                </button>
              </div>
            </div>

            {loading && <div className="py-12 text-center text-sm font-medium text-slate-500">Caricamento prodotti...</div>}
            {!loading && filteredProducts.length === 0 && <div className="py-12 text-center text-sm font-medium text-slate-500">Nessun prodotto trovato.</div>}
            
            {!loading && filteredProducts.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map(product => (
                  <article key={product.id} className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold leading-tight text-slate-900">{product.name}</h4>
                        <span className="shrink-0 font-bold text-emerald-700">{formatCentsToEuroLabel(product.priceCents)}</span>
                      </div>
                      <div className="mt-2 flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        <Tag size={12} className="text-slate-400" />
                        {getCategoryLabel(product.category, appSettings?.categoryLabels)}
                      </div>
                      {(product.description || (Array.isArray(product.productIngredients) && product.productIngredients.length > 0)) && (
                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
                          {product.description && <p className="italic">"{product.description}"</p>}
                          {Array.isArray(product.productIngredients) && product.productIngredients.length > 0 && (
                            <div className="flex items-start gap-1.5">
                              <Egg className="mt-0.5 shrink-0 text-slate-400" size={14}/>
                              <span className="leading-snug">{product.productIngredients.map((link) => ingredientsById.get(link.ingredientId)?.name ?? link.ingredient?.name).filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-3 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                      <button type="button" onClick={() => openEditProductModal(product)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 focus:opacity-100" title="Modifica">
                        <Edit2 size={16} />
                      </button>
                      <button type="button" onClick={() => handleDeleteProduct(product.id)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:opacity-100" title="Elimina">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  placeholder="Cerca ingrediente..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {ingredientSearch && (
                  <button onClick={() => setIngredientSearch("")} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600" title="Pulisci ricerca">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => reloadIngredients()} className="ui-btn ui-btn-neutral flex items-center gap-2 px-3 py-2 text-slate-600" title="Ricarica">
                  <RefreshCw size={16} />
                  <span className="hidden sm:inline">Ricarica</span>
                </button>
                <button type="button" onClick={openCreateIngredientModal} className="ui-btn ui-btn-success flex items-center gap-2 px-4 py-2 shadow-sm">
                  <Plus size={16} />
                  Aggiungi <span className="hidden sm:inline">Ingrediente</span>
                </button>
              </div>
            </div>

            {ingredientsLoading && <div className="py-12 text-center text-sm font-medium text-slate-500">Caricamento ingredienti...</div>}
            {!ingredientsLoading && filteredIngredients.length === 0 && <div className="py-12 text-center text-sm font-medium text-slate-500">Nessun ingrediente trovato.</div>}

            {!ingredientsLoading && filteredIngredients.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full whitespace-nowrap text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Nome Ingrediente</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Prezzo Extra</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Sconto Rimozione</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredIngredients.map(ing => (
                        <tr key={ing.id} className="group transition-colors hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800">{ing.name}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {ing.extraPriceCents > 0 ? (
                              <span className="inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                                +{formatCentsToEuroLabel(ing.extraPriceCents)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {ing.removeDiscountCents > 0 ? (
                              <span className="inline-flex items-center rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                                -{formatCentsToEuroLabel(ing.removeDiscountCents)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                              <button type="button" onClick={() => openEditIngredientModal(ing)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 focus:opacity-100" title="Modifica">
                                <Edit2 size={16} />
                              </button>
                              <button type="button" onClick={() => handleDeleteIngredient(ing.id)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:opacity-100" title="Elimina">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {isProductModalOpen && (
        <Modal title={isEditing ? "Modifica prodotto" : "Nuovo prodotto"} onClose={() => setIsProductModalOpen(false)}>
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleCreateProduct}>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Nome
              <input
                required
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Categoria
              <select
                value={formData.category}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    category: event.target.value,
                    ingredientIds: isPizzaFamilyCategory(event.target.value) ? prev.ingredientIds : [],
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {categoryOrder.map((categoryKey) => (
                  <option key={categoryKey} value={categoryKey}>
                    {getCategoryLabel(categoryKey, appSettings?.categoryLabels)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700 md:col-span-2">
              <span className="flex items-center gap-1">
                Descrizione <span className="text-xs font-normal text-slate-400">(Opzionale)</span>
              </span>
              <input
                value={formData.description}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Prezzo
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={formData.priceEuro}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, priceEuro: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </label>

            {isPizzaFamilyCategory(formData.category) && (
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 md:col-span-2 mt-2">
                <div className="flex items-center gap-2">
                  <Egg className="text-slate-400" size={18} />
                  <h4 className="text-sm font-semibold text-slate-700">
                    Ingredienti base
                  </h4>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={productIngredientSearch}
                    onChange={(event) => setProductIngredientSearch(event.target.value)}
                    placeholder="Cerca ingrediente da aggiungere come base..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {productIngredientSearch && (
                    <button type="button" onClick={() => setProductIngredientSearch("")} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600" title="Pulisci ricerca">
                      <X size={16} />
                    </button>
                  )}
                </div>

                {ingredients.length === 0 ? (
                  <p className="text-sm text-slate-500">Aggiungi prima degli ingredienti.</p>
                ) : filteredModalIngredients.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun ingrediente trovato.</p>
                ) : (
                  <div className="grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {filteredModalIngredients.map((ingredient) => {
                      const isChecked = formData.ingredientIds.includes(ingredient.id);
                      return (
                        <label
                          key={ingredient.id}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                            isChecked ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span className={`${isChecked ? "font-medium text-emerald-800" : "text-slate-700"}`}>
                            {ingredient.name}
                          </span>
                          <div className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            isChecked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                          }`}>
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={(event) =>
                              handleToggleProductIngredient(ingredient.id, event.target.checked)
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-5 mt-2">
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="ui-btn ui-btn-neutral px-4 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="ui-btn ui-btn-success px-5 py-2 text-sm shadow-sm"
              >
                {submitting ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Aggiungi prodotto"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isIngredientModalOpen && (
        <Modal
          title={isEditingIngredient ? "Modifica ingrediente" : "Nuovo ingrediente"}
          onClose={() => setIsIngredientModalOpen(false)}
        >
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleCreateIngredient}>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700 md:col-span-2">
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
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Prezzo Extra
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">€</span>
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
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Sconto rimozione
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">€</span>
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
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </label>

            <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-5 mt-2">
              <button
                type="button"
                onClick={() => setIsIngredientModalOpen(false)}
                className="ui-btn ui-btn-neutral px-4 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={ingredientSubmitting}
                className="ui-btn ui-btn-success px-5 py-2 text-sm shadow-sm"
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
