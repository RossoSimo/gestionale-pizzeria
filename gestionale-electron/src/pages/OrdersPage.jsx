import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { useAppSettings } from "../features/settings/hooks/useAppSettings";
import { buildExpectedAtIso, buildTimeSlotsForDate, getTodayDateInputValue } from "../lib/order-slots";
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

const BASE_CATEGORY_ORDER = ["PIZZA", "BEVANDA", "ALTRO"];

function buildDefaultFormState(businessDate, availableTimeSlots) {
  return {
    type: "ASPORTO",
    customerId: "",
    businessDate,
    expectedTimeSlot: availableTimeSlots[0] ?? "",
    notes: "",
  };
}

function getCategoryLabel(category, categoryLabels) {
  if (categoryLabels && typeof categoryLabels[category] === "string" && categoryLabels[category].trim()) {
    return categoryLabels[category].trim();
  }

  const labels = {
    ALL: "Tutti",
    PIZZA: "Pizze",
    BEVANDA: "Bevanda",
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

function isUnmodifiedCartItem(item) {
  const hasNoModifiers = !Array.isArray(item?.modifiers) || item.modifiers.length === 0;
  const hasNoNotes = typeof item?.notes !== "string" || !item.notes.trim();
  return hasNoModifiers && hasNoNotes;
}

function isPizzaCategory(category) {
  return category === "PIZZA";
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

function formatDateLabel(value) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildCustomizationState() {
  return {
    isOpen: false,
    mode: "add",
    lineItemId: null,
    productId: "",
    productName: "",
    productCategory: "",
    unitPriceCents: 0,
    quantity: 1,
    notes: "",
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
  const todayDate = useMemo(() => getTodayDateInputValue(), []);
  const { orders, loading, error, reload } = useOrders();
  const { products, loading: productsLoading } = useProducts();
  const { ingredients } = useIngredients();
  const { settings: appSettings } = useAppSettings();
  const [formData, setFormData] = useState(() => buildDefaultFormState(todayDate, []));
  const availableTimeSlots = useMemo(
    () => buildTimeSlotsForDate(appSettings, formData.businessDate),
    [appSettings, formData.businessDate]
  );
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cartItems, setCartItems] = useState([]);
  const [customization, setCustomization] = useState(buildCustomizationState());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const categoryLabels = appSettings?.categoryLabels;

  const categoryOrder = useMemo(() => {
    const labelsKeys = Object.keys(categoryLabels ?? {});
    const productKeys = products.map((product) => product.category).filter(Boolean);
    const unique = new Set([...BASE_CATEGORY_ORDER, ...labelsKeys, ...productKeys]);
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

      return getCategoryLabel(a, categoryLabels).localeCompare(getCategoryLabel(b, categoryLabels), "it-IT");
    });
  }, [categoryLabels, products]);

  useEffect(() => {
    setFormData((prev) => {
      const preservedSlot = availableTimeSlots.includes(prev.expectedTimeSlot)
        ? prev.expectedTimeSlot
        : (availableTimeSlots[0] ?? "");

      return {
        ...prev,
        businessDate: prev.businessDate || todayDate,
        expectedTimeSlot: preservedSlot,
      };
    });
  }, [availableTimeSlots, todayDate]);

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

  const groupedVisibleProducts = useMemo(() => {
    if (selectedCategory !== "ALL") {
      return [];
    }

    return categoryOrder.map((category) => ({
      category,
      items: visibleProducts.filter((product) => product.category === category),
    })).filter((group) => group.items.length > 0);
  }, [categoryOrder, selectedCategory, visibleProducts]);

  const totalAmountCents = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const modifiersPerUnit = computeModifiersPerUnit(item.modifiers);
      return sum + item.quantity * (item.unitPriceCents + modifiersPerUnit);
    }, 0);
  }, [cartItems]);

  const cartCategoryCounters = useMemo(() => {
    return cartItems.reduce((acc, item) => {
      const key = item.productCategory;

      if (!key) {
        return acc;
      }

      acc[key] = (acc[key] ?? 0) + item.quantity;

      return acc;
    }, {});
  }, [cartItems]);

  const visibleCartCategoryCounters = useMemo(() => {
    return categoryOrder
      .map((category) => ({
        category,
        quantity: cartCategoryCounters[category] ?? 0,
      }))
      .filter((item) => item.quantity > 0);
  }, [cartCategoryCounters, categoryOrder]);

  const selectedCustomer = useMemo(() => {
    return knownCustomers.find((customer) => customer.id === formData.customerId) ?? null;
  }, [formData.customerId, knownCustomers]);

  const canCustomizeIngredients = isPizzaCategory(customization.productCategory);

  function addProductToCart(product) {
    setCartItems((prev) => {
      const existingBaseItem = prev.find(
        (item) => item.productId === product.id && isUnmodifiedCartItem(item)
      );

      if (existingBaseItem) {
        return prev.map((item) =>
          item.lineItemId === existingBaseItem.lineItemId
            ? {
              ...item,
              quantity: item.quantity + 1,
            }
            : item
        );
      }

      const baseIngredients = getBaseIngredientsFromProduct(product);

      return [
        ...prev,
        {
          lineItemId: buildLineItemId(),
          productId: product.id,
          productName: product.name,
          productCategory: product.category,
          quantity: 1,
          unitPriceCents: product.priceCents,
          notes: "",
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
      productCategory: product.category,
      unitPriceCents: product.priceCents,
      quantity: 1,
      notes: "",
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
      productCategory: item.productCategory,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      notes: item.notes ?? "",
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
      productCategory: customization.productCategory,
      quantity: customization.quantity,
      unitPriceCents: customization.unitPriceCents,
      notes: customization.notes,
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

    if (!formData.businessDate) {
      setActionError(new Error("Seleziona una data ordine valida."));
      return;
    }

    if (!formData.expectedTimeSlot) {
      setActionError(new Error("Seleziona un orario tra gli slot disponibili."));
      return;
    }

    const expectedAt = buildExpectedAtIso(formData.businessDate, formData.expectedTimeSlot);

    if (!expectedAt) {
      setActionError(new Error("Orario ordine non valido."));
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      await createOrder({
        type: formData.type,
        customerId: formData.customerId || null,
        businessDate: formData.businessDate,
        expectedAt,
        notes: formData.notes?.trim() ? formData.notes.trim() : null,
        totalAmountCents,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          notes: item.notes?.trim() ? item.notes.trim() : null,
          modifiers: (item.modifiers ?? []).map((modifier) => ({
            ingredientId: modifier.ingredientId,
            action: modifier.action,
            priceAppliedCents: modifier.priceAppliedCents,
          })),
        })),
      });

      setFormData(buildDefaultFormState(todayDate, availableTimeSlots));
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
      {/* Blocco principale: composizione nuovo ordine (catalogo + carrello) */}
      <section className="bg-white p-4 shadow-sm">
        <form className="grid gap-4 xl:grid-cols-[1fr_360px]" onSubmit={handleCreateOrder}>
          {/* Colonna sinistra: filtri e catalogo prodotti */}
          <div className="space-y-4">
            {/* Riga filtri ordine: cliente, tipo, data, orario, ricerca */}
            <section className="grid gap-3 border-b border-slate-200 pb-4 md:grid-cols-2 xl:grid-cols-5">
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
                Data ordine
                <input
                  type="date"
                  value={formData.businessDate}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, businessDate: event.target.value }))
                  }
                  className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1 text-sm text-slate-600">
                Orario
                <select
                  value={formData.expectedTimeSlot}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, expectedTimeSlot: event.target.value }))
                  }
                  className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
                >
                  {availableTimeSlots.length === 0 && <option value="">Nessuno slot disponibile</option>}
                  {availableTimeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
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

            {/* Sezione catalogo: categorie e griglia prodotti */}
            <section className="space-y-3">
              {/* Filtri categoria prodotto */}
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                {["ALL", ...categoryOrder].map((category) => {
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
                      {getCategoryLabel(category, categoryLabels)}
                    </button>
                  );
                })}
              </div>

              {productsLoading && <p className="text-sm text-slate-500">Caricamento prodotti...</p>}

              {!productsLoading && visibleProducts.length === 0 && (
                <p className="text-sm text-slate-500">Nessun prodotto trovato per i filtri selezionati.</p>
              )}

              {!productsLoading && visibleProducts.length > 0 && selectedCategory !== "ALL" && (
                /* Griglia card prodotto */
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
                        <span className="text-xs text-slate-500">{getCategoryLabel(product.category, categoryLabels)}</span>
                        <span className="text-sm font-bold text-slate-700">{formatEuroLabel(product.priceCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!productsLoading && visibleProducts.length > 0 && selectedCategory === "ALL" && (
                <div className="space-y-4">
                  {groupedVisibleProducts.map((group) => (
                    <section key={group.category} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {getCategoryLabel(group.category, categoryLabels)}
                      </h4>

                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {group.items.map((product) => (
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
                              <span className="text-xs text-slate-500">{getCategoryLabel(product.category, categoryLabels)}</span>
                              <span className="text-sm font-bold text-slate-700">{formatEuroLabel(product.priceCents)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Suggerimento: tasto destro su un prodotto per aprire la personalizzazione prima di aggiungerlo.
              </p>
            </section>
          </div>

          {/* Colonna destra: riepilogo carrello e conferma ordine */}
          <aside className="border border-slate-200 bg-slate-50 p-3">
            {/* Testata carrello con dati sintetici ordine */}
            <div className="mb-3 border-b border-slate-200 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nuovo ordine</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedCustomer ? selectedCustomer.name : "Cliente al banco"}
                  </p>
                  <p className="text-xs text-slate-500">{formData.type}</p>
                  <p className="text-xs text-slate-500">Data: {formatDateLabel(formData.businessDate)}</p>
                  <p className="text-xs text-slate-500">Orario: {formData.expectedTimeSlot || "-"}</p>
                </div>

                <div className="flex flex-col gap-1 text-right">
                  {visibleCartCategoryCounters.map((counter) => (
                    <span key={counter.category} className="text-[11px] font-semibold text-slate-500">
                      {getCategoryLabel(counter.category, categoryLabels)}: {counter.quantity}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Lista righe carrello */}
            <ul className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {cartItems.map((item) => (
                <li key={item.lineItemId} className="border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                    <button
                      type="button"
                      onClick={() => removeCartItem(item.lineItemId)}
                      className="inline-flex items-center justify-center text-rose-700"
                      aria-label="Rimuovi riga dal carrello"
                      title="Rimuovi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                      {item.modifiers.map((modifier, index) => (
                        <li key={`${modifier.action}-${modifier.ingredientId}-${index}`}>
                          {modifier.action === "RIMUOVI" ? "-" : "+"} {modifier.ingredientName} ({formatModifierPriceLabel(modifier.priceAppliedCents)})
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.notes?.trim() && <p className="mt-1 text-xs text-slate-500">Nota: {item.notes}</p>}

                  <p className="text-xs text-slate-500">{formatEuroLabel(item.unitPriceCents)} cad.</p>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Controlli quantita riga */}
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

                    {/* Totali riga e azioni */}
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
                        onClick={() => openCustomizationForCartItem(item)}
                        className="inline-flex items-center justify-center text-slate-700"
                        aria-label="Personalizza riga carrello"
                        title="Personalizza"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {cartItems.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Seleziona prodotti per riempire il carrello.</p>
            )}

            {/* Footer carrello: totale ordine + submit */}
            <div className="mt-3 border-t border-slate-200 pt-3">
              <label className="mb-3 grid gap-1 text-sm text-slate-600">
                Nota ordine
                <textarea
                  value={formData.notes}
                  onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={2}
                  placeholder="Es. Vuole POS, Pagato, ben cotte..."
                  className="border border-slate-200 bg-white px-2 py-2 text-sm"
                />
              </label>

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

      {/* Messaggi errore pagina */}
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError.message}</p>}

      {/* Modal personalizzazione prodotto/riga carrello */}
      {customization.isOpen && (
        <Modal
          title={customization.mode === "add" ? "Personalizza prodotto" : "Modifica personalizzazione"}
          onClose={closeCustomizationModal}
        >
          <div className="space-y-3">
            {/* Header modal: nome prodotto e prezzo base */}
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

            <label className="grid gap-1 text-sm text-slate-600">
              Note
              <textarea
                value={customization.notes}
                onChange={(event) =>
                  setCustomization((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={2}
                placeholder="Es. ben cotta, consegna al citofono..."
                className="border border-slate-200 bg-white px-2 py-2 text-sm"
              />
            </label>

            {canCustomizeIngredients &&
              Array.isArray(customization.baseIngredients) &&
              customization.baseIngredients.length > 0 && (
              /* Sezione ingredienti base (rimozioni) */
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

            {canCustomizeIngredients && (
              /* Sezione extra ingredienti (aggiunte) */
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
            )}

            {/* Riepilogo economico personalizzazione */}
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

            {/* Azioni modal */}
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

      {/* Sezione inferiore: storico/lista ordini */}
      <section className="space-y-3 p-3">
        {/* Header lista ordini con azione reload */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lista ordini</h3>
          <button type="button" onClick={() => reload()} className="text-sm font-medium text-slate-700">
            Ricarica
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Caricamento ordini...</p>}

        {!loading && orders.length === 0 && <p className="text-sm text-slate-500">Nessun ordine disponibile.</p>}

        {/* Elenco ordini esistenti */}
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.id} className="border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Colonna info ordine */}
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    #{order.dailyNumber} - {order.type}
                  </p>
                  <p className="text-xs text-slate-500">Cliente: {order.customer?.name ?? "Banco"}</p>
                  <p className="text-xs text-slate-500">Stato: {order.status}</p>
                  <p className="text-xs text-slate-500">Ritiro/Consegna: {formatDateTimeLabel(order.expectedAt)}</p>
                </div>

                {/* Colonna azioni transizione stato */}
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
