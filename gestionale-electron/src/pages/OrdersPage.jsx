import { useEffect, useMemo, useState } from "react";
import { Clock3, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { useCustomers } from "../features/customers/hooks/useCustomers";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { useAppSettings } from "../features/settings/hooks/useAppSettings";
import { buildExpectedAtIso, buildTimeSlotsForDate, getTodayDateInputValue } from "../lib/order-slots";
import { centsToEuro } from "../lib/money";
import { createCustomer, deleteCustomer, updateCustomer } from "../services/ipc/customers.ipc";
import { createOrder, updateOrder, updateOrderStatus } from "../services/ipc/orders.ipc";

const NEXT_STATUS_OPTIONS = {
  IN_ATTESA: ["CONFERMATO", "IN_PREPARAZIONE", "ANNULLATO"],
  CONFERMATO: ["IN_PREPARAZIONE", "ANNULLATO"],
  IN_PREPARAZIONE: ["PRONTO", "ANNULLATO"],
  PRONTO: ["CONSEGNATO", "ANNULLATO"],
  CONSEGNATO: [],
  ANNULLATO: [],
};

const STATUS_LABELS = {
  IN_ATTESA: "In attesa",
  CONFERMATO: "Confermato",
  IN_PREPARAZIONE: "In preparazione",
  PRONTO: "Pronto",
  CONSEGNATO: "Consegnato",
  ANNULLATO: "Annullato",
};

const STATUS_BADGE_CLASS = {
  IN_ATTESA: "border border-amber-200 bg-amber-50 text-amber-800",
  CONFERMATO: "border border-sky-200 bg-sky-50 text-sky-800",
  IN_PREPARAZIONE: "border border-indigo-200 bg-indigo-50 text-indigo-800",
  PRONTO: "border border-emerald-200 bg-emerald-50 text-emerald-800",
  CONSEGNATO: "border border-teal-200 bg-teal-50 text-teal-800",
  ANNULLATO: "border border-rose-200 bg-rose-50 text-rose-800",
};

const BASE_CATEGORY_ORDER = ["PIZZA", "BEVANDA", "ALTRO"];
const ACTIVE_ORDER_STATUSES = new Set(["IN_ATTESA", "CONFERMATO", "IN_PREPARAZIONE", "PRONTO"]);

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

function buildKnownCustomers(customers) {
  const byId = new Map();

  for (const customer of customers ?? []) {
    if (!customer?.id || !customer?.name) {
      continue;
    }

    if (!byId.has(customer.id)) {
      byId.set(customer.id, customer);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildCustomerFormState() {
  return {
    id: "",
    name: "",
    phone: "",
    address: "",
    notes: "",
    isTemporary: false,
  };
}

function formatCustomerSearchLabel(customer) {
  const parts = [customer?.name ?? ""];

  if (customer?.address) {
    parts.push(customer.address);
  }

  if (customer?.phone) {
    parts.push(customer.phone);
  }

  if (customer?.isTemporary) {
    parts.push("temporaneo oggi");
  }

  return parts.filter(Boolean).join(" - ");
}

function isValidPhoneNumber(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return true;
  }

  if (!/^\+?[0-9\s()\-]{6,20}$/.test(normalized)) {
    return false;
  }

  const digitsOnly = normalized.replace(/\D/g, "");
  return digitsOnly.length >= 6 && digitsOnly.length <= 15;
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

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function getStatusBadgeClass(status) {
  return STATUS_BADGE_CLASS[status] ?? "border border-slate-200 bg-slate-50 text-slate-700";
}

function getPrimaryNextStatus(currentStatus) {
  const nextStatuses = NEXT_STATUS_OPTIONS[currentStatus] ?? [];
  return nextStatuses.find((status) => status !== "ANNULLATO") ?? null;
}

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

function formatTimeSlotFromIso(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  const { customers, reload: reloadCustomers } = useCustomers();
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
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState("create");
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const [isCustomerDeleteConfirmOpen, setIsCustomerDeleteConfirmOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(buildCustomerFormState());
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState("");
  const [statusChangeRequest, setStatusChangeRequest] = useState(null);
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

  const knownCustomers = useMemo(() => buildKnownCustomers(customers), [customers]);

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

  const customersWithActiveOrders = useMemo(() => {
    const ids = new Set();

    for (const order of orders) {
      if (!order?.customer?.id) {
        continue;
      }

      if (ACTIVE_ORDER_STATUSES.has(order.status)) {
        ids.add(order.customer.id);
      }
    }

    return ids;
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = normalizeSearchText(customerSearchQuery);

    if (!normalizedSearch) {
      return knownCustomers;
    }

    return knownCustomers.filter((customer) => {
      const haystack = [customer.name, customer.address, customer.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [customerSearchQuery, knownCustomers]);

  const productById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const ingredientById = useMemo(() => {
    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  }, [ingredients]);

  const editingOrder = useMemo(() => {
    return orders.find((order) => order.id === editingOrderId) ?? null;
  }, [editingOrderId, orders]);

  const cancelStatusOrder = useMemo(() => {
    if (statusChangeRequest?.nextStatus !== "ANNULLATO") {
      return null;
    }

    return orders.find((order) => order.id === statusChangeRequest.orderId) ?? null;
  }, [orders, statusChangeRequest]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerSearchQuery("");
      return;
    }

    setCustomerSearchQuery(formatCustomerSearchLabel(selectedCustomer));
  }, [selectedCustomer]);

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

  function resetOrderComposer() {
    setEditingOrderId("");
    setFormData(buildDefaultFormState(todayDate, availableTimeSlots));
    setCartItems([]);
  }

  function buildCartItemsFromOrder(order) {
    return (order.items ?? []).map((item) => {
      const product = productById.get(item.productId);

      return {
        lineItemId: buildLineItemId(),
        productId: item.productId,
        productName: product?.name ?? "Prodotto",
        productCategory: product?.category ?? "ALTRO",
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        notes: item.notes ?? "",
        baseIngredients: cloneBaseIngredients(getBaseIngredientsFromProduct(product)),
        modifiers: (item.modifiers ?? []).map((modifier) => ({
          ingredientId: modifier.ingredientId,
          ingredientName: ingredientById.get(modifier.ingredientId)?.name ?? "Ingrediente",
          action: modifier.action,
          priceAppliedCents: modifier.priceAppliedCents,
        })),
      };
    });
  }

  function startEditingOrder(order) {
    if (!ACTIVE_ORDER_STATUSES.has(order.status)) {
      setActionError(new Error("Puoi modificare solo ordini attivi."));
      return;
    }

    const businessDate = formatDateInputFromIso(order.businessDate);
    const expectedTimeSlot = formatTimeSlotFromIso(order.expectedAt);

    setActionError(null);
    setEditingOrderId(order.id);
    setFormData({
      type: order.type,
      customerId: order.customerId ?? "",
      businessDate: businessDate || todayDate,
      expectedTimeSlot,
      notes: order.notes ?? "",
    });
    setCartItems(buildCartItemsFromOrder(order));
  }

  function cancelEditingOrder() {
    setActionError(null);
    resetOrderComposer();
  }

  async function handleSubmitOrder(event) {
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
      const payload = {
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
      };

      if (editingOrderId) {
        await updateOrder({
          orderId: editingOrderId,
          ...payload,
        });
      } else {
        await createOrder(payload);
      }

      resetOrderComposer();
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function executeStatusChange(orderId, nextStatus) {
    setActionError(null);
    setStatusUpdatingOrderId(orderId);

    try {
      await updateOrderStatus({ orderId, nextStatus });
      await reload();
    } catch (err) {
      setActionError(err);
    } finally {
      setStatusUpdatingOrderId("");
    }
  }

  async function handleStatusChange(orderId, nextStatus) {
    // Persist status transition first, then refresh list from local DB source of truth.
    if (nextStatus === "ANNULLATO") {
      setStatusChangeRequest({ orderId, nextStatus });
      return;
    }

    await executeStatusChange(orderId, nextStatus);
  }

  function closeStatusChangeModal() {
    setStatusChangeRequest(null);
  }

  async function confirmCancelStatusChange() {
    if (!statusChangeRequest) {
      return;
    }

    const request = statusChangeRequest;
    setStatusChangeRequest(null);
    await executeStatusChange(request.orderId, request.nextStatus);
  }

  function openCreateCustomerModal() {
    setActionError(null);
    setIsCustomerSearchOpen(false);
    setCustomerModalMode("create");
    setIsCustomerDeleteConfirmOpen(false);
    setCustomerForm(buildCustomerFormState());
    setIsCustomerModalOpen(true);
  }

  function openEditCustomerModal() {
    if (!selectedCustomer) {
      return;
    }

    setActionError(null);
    setIsCustomerSearchOpen(false);
    setCustomerModalMode("edit");
    setIsCustomerDeleteConfirmOpen(false);
    setCustomerForm({
      id: selectedCustomer.id,
      name: selectedCustomer.name ?? "",
      phone: selectedCustomer.phone ?? "",
      address: selectedCustomer.address ?? "",
      notes: selectedCustomer.notes ?? "",
      isTemporary: Boolean(selectedCustomer.isTemporary),
    });
    setIsCustomerModalOpen(true);
  }

  async function handleCreateCustomer(event) {
    event.preventDefault();

    if (!isValidPhoneNumber(customerForm.phone)) {
      setActionError(new Error("Numero di telefono non valido."));
      return;
    }

    setCustomerSubmitting(true);
    setActionError(null);

    try {
      const payload = {
        name: customerForm.name,
        phone: customerForm.phone,
        address: customerForm.address,
        notes: customerForm.notes,
        isTemporary: customerForm.isTemporary,
      };

      const savedCustomer = customerModalMode === "edit"
        ? await updateCustomer({ id: customerForm.id, ...payload })
        : await createCustomer(payload);

      setFormData((prev) => ({
        ...prev,
        customerId: savedCustomer.id,
      }));

      setIsCustomerDeleteConfirmOpen(false);
      setCustomerForm(buildCustomerFormState());
      setIsCustomerModalOpen(false);
      await reloadCustomers();
    } catch (err) {
      setActionError(err);
    } finally {
      setCustomerSubmitting(false);
    }
  }

  function openCustomerDeleteConfirm() {
    if (customerModalMode !== "edit" || !customerForm.id) {
      return;
    }

    setIsCustomerDeleteConfirmOpen(true);
  }

  function closeCustomerDeleteConfirm() {
    setIsCustomerDeleteConfirmOpen(false);
  }

  async function handleDeleteCustomerFromModal() {
    if (customerModalMode !== "edit" || !customerForm.id) {
      return;
    }

    setActionError(null);
    setCustomerSubmitting(true);

    try {
      await deleteCustomer({ id: customerForm.id });
      setFormData((prev) => ({
        ...prev,
        customerId: "",
      }));
      setCustomerSearchQuery("");
      setIsCustomerSearchOpen(false);
      setIsCustomerDeleteConfirmOpen(false);
      setCustomerForm(buildCustomerFormState());
      setIsCustomerModalOpen(false);
      await reloadCustomers();
    } catch (err) {
      setActionError(err);
    } finally {
      setCustomerSubmitting(false);
    }
  }

  function handleSelectCustomer(customerId) {
    setFormData((prev) => ({
      ...prev,
      customerId,
    }));
    setIsCustomerSearchOpen(false);
  }

  return (
    <div className="space-y-5">
      {/* Blocco principale: composizione nuovo ordine (catalogo + carrello) */}
      <section className="ui-surface p-4">
        <form className="grid gap-4 xl:grid-cols-[1fr_360px]" onSubmit={handleSubmitOrder}>
          {/* Colonna sinistra: filtri e catalogo prodotti */}
          <div className="space-y-4">
            {/* Riga filtri ordine: cliente, tipo, data, orario, ricerca */}
            <section className="grid gap-3 border-b border-slate-200 pb-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="relative grid gap-1 text-sm text-slate-600">
                <span>Cliente</span>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={customerSearchQuery}
                    onFocus={() => setIsCustomerSearchOpen(true)}
                    onChange={(event) => {
                      setCustomerSearchQuery(event.target.value);
                      setIsCustomerSearchOpen(true);
                    }}
                    placeholder="Cerca cliente, via o telefono..."
                    className="w-full border border-slate-200 bg-slate-50 py-2 pl-7 pr-2 text-sm"
                  />
                  {isCustomerSearchOpen && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto border border-slate-200 bg-white shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectCustomer("");
                          setCustomerSearchQuery("");
                        }}
                        className="block w-full border-b border-slate-100 px-2 py-2 text-left text-sm text-slate-700 hover:bg-teal-50"
                      >
                        Cliente al banco
                      </button>

                      {filteredCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            handleSelectCustomer(customer.id);
                            setCustomerSearchQuery(formatCustomerSearchLabel(customer));
                          }}
                          className="block w-full border-b border-slate-100 px-2 py-2 text-left hover:bg-teal-50"
                        >
                          <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                            {customersWithActiveOrders.has(customer.id) && (
                              <Clock3 size={13} className="text-amber-600" />
                            )}
                            <span>
                              {customer.name}
                              {customer.isTemporary ? " (temporaneo oggi)" : ""}
                            </span>
                          </span>
                          {customer.address && (
                            <span className="block text-xs text-slate-600">{customer.address}</span>
                          )}
                          {customer.phone && (
                            <span className="block text-xs text-slate-500">{customer.phone}</span>
                          )}
                        </button>
                      ))}

                      {filteredCustomers.length === 0 && (
                        <p className="px-2 py-2 text-sm text-slate-500">Nessun cliente trovato</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openCreateCustomerModal}
                  className="ui-btn ui-btn-success inline-flex w-fit items-center gap-1 px-2 py-1 text-xs"
                >
                  <UserPlus size={13} />
                  Nuovo cliente
                </button>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={openEditCustomerModal}
                    disabled={!selectedCustomer}
                    className="ui-btn ui-btn-accent inline-flex w-fit items-center gap-1 px-2 py-1 text-xs"
                  >
                    <Pencil size={13} />
                    Modifica
                  </button>
                </div>
              </div>

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
                          ? "border border-teal-700 bg-teal-700 px-3 py-1 text-xs font-semibold tracking-wide text-white"
                          : "border border-slate-300 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 hover:bg-teal-50"
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {editingOrder ? `Modifica ordine #${editingOrder.dailyNumber}` : "Nuovo ordine"}
                  </p>
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
                className="ui-btn ui-btn-success w-full px-3 py-2 text-sm"
              >
                {submitting ? "Salvataggio..." : editingOrderId ? "Salva modifiche ordine" : "Conferma ordine"}
              </button>

              {editingOrderId && (
                <button
                  type="button"
                  onClick={cancelEditingOrder}
                  className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Annulla modifica
                </button>
              )}
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
                className="ui-btn ui-btn-success px-3 py-2 text-sm"
              >
                {customization.mode === "add" ? "Aggiungi al carrello" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isCustomerModalOpen && (
        <Modal
          title={customerModalMode === "edit" ? "Modifica cliente" : "Nuovo cliente"}
          onClose={() => {
            setIsCustomerDeleteConfirmOpen(false);
            setIsCustomerModalOpen(false);
          }}
        >
          <form className="grid gap-3" onSubmit={handleCreateCustomer}>
            <label className="grid gap-1 text-sm text-slate-600">
              Nome
              <input
                required
                value={customerForm.name}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={customerForm.isTemporary}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    isTemporary: event.target.checked,
                  }))
                }
              />
              Cliente temporaneo (salvato solo per la giornata corrente)
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Telefono
              <input
                value={customerForm.phone}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
              {customerForm.phone.trim() && !isValidPhoneNumber(customerForm.phone) && (
                <span className="text-xs text-rose-600">Numero di telefono non valido</span>
              )}
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Indirizzo
              <input
                value={customerForm.address}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    address: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-600">
              Note
              <textarea
                value={customerForm.notes}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                className="border border-slate-200 bg-slate-50 px-2 py-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              {customerModalMode === "edit" && (
                <button
                  type="button"
                  onClick={openCustomerDeleteConfirm}
                  disabled={customerSubmitting}
                  className="ui-btn ui-btn-danger mr-auto px-3 py-2 text-sm"
                >
                  Elimina cliente
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsCustomerDeleteConfirmOpen(false);
                  setIsCustomerModalOpen(false);
                }}
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={customerSubmitting || !isValidPhoneNumber(customerForm.phone)}
                className="ui-btn ui-btn-success px-3 py-2 text-sm"
              >
                {customerSubmitting
                  ? "Salvataggio..."
                  : customerModalMode === "edit"
                    ? "Salva cliente"
                    : "Crea cliente"}
              </button>
            </div>
          </form>

          {isCustomerDeleteConfirmOpen && customerModalMode === "edit" && (
            <div className="mt-3 border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">
                Confermi eliminazione cliente {customerForm.name || "selezionato"}?
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCustomerDeleteConfirm}
                  disabled={customerSubmitting}
                  className="border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Torna indietro
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCustomerFromModal}
                  disabled={customerSubmitting}
                  className="ui-btn ui-btn-danger px-3 py-2 text-sm"
                >
                  {customerSubmitting ? "Eliminazione..." : "Conferma eliminazione"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {statusChangeRequest?.nextStatus === "ANNULLATO" && (
        <Modal
          title="Conferma annullamento ordine"
          onClose={closeStatusChangeModal}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Confermi l&apos;annullamento dell&apos;ordine {cancelStatusOrder ? `#${cancelStatusOrder.dailyNumber}` : "selezionato"}?
            </p>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeStatusChangeModal}
                className="border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Torna indietro
              </button>
              <button
                type="button"
                onClick={confirmCancelStatusChange}
                className="ui-btn ui-btn-danger px-3 py-2 text-sm"
              >
                Conferma annullamento
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
                  <p className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">Ritiro/Consegna: {formatDateTimeLabel(order.expectedAt)}</p>
                </div>

                {/* Colonna azioni transizione stato */}
                <div className="flex flex-wrap items-center gap-2">
                  {ACTIVE_ORDER_STATUSES.has(order.status) && (
                    <button
                      type="button"
                      onClick={() => startEditingOrder(order)}
                      className="ui-btn ui-btn-accent px-2 py-1 text-xs"
                      disabled={statusUpdatingOrderId === order.id}
                    >
                      Modifica
                    </button>
                  )}

                  {getPrimaryNextStatus(order.status) && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(order.id, getPrimaryNextStatus(order.status))}
                      disabled={statusUpdatingOrderId === order.id}
                      className="ui-btn ui-btn-success px-2 py-1 text-xs"
                    >
                      {statusUpdatingOrderId === order.id
                        ? "Aggiornamento..."
                        : `Avanza a ${getStatusLabel(getPrimaryNextStatus(order.status))}`}
                    </button>
                  )}

                  {(NEXT_STATUS_OPTIONS[order.status] ?? [])
                    .filter((nextStatus) => nextStatus !== getPrimaryNextStatus(order.status))
                    .map((nextStatus) => (
                    <button
                      key={nextStatus}
                      type="button"
                      onClick={() => handleStatusChange(order.id, nextStatus)}
                      disabled={statusUpdatingOrderId === order.id}
                      className={
                        nextStatus === "ANNULLATO"
                          ? "ui-btn ui-btn-danger px-2 py-1 text-xs"
                          : "ui-btn ui-btn-neutral px-2 py-1 text-xs"
                      }
                    >
                      {getStatusLabel(nextStatus)}
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
