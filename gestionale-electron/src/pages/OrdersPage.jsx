import { useMemo, useState } from "react";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
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
  return {
    type: "ASPORTO",
    customerId: "",
  };
}

function getCategoryLabel(category) {
  const labels = {
    ALL: "Tutti",
    PIZZA: "Pizze",
    BEVANDA: "Bevande",
    FRITTO: "Fritti",
    DOLCE: "Dolci",
    ALTRO: "Altro",
  };

  return labels[category] ?? category;
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildKnownCustomers(orders) {
  const byId = new Map();

  for (const order of orders) {
    if (!order?.customer?.id || !order?.customer?.name) {
      continue;
    }

    if (!byId.has(order.customer.id)) {
      byId.set(order.customer.id, order.customer);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getBaseIngredientsFromProduct(product) {
  if (!Array.isArray(product?.productIngredients)) {
    return [];
  }

  return product.productIngredients
    .map((link) => link.ingredient)
    .filter((ingredient) => ingredient && ingredient.id);
}

function buildLineItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function computeModifiersPerUnit(modifiers) {
  return (modifiers ?? []).reduce((sum, modifier) => sum + (modifier.priceAppliedCents ?? 0), 0);
}

function buildRemoveModifier(ingredient) {
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    action: "RIMUOVI",
    priceAppliedCents: -Math.abs(ingredient.removeDiscountCents ?? 0),
  };
}

function buildExtraModifier(ingredient) {
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    action: "AGGIUNGI",
    priceAppliedCents: ingredient.extraPriceCents ?? 0,
  };
}

function formatEuroValue(cents) {
  return centsToEuro(cents).replace(".", ",");
}

function formatEuroLabel(cents) {
  return `${formatEuroValue(cents)} EUR`;
}

function formatModifierPriceLabel(cents) {
  if (cents === 0) {
    return "0,00 EUR";
  }

  if (cents > 0) {
    return `+${formatEuroLabel(cents)}`;
  }

  return `-${formatEuroLabel(Math.abs(cents))}`;
}

function buildCustomizationState() {
  return {
    isOpen: false,
    mode: "add",
    lineItemId: null,
    productId: "",
    productName: "",
    unitPriceCents: 0,
    quantity: 1,
    baseIngredients: [],
    modifiers: [],
  };
}

function cloneModifiers(modifiers) {
  return (modifiers ?? []).map((modifier) => ({ ...modifier }));
}

function cloneBaseIngredients(baseIngredients) {
  return (baseIngredients ?? []).map((ingredient) => ({ ...ingredient }));
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

export default function OrdersPage() {
  const { orders, loading, error, reload } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const { ingredients } = useIngredients();
  const [formData, setFormData] = useState(buildDefaultFormState());
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [customization, setCustomization] = useState(buildCustomizationState());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const knownCustomers = useMemo(() => buildKnownCustomers(orders), [orders]);

  const visibleProducts = useMemo(() => {
    const searchText = normalizeSearchText(searchQuery);

    return products.filter((product) => {
      if (selectedCategory !== "ALL" && product.category !== selectedCategory) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      return normalizeSearchText(product.name).includes(searchText);
    });
  }, [products, searchQuery, selectedCategory]);

  const totalAmountCents = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const modifiersPerUnit = computeModifiersPerUnit(item.modifiers);
      return sum + item.quantity * (item.unitPriceCents + modifiersPerUnit);
    }, 0);
  }, [cartItems]);

  const selectedCustomer = useMemo(() => {
    return knownCustomers.find((customer) => customer.id === formData.customerId) ?? null;
  }, [formData.customerId, knownCustomers]);

  function addProductToCart(product) {
    setCartItems((prev) => {
      const lineItemId = buildLineItemId();
      const baseIngredients = getBaseIngredientsFromProduct(product);

      return [
        ...prev,
        {
          lineItemId,
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPriceCents: product.priceCents,
          baseIngredients,
          modifiers: [],
        },
      ];
    });
  }

  function openCustomizationForProduct(product) {
    setCustomization({
      isOpen: true,
      mode: "add",
      lineItemId: null,
      productId: product.id,
      productName: product.name,
      unitPriceCents: product.priceCents,
      quantity: 1,
      baseIngredients: cloneBaseIngredients(getBaseIngredientsFromProduct(product)),
      modifiers: [],
    });
  }

  function openCustomizationForCartItem(item) {
    setCustomization({
      isOpen: true,
      mode: "edit",
      lineItemId: item.lineItemId,
      productId: item.productId,
      productName: item.productName,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      baseIngredients: cloneBaseIngredients(item.baseIngredients),
      modifiers: cloneModifiers(item.modifiers),
    });
  }

  function closeCustomizationModal() {
    setCustomization(buildCustomizationState());
  }

  function setCustomizationQuantity(nextQuantity) {
    setCustomization((prev) => ({
      ...prev,
      quantity: Math.max(1, nextQuantity),
    }));
  }

  function setCustomizationIngredientRemoved(ingredient, removed) {
    setCustomization((prev) => {
      const cleanedModifiers = (prev.modifiers ?? []).filter(
        (modifier) => !(modifier.action === "RIMUOVI" && modifier.ingredientId === ingredient.id)
      );

      if (!removed) {
        return {
          ...prev,
          modifiers: cleanedModifiers,
        };
      }

      return {
        ...prev,
        modifiers: [...cleanedModifiers, buildRemoveModifier(ingredient)],
      };
    });
  }

  function addCustomizationExtraIngredient(ingredientId) {
    const ingredient = ingredients.find((candidate) => candidate.id === ingredientId);

    if (!ingredient) {
      return;
    }

    setCustomization((prev) => {
      const alreadyAdded = (prev.modifiers ?? []).some(
        (modifier) => modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredientId
      );

      if (alreadyAdded) {
        return prev;
      }

      return {
        ...prev,
        modifiers: [...(prev.modifiers ?? []), buildExtraModifier(ingredient)],
      };
    });
  }

  function removeCustomizationExtraIngredient(ingredientId) {
    setCustomization((prev) => ({
      ...prev,
      modifiers: (prev.modifiers ?? []).filter(
        (modifier) => !(modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredientId)
      ),
    }));
  }

  function applyCustomization() {
    if (!customization.isOpen) {
      return;
    }

    const nextItem = {
      lineItemId: customization.mode === "edit" ? customization.lineItemId : buildLineItemId(),
      productId: customization.productId,
      productName: customization.productName,
      quantity: customization.quantity,
      unitPriceCents: customization.unitPriceCents,
      baseIngredients: cloneBaseIngredients(customization.baseIngredients),
      modifiers: cloneModifiers(customization.modifiers),
    };

    if (customization.mode === "add") {
      setCartItems((prev) => [...prev, nextItem]);
      closeCustomizationModal();
      return;
    }

    setCartItems((prev) =>
      prev.map((item) => (item.lineItemId === customization.lineItemId ? nextItem : item))
    );
    closeCustomizationModal();
  }

  function increaseCartItem(lineItemId) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.lineItemId === lineItemId
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      )
    );
  }

  function decreaseCartItem(lineItemId) {
    setCartItems((prev) => {
      const updated = prev
        .map((item) =>
          item.lineItemId === lineItemId
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0);

      return updated;
    });
  }

  function removeCartItem(lineItemId) {
    setCartItems((prev) => prev.filter((item) => item.lineItemId !== lineItemId));
  }

  function setIngredientRemoved(lineItemId, ingredient, removed) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.lineItemId !== lineItemId) {
          return item;
        }

        const cleanedModifiers = (item.modifiers ?? []).filter(
          (modifier) => !(modifier.action === "RIMUOVI" && modifier.ingredientId === ingredient.id)
        );

        if (!removed) {
          return {
            ...item,
            modifiers: cleanedModifiers,
          };
        }

        return {
          ...item,
          modifiers: [...cleanedModifiers, buildRemoveModifier(ingredient)],
        };
      })
    );
  }

  function addExtraIngredient(lineItemId, ingredientId) {
    const ingredient = ingredients.find((candidate) => candidate.id === ingredientId);

    if (!ingredient) {
      return;
    }

    setCartItems((prev) =>
      prev.map((item) => {
        if (item.lineItemId !== lineItemId) {
          return item;
        }

        const alreadyAdded = (item.modifiers ?? []).some(
          (modifier) => modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredientId
        );

        if (alreadyAdded) {
          return item;
        }

        return {
          ...item,
          modifiers: [...(item.modifiers ?? []), buildExtraModifier(ingredient)],
        };
      })
    );
  }

  function removeExtraIngredient(lineItemId, ingredientId) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.lineItemId !== lineItemId) {
          return item;
        }

        return {
          ...item,
          modifiers: (item.modifiers ?? []).filter(
            (modifier) => !(modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredientId)
          ),
        };
      })
    );
  }

  async function handleCreateOrder(event) {
    event.preventDefault();

    if (cartItems.length === 0) {
      setActionError(new Error("Aggiungi almeno un prodotto al carrello."));
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      await createOrder({
        type: formData.type,
        customerId: formData.customerId || null,
        totalAmountCents,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          modifiers: (item.modifiers ?? []).map((modifier) => ({
            ingredientId: modifier.ingredientId,
            action: modifier.action,
            priceAppliedCents: modifier.priceAppliedCents,
          })),
        })),
      });

      setFormData(buildDefaultFormState());
      setCartItems([]);
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
      <section className="border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-4 xl:grid-cols-[1fr_360px]" onSubmit={handleCreateOrder}>
          <div className="space-y-4">
            <section className="grid gap-3 border-b border-slate-200 pb-4 lg:grid-cols-[minmax(260px,1fr)_180px_1fr]">
              <label className="grid gap-1 text-sm text-slate-600">
                Cliente
                <select
                  value={formData.customerId}
                  onChange={(event) => setFormData((prev) => ({ ...prev, customerId: event.target.value }))}
                  className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
                >
                  <option value="">Cliente al banco</option>
                  {knownCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-600">
                Tipo ordine
                <select
                  value={formData.type}
                  onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
                  className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
                >
                  <option value="ASPORTO">Asporto</option>
                  <option value="DOMICILIO">Domicilio</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-slate-600">
                Cerca prodotto
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cerca per nome..."
                  className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
                />
              </label>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                {["ALL", "PIZZA", "BEVANDA", "FRITTO", "DOLCE", "ALTRO"].map((category) => {
                  const isActive = selectedCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={
                        isActive
                          ? "border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white"
                          : "border border-slate-300 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 hover:bg-slate-100"
                      }
                    >
                      {getCategoryLabel(category)}
                    </button>
                  );
                })}
              </div>

              {productsLoading && <p className="text-sm text-slate-500">Caricamento prodotti...</p>}

              {!productsLoading && visibleProducts.length === 0 && (
                <p className="text-sm text-slate-500">Nessun prodotto trovato per i filtri selezionati.</p>
              )}

              {!productsLoading && visibleProducts.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleProducts.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => addProductToCart(product)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openCustomizationForProduct(product);
                        }}
                        className="grid w-full gap-1 border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
                      >
                        <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                        <span className="text-xs text-slate-500">{getCategoryLabel(product.category)}</span>
                        <span className="text-sm font-bold text-slate-700">{formatEuroLabel(product.priceCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-slate-500">
                Suggerimento: tasto destro su un prodotto per aprire la personalizzazione prima di aggiungerlo.
              </p>
            </section>
          </div>

          <aside className="border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 border-b border-slate-200 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nuovo ordine</p>
              <p className="text-sm font-semibold text-slate-900">
                {selectedCustomer ? selectedCustomer.name : "Cliente al banco"}
              </p>
              <p className="text-xs text-slate-500">{formData.type}</p>
            </div>

            <ul className="max-h-[440px] space-y-2 overflow-auto pr-1">
              {cartItems.map((item) => (
                <li key={item.lineItemId} className="border border-slate-200 bg-white p-2">
                  <p className="text-sm font-semibold text-slate-900">{item.productName}</p>

                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                      {item.modifiers.map((modifier, index) => (
                        <li key={`${modifier.action}-${modifier.ingredientId}-${index}`}>
                          {modifier.action === "RIMUOVI" ? "-" : "+"} {modifier.ingredientName} ({formatModifierPriceLabel(modifier.priceAppliedCents)})
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-xs text-slate-500">{formatEuroLabel(item.unitPriceCents)} cad.</p>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => decreaseCartItem(item.lineItemId)}
                        className="border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold text-slate-800">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => increaseCartItem(item.lineItemId)}
                        className="border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">
                        Variazioni: {formatEuroLabel(computeModifiersPerUnit(item.modifiers))}
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatEuroLabel(
                          item.quantity * (item.unitPriceCents + computeModifiersPerUnit(item.modifiers))
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.lineItemId)}
                        className="text-xs font-medium text-rose-700"
                      >
                        Rimuovi
                      </button>

                      <button
                        type="button"
                        onClick={() => openCustomizationForCartItem(item)}
                        className="text-xs font-medium text-slate-700"
                      >
                        Personalizza
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {cartItems.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Seleziona prodotti per riempire il carrello.</p>
            )}

            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Totale</span>
                <span className="text-xl font-bold text-slate-900">{formatEuroLabel(totalAmountCents)}</span>
              </div>

              <button
                type="submit"
                disabled={submitting || cartItems.length === 0}
                className="w-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Salvataggio..." : "Conferma ordine"}
              </button>
            </div>
          </aside>
        </form>
      </section>

      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}

      {customization.isOpen && (
        <Modal
          title={customization.mode === "add" ? "Personalizza prodotto" : "Modifica personalizzazione"}
          onClose={closeCustomizationModal}
        >
          <div className="space-y-3">
            <div className="border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{customization.productName}</p>
              <p className="text-xs text-slate-500">Prezzo base: {formatEuroLabel(customization.unitPriceCents)}</p>
            </div>

            <label className="grid gap-1 text-sm text-slate-600">
              Quantita
              <input
                type="number"
                min={1}
                value={customization.quantity}
                onChange={(event) => setCustomizationQuantity(Number(event.target.value))}
                className="border border-slate-200 bg-white px-2 py-2 text-sm"
              />
            </label>

            {Array.isArray(customization.baseIngredients) && customization.baseIngredients.length > 0 && (
              <section className="space-y-1 border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingredienti base</p>
                {customization.baseIngredients.map((ingredient) => {
                  const isRemoved = (customization.modifiers ?? []).some(
                    (modifier) => modifier.action === "RIMUOVI" && modifier.ingredientId === ingredient.id
                  );

                  return (
                    <label key={ingredient.id} className="flex items-center justify-between text-sm">
                      <span className={isRemoved ? "text-slate-400 line-through" : "text-slate-700"}>
                        {ingredient.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={!isRemoved}
                        onChange={(event) =>
                          setCustomizationIngredientRemoved(ingredient, !event.target.checked)
                        }
                      />
                    </label>
                  );
                })}
              </section>
            )}

            <section className="space-y-1 border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extra ingredienti</p>
              <div className="flex flex-wrap gap-1">
                {ingredients
                  .filter(
                    (ingredient) =>
                      !(customization.baseIngredients ?? []).some((base) => base.id === ingredient.id)
                  )
                  .map((ingredient) => {
                    const isAdded = (customization.modifiers ?? []).some(
                      (modifier) =>
                        modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredient.id
                    );

                    if (isAdded) {
                      return (
                        <button
                          key={ingredient.id}
                          type="button"
                          onClick={() => removeCustomizationExtraIngredient(ingredient.id)}
                          className="border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                        >
                          {ingredient.name} +{formatEuroLabel(ingredient.extraPriceCents)}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={ingredient.id}
                        type="button"
                        onClick={() => addCustomizationExtraIngredient(ingredient.id)}
                        className="border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                      >
                        + {ingredient.name}
                      </button>
                    );
                  })}
              </div>
            </section>

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div>
                <p className="text-xs text-slate-500">Variazioni</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatEuroLabel(computeModifiersPerUnit(customization.modifiers))}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-slate-500">Totale riga</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatEuroLabel(
                    customization.quantity *
                      (customization.unitPriceCents + computeModifiersPerUnit(customization.modifiers))
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeCustomizationModal}
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Annulla
              </button>

              <button
                type="button"
                onClick={applyCustomization}
                className="bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                {customization.mode === "add" ? "Aggiungi al carrello" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
            <li key={order.id} className="border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    #{order.dailyNumber} - {order.type}
                  </p>
                  <p className="text-xs text-slate-500">Cliente: {order.customer?.name ?? "Banco"}</p>
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
