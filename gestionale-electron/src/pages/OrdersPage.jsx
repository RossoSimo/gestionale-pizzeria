import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Clock3, Pencil, Search, Trash2, UserPlus, Pizza, Car, RefreshCw, X, Printer, ChevronDown, ArrowRight, Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCustomers } from "../features/customers/hooks/useCustomers";
import { useIngredients } from "../features/ingredients/hooks/useIngredients";
import { useOrders } from "../features/orders/hooks/useOrders";
import { useProducts } from "../features/products/hooks/useProducts";
import { useAppSettings } from "../features/settings/hooks/useAppSettings";
import ToastNotifications, { useToastNotifications } from "../components/common/ToastNotifications";
import CustomerAddressMap from "../components/orders/CustomerAddressMap";
import { buildExpectedAtIso, buildTimeSlotsForDate, getTodayDateInputValue } from "../lib/order-slots";
import { centsToEuro } from "../lib/money";
import { createCustomer, deleteCustomer, updateCustomer } from "../services/ipc/customers.ipc";
import { createOrder, deleteOrder, updateOrder, updateOrderStatus } from "../services/ipc/orders.ipc";

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

const PIZZA_FAMILY_CATEGORY_KEYS = new Set(["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI"]);
const BASE_CATEGORY_ORDER = ["PIZZA", "PIZZA_STAGIONALI", "PIZZA_SPECIALI", "BEVANDA", "ALTRO"];
const ACTIVE_ORDER_STATUSES = new Set(["IN_ATTESA", "CONFERMATO", "IN_PREPARAZIONE", "PRONTO"]);
const HALF_AND_HALF_NOTE_PREFIX = "Meta e meta:";
const DAY_CLOSE_STORAGE_KEY = "orders.closedBusinessDates.v1";

function buildDefaultFormState(businessDate, availableTimeSlots) {
  return {
    type: "ASPORTO",
    customerId: "",
    businessDate,
    expectedTimeSlot: availableTimeSlots[0] ?? "",
    notes: "",
  };
}

function getOrdersViewFromSearchParams(searchParams) {
  return searchParams.get("view") === "list" ? "list" : "compose";
}

function getCategoryLabel(category, categoryLabels) {
  if (categoryLabels && typeof categoryLabels[category] === "string" && categoryLabels[category].trim()) {
    return categoryLabels[category].trim();
  }

  const labels = {
    ALL: "Tutti",
    PIZZA: "Pizze",
    PIZZA_STAGIONALI: "Pizze stagionali",
    PIZZA_SPECIALI: "Pizze speciali",
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

function getProductIngredientNames(product, ingredientById) {
  if (!Array.isArray(product?.productIngredients)) {
    return [];
  }

  return product.productIngredients
    .map((link) => link.ingredient?.name ?? ingredientById.get(link.ingredientId)?.name)
    .filter(Boolean);
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
  const hasNoHalfAndHalf = !item?.isHalfAndHalf;
  return hasNoModifiers && hasNoNotes && hasNoHalfAndHalf;
}

function isPizzaCategory(category) {
  return PIZZA_FAMILY_CATEGORY_KEYS.has(category);
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

function buildHalfAndHalfLabel(primaryName, secondaryName) {
  if (!secondaryName) {
    return "";
  }

  return `${HALF_AND_HALF_NOTE_PREFIX} ${primaryName} / ${secondaryName}`;
}

function buildLineItemNotes({ notes, isHalfAndHalf, primaryName, secondaryName }) {
  const segments = [];
  const halfAndHalfLabel = isHalfAndHalf ? buildHalfAndHalfLabel(primaryName, secondaryName) : "";

  if (halfAndHalfLabel) {
    segments.push(halfAndHalfLabel);
  }

  if (typeof notes === "string" && notes.trim()) {
    segments.push(notes.trim());
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join("\n");
}

function parseLineItemNotes(rawNotes) {
  if (typeof rawNotes !== "string" || !rawNotes.trim()) {
    return {
      notes: "",
      isHalfAndHalf: false,
      secondaryHalfName: "",
    };
  }

  const lines = rawNotes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      notes: "",
      isHalfAndHalf: false,
      secondaryHalfName: "",
    };
  }

  const firstLine = lines[0];

  if (!firstLine.toLowerCase().startsWith(HALF_AND_HALF_NOTE_PREFIX.toLowerCase())) {
    return {
      notes: rawNotes,
      isHalfAndHalf: false,
      secondaryHalfName: "",
    };
  }

  const halfPart = firstLine.slice(HALF_AND_HALF_NOTE_PREFIX.length).trim();
  const slashIndex = halfPart.indexOf("/");
  const secondaryHalfName = slashIndex >= 0 ? halfPart.slice(slashIndex + 1).trim() : "";

  return {
    notes: lines.slice(1).join("\n"),
    isHalfAndHalf: Boolean(secondaryHalfName),
    secondaryHalfName,
  };
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

function buildCustomizationState() {
  return {
    isOpen: false,
    mode: "add",
    lineItemId: null,
    productId: "",
    productName: "",
    productCategory: "",
    baseUnitPriceCents: 0,
    unitPriceCents: 0,
    quantity: 1,
    notes: "",
    baseIngredients: [],
    modifiers: [],
    isHalfAndHalf: false,
    secondaryHalfProductId: "",
    secondaryHalfProductName: "",
    secondaryHalfPriceCents: 0,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </header>
        <section className="p-6">{children}</section>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = useMemo(() => getOrdersViewFromSearchParams(searchParams), [searchParams]);
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
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState("create");
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const [isCustomerDeleteConfirmOpen, setIsCustomerDeleteConfirmOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(buildCustomerFormState());
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState("");
  const [isConfirmMenuOpen, setIsConfirmMenuOpen] = useState(false);
  const [listCustomerFilter, setListCustomerFilter] = useState("");
  const [listTypeFilter, setListTypeFilter] = useState("ALL");
  const [listDateFilter, setListDateFilter] = useState(todayDate);
  const [listSortBy, setListSortBy] = useState("RECENT");
  const [deleteOrderRequest, setDeleteOrderRequest] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [statusChangeRequest, setStatusChangeRequest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [isDayCloseModalOpen, setIsDayCloseModalOpen] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [reopeningDay, setReopeningDay] = useState(false);
  const [closedBusinessDates, setClosedBusinessDates] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const rawValue = window.localStorage.getItem(DAY_CLOSE_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : [];

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item));
    } catch {
      return [];
    }
  });
  const customerSearchContainerRef = useRef(null);
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const categoryLabels = appSettings?.categoryLabels;

  function setOrdersView(nextView) {
    const safeView = nextView === "list" ? "list" : "compose";
    const nextParams = new URLSearchParams(searchParams);

    nextParams.set("view", safeView);
    nextParams.delete("editOrderId");

    if (safeView !== "compose") {
      nextParams.delete("customerId");
    }

    setSearchParams(nextParams, { replace: true });
  }

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

  const filteredExtraIngredients = useMemo(() => {
    if (!ingredients) return [];
    
    // Filtro per escludere gli ingredienti base o se non serve
    const baseIds = new Set((customization.baseIngredients ?? []).map((b) => b.id));
    const addedIds = new Set(
      (customization.modifiers ?? [])
        .filter((m) => m.action === "AGGIUNGI")
        .map((m) => m.ingredientId)
    );

    let extras = ingredients.filter((ing) => !baseIds.has(ing.id));

    // Ricerca
    const term = normalizeSearchText(ingredientSearch);
    if (term) {
      extras = extras.filter((ing) =>
        normalizeSearchText(ing.name).includes(term)
      );
    }

    // Ordinamento: prima gli aggiunti, poi alfabetico
    return extras.sort((a, b) => {
      const aAdded = addedIds.has(a.id);
      const bAdded = addedIds.has(b.id);
      if (aAdded && !bAdded) return -1;
      if (!aAdded && bAdded) return 1;
      return a.name.localeCompare(b.name, "it-IT");
    });
  }, [ingredients, customization.baseIngredients, customization.modifiers, ingredientSearch]);

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
      const rawCategory = item.productCategory;

      if (!rawCategory) {
        return acc;
      }

      const key = isPizzaCategory(rawCategory) ? "PIZZA" : rawCategory;

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

  const slotStatsByTime = useMemo(() => {
    const stats = new Map();

    for (const slot of availableTimeSlots) {
      stats.set(slot, { orders: 0, pizzas: 0, deliveries: 0 });
    }

    for (const order of orders ?? []) {
      if (order.status === "ANNULLATO") {
        continue;
      }

      const orderDate = extractDateFilterValue(order.businessDate ?? order.expectedAt);

      if (!formData.businessDate || orderDate !== formData.businessDate) {
        continue;
      }

      const slot = formatTimeSlotFromIso(order.expectedAt);

      if (!slot || !stats.has(slot)) {
        continue;
      }

      const slotStats = stats.get(slot) ?? { orders: 0, pizzas: 0, deliveries: 0 };

      const pizzasCount = (order.items ?? []).reduce((sum, item) => {
        const product = productById.get(item.productId);

        if (!product || !isPizzaCategory(product.category)) {
          return sum;
        }

        const quantity = Number(item.quantity ?? 0);
        return Number.isFinite(quantity) && quantity > 0 ? sum + quantity : sum;
      }, 0);

      stats.set(slot, {
        orders: slotStats.orders + 1,
        pizzas: slotStats.pizzas + pizzasCount,
        deliveries: slotStats.deliveries + (order.type === "DOMICILIO" ? 1 : 0),
      });
    }

    return stats;
  }, [availableTimeSlots, formData.businessDate, orders, productById]);

  const deliveryStopsForSelectedSlot = useMemo(() => {
    if (!formData.businessDate || !formData.expectedTimeSlot) {
      return [];
    }

    return (orders ?? [])
      .filter((order) => {
        if (!order || order.status === "ANNULLATO" || order.type !== "DOMICILIO") {
          return false;
        }

        const orderDate = extractDateFilterValue(order.businessDate ?? order.expectedAt);

        if (orderDate !== formData.businessDate) {
          return false;
        }

        const orderTimeSlot = formatTimeSlotFromIso(order.expectedAt);
        return orderTimeSlot === formData.expectedTimeSlot;
      })
      .map((order) => ({
        id: order.id,
        customerId: order.customer?.id ?? order.customerId ?? "",
        customerName: order.customer?.name ?? "Cliente",
        address: order.customer?.address ?? "",
        geoLat: order.customer?.geoLat,
        geoLng: order.customer?.geoLng,
        dailyNumber: order.dailyNumber,
      }))
      .filter((stop) => Boolean(String(stop.address ?? "").trim()));
  }, [formData.businessDate, formData.expectedTimeSlot, orders]);

  const suggestedCustomerPizzas = useMemo(() => {
    if (!selectedCustomer?.id) {
      return [];
    }

    const quantityByProductId = new Map();

    for (const order of orders ?? []) {
      const orderCustomerId = order.customerId ?? order.customer?.id;

      if (orderCustomerId !== selectedCustomer.id) {
        continue;
      }

      if (order.status === "ANNULLATO") {
        continue;
      }

      for (const item of order.items ?? []) {
        const product = productById.get(item.productId);

        if (!product || !isPizzaCategory(product.category)) {
          continue;
        }

        const quantity = Number(item.quantity ?? 0);

        if (!Number.isFinite(quantity) || quantity <= 0) {
          continue;
        }

        quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + quantity);
      }
    }

    return Array.from(quantityByProductId.entries())
      .map(([productId, totalOrderedQuantity]) => {
        const product = productById.get(productId);

        if (!product) {
          return null;
        }

        return {
          ...product,
          totalOrderedQuantity,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.totalOrderedQuantity !== a.totalOrderedQuantity) {
          return b.totalOrderedQuantity - a.totalOrderedQuantity;
        }

        return a.name.localeCompare(b.name, "it-IT");
      })
      .slice(0, 6);
  }, [orders, productById, selectedCustomer]);

  const pizzaProducts = useMemo(() => {
    return products.filter((product) => isPizzaCategory(product.category));
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

  const filteredOrdersForList = useMemo(() => {
    const normalizedCustomerQuery = normalizeSearchText(listCustomerFilter);

    const filtered = orders.filter((order) => {
      if (listTypeFilter !== "ALL" && order.type !== listTypeFilter) {
        return false;
      }

      if (listDateFilter) {
        const orderDate = extractDateFilterValue(order.businessDate ?? order.expectedAt);

        if (orderDate !== listDateFilter) {
          return false;
        }
      }

      if (!normalizedCustomerQuery) {
        return true;
      }

      const customerName = normalizeSearchText(order.customer?.name ?? "Banco");
      return customerName.includes(normalizedCustomerQuery);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (listSortBy === "CUSTOMER") {
        const nameA = normalizeSearchText(a.customer?.name ?? "Banco");
        const nameB = normalizeSearchText(b.customer?.name ?? "Banco");
        const byName = nameA.localeCompare(nameB, "it-IT");

        if (byName !== 0) {
          return byName;
        }
      }

      const timestampA = new Date(a.expectedAt ?? a.businessDate ?? 0).getTime() || 0;
      const timestampB = new Date(b.expectedAt ?? b.businessDate ?? 0).getTime() || 0;

      if (listSortBy === "OLDEST") {
        return timestampA - timestampB;
      }

      // Default and CUSTOMER fallback: most recent first.
      return timestampB - timestampA;
    });

    return sorted;
  }, [listCustomerFilter, listDateFilter, listSortBy, listTypeFilter, orders]);

  const closureDateKey = listDateFilter || todayDate;

  const closureOrders = useMemo(() => {
    return (orders ?? []).filter((order) => {
      const orderDate = extractDateFilterValue(order.businessDate ?? order.expectedAt);
      return orderDate === closureDateKey;
    });
  }, [closureDateKey, orders]);

  const closureStatusBreakdown = useMemo(() => {
    const counts = new Map();

    for (const order of closureOrders) {
      const status = order.status ?? "IN_ATTESA";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [closureOrders]);

  const closureActiveOrdersCount = useMemo(() => {
    return closureOrders.filter((order) => ACTIVE_ORDER_STATUSES.has(order.status)).length;
  }, [closureOrders]);

  const closureRevenueCents = useMemo(() => {
    return closureOrders
      .filter((order) => order.status !== "ANNULLATO")
      .reduce((sum, order) => sum + Number(order.totalAmountCents ?? 0), 0);
  }, [closureOrders]);

  const closedDateSet = useMemo(() => new Set(closedBusinessDates), [closedBusinessDates]);
  const isClosureDateAlreadyClosed = closedDateSet.has(closureDateKey);
  const canConfirmDayClosure =
    closureOrders.length > 0 && !isClosureDateAlreadyClosed;
  const canConfirmDayReopen = isClosureDateAlreadyClosed;

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerSearchQuery("");
      return;
    }

    setCustomerSearchQuery(formatCustomerSearchLabel(selectedCustomer));
  }, [selectedCustomer]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(DAY_CLOSE_STORAGE_KEY, JSON.stringify(closedBusinessDates));
    } catch {
      // Ignore localStorage failures and keep runtime behavior functional.
    }
  }, [closedBusinessDates]);

  useEffect(() => {
    const requestedCustomerId = searchParams.get("customerId");

    if (!requestedCustomerId) {
      return;
    }

    setActionError(null);
    setIsCustomerSearchOpen(false);
    setFormData((prev) => {
      if (prev.customerId === requestedCustomerId) {
        return prev;
      }

      return {
        ...prev,
        customerId: requestedCustomerId,
      };
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", "compose");
    nextParams.delete("customerId");
    nextParams.delete("editOrderId");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const requestedEditOrderId = searchParams.get("editOrderId");

    if (!requestedEditOrderId || loading) {
      return;
    }

    const requestedOrder = orders.find((order) => order.id === requestedEditOrderId) ?? null;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("editOrderId");

    if (!requestedOrder) {
      setSearchParams(nextParams, { replace: true });
      pushToast("Ordine richiesto non trovato.", "error");
      return;
    }

    if (!ACTIVE_ORDER_STATUSES.has(requestedOrder.status)) {
      nextParams.set("view", "list");
      setSearchParams(nextParams, { replace: true });
      pushToast("L'ordine selezionato non e modificabile.", "error");
      return;
    }

    setSearchParams(nextParams, { replace: true });
    startEditingOrder(requestedOrder);
  }, [loading, orders, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isCustomerSearchOpen) {
      return;
    }

    function handlePointerOutside(event) {
      if (!customerSearchContainerRef.current) {
        return;
      }

      if (!customerSearchContainerRef.current.contains(event.target)) {
        setIsCustomerSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerOutside);
    document.addEventListener("touchstart", handlePointerOutside);

    return () => {
      document.removeEventListener("mousedown", handlePointerOutside);
      document.removeEventListener("touchstart", handlePointerOutside);
    };
  }, [isCustomerSearchOpen]);

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
          baseUnitPriceCents: product.priceCents,
          unitPriceCents: product.priceCents,
          notes: "",
          baseIngredients,
          modifiers: [],
          isHalfAndHalf: false,
          secondaryHalfProductId: "",
          secondaryHalfProductName: "",
          secondaryHalfPriceCents: 0,
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
      baseUnitPriceCents: product.priceCents,
      unitPriceCents: product.priceCents,
      quantity: 1,
      notes: "",
      baseIngredients: cloneBaseIngredients(getBaseIngredientsFromProduct(product)),
      modifiers: [],
      isHalfAndHalf: false,
      secondaryHalfProductId: "",
      secondaryHalfProductName: "",
      secondaryHalfPriceCents: 0,
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
      baseUnitPriceCents: item.baseUnitPriceCents ?? item.unitPriceCents,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      notes: item.notes ?? "",
      baseIngredients: cloneBaseIngredients(item.baseIngredients),
      modifiers: cloneModifiers(item.modifiers),
      isHalfAndHalf: Boolean(item.isHalfAndHalf),
      secondaryHalfProductId: item.secondaryHalfProductId ?? "",
      secondaryHalfProductName: item.secondaryHalfProductName ?? "",
      secondaryHalfPriceCents: item.secondaryHalfPriceCents ?? 0,
    });
  }

  function closeCustomizationModal() {
    setCustomization(buildCustomizationState());
    setIngredientSearch("");
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

  function setCustomizationHalfAndHalfEnabled(enabled) {
    setCustomization((prev) => {
      if (!enabled) {
        return {
          ...prev,
          isHalfAndHalf: false,
          secondaryHalfProductId: "",
          secondaryHalfProductName: "",
          secondaryHalfPriceCents: 0,
          unitPriceCents: prev.baseUnitPriceCents,
        };
      }

      const fallbackProduct = pizzaProducts.find((product) => product.id !== prev.productId) ?? null;
      const selectedProduct =
        pizzaProducts.find((product) => product.id === prev.secondaryHalfProductId) ?? fallbackProduct;

      if (!selectedProduct) {
        return {
          ...prev,
          isHalfAndHalf: true,
        };
      }

      return {
        ...prev,
        isHalfAndHalf: true,
        secondaryHalfProductId: selectedProduct.id,
        secondaryHalfProductName: selectedProduct.name,
        secondaryHalfPriceCents: selectedProduct.priceCents,
        // Regola commerciale comune: per la meta e meta si applica il prezzo della pizza piu cara.
        unitPriceCents: Math.max(prev.baseUnitPriceCents, selectedProduct.priceCents),
      };
    });
  }

  function setCustomizationHalfAndHalfProduct(productId) {
    const secondaryProduct = pizzaProducts.find((product) => product.id === productId);

    if (!secondaryProduct) {
      return;
    }

    setCustomization((prev) => ({
      ...prev,
      secondaryHalfProductId: secondaryProduct.id,
      secondaryHalfProductName: secondaryProduct.name,
      secondaryHalfPriceCents: secondaryProduct.priceCents,
      unitPriceCents: Math.max(prev.baseUnitPriceCents, secondaryProduct.priceCents),
    }));
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

    if (canCustomizeIngredients && customization.isHalfAndHalf && !customization.secondaryHalfProductName) {
      pushToast("Seleziona la seconda meta della pizza.", "error");
      return;
    }

    const nextItem = {
      lineItemId: customization.mode === "edit" ? customization.lineItemId : buildLineItemId(),
      productId: customization.productId,
      productName: customization.productName,
      productCategory: customization.productCategory,
      baseUnitPriceCents: customization.baseUnitPriceCents,
      quantity: customization.quantity,
      unitPriceCents: customization.unitPriceCents,
      notes: customization.notes,
      baseIngredients: cloneBaseIngredients(customization.baseIngredients),
      modifiers: cloneModifiers(customization.modifiers),
      isHalfAndHalf: customization.isHalfAndHalf,
      secondaryHalfProductId: customization.secondaryHalfProductId,
      secondaryHalfProductName: customization.secondaryHalfProductName,
      secondaryHalfPriceCents: customization.secondaryHalfPriceCents,
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
      const parsedNotes = parseLineItemNotes(item.notes);
      const secondaryPizzaProduct = pizzaProducts.find(
        (candidate) =>
          candidate.id !== item.productId &&
          normalizeSearchText(candidate.name) === normalizeSearchText(parsedNotes.secondaryHalfName)
      );

      return {
        lineItemId: buildLineItemId(),
        productId: item.productId,
        productName: product?.name ?? "Prodotto",
        productCategory: product?.category ?? "ALTRO",
        quantity: item.quantity,
        baseUnitPriceCents: product?.priceCents ?? item.unitPriceCents,
        unitPriceCents: item.unitPriceCents,
        notes: parsedNotes.notes,
        baseIngredients: cloneBaseIngredients(getBaseIngredientsFromProduct(product)),
        modifiers: (item.modifiers ?? []).map((modifier) => ({
          ingredientId: modifier.ingredientId,
          ingredientName: ingredientById.get(modifier.ingredientId)?.name ?? "Ingrediente",
          action: modifier.action,
          priceAppliedCents: modifier.priceAppliedCents,
        })),
        isHalfAndHalf: parsedNotes.isHalfAndHalf,
        secondaryHalfProductId: secondaryPizzaProduct?.id ?? "",
        secondaryHalfProductName: secondaryPizzaProduct?.name ?? parsedNotes.secondaryHalfName,
        secondaryHalfPriceCents: secondaryPizzaProduct?.priceCents ?? 0,
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
    setOrdersView("compose");
  }

  function cancelEditingOrder() {
    setActionError(null);
    resetOrderComposer();
  }

  async function submitOrder({ shouldPrint = false } = {}) {
    if (submitting) {
      return;
    }

    const wasEditing = Boolean(editingOrderId);

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
      let savedOrder = null;

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
          notes: buildLineItemNotes({
            notes: item.notes,
            isHalfAndHalf: item.isHalfAndHalf,
            primaryName: item.productName,
            secondaryName: item.secondaryHalfProductName,
          }),
          modifiers: (item.modifiers ?? []).map((modifier) => ({
            ingredientId: modifier.ingredientId,
            action: modifier.action,
            priceAppliedCents: modifier.priceAppliedCents,
          })),
        })),
      };

      if (editingOrderId) {
        savedOrder = await updateOrder({
          orderId: editingOrderId,
          ...payload,
        });
      } else {
        savedOrder = await createOrder({
          ...payload,
          status: "CONFERMATO",
        });
      }

      if (!wasEditing && shouldPrint) {
        handlePrintOrderPlaceholder(savedOrder);
      }

      resetOrderComposer();
      await reload();
      pushToast(wasEditing ? "Ordine aggiornato con successo." : "Ordine confermato con successo.");
    } catch (err) {
      setActionError(err);
      pushToast(err?.message || "Operazione non riuscita.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitOrder(event) {
    event.preventDefault();
    setIsConfirmMenuOpen(false);
    void submitOrder({ shouldPrint: !editingOrderId });
  }

  function handleConfirmOrderAction(shouldPrint) {
    setIsConfirmMenuOpen(false);
    void submitOrder({ shouldPrint });
  }

  async function executeStatusChange(orderId, nextStatus) {
    setActionError(null);
    setStatusUpdatingOrderId(orderId);

    try {
      await updateOrderStatus({ orderId, nextStatus });
      await reload();
      pushToast(`Stato ordine aggiornato: ${getStatusLabel(nextStatus)}.`);
    } catch (err) {
      setActionError(err);
      pushToast(err?.message || "Aggiornamento stato non riuscito.", "error");
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

  function openDayCloseModal() {
    setIsDayCloseModalOpen(true);
  }

  function closeDayCloseModal() {
    if (closingDay || reopeningDay) {
      return;
    }

    setIsDayCloseModalOpen(false);
  }

  async function confirmDayClose() {
    if (closingDay) {
      return;
    }

    if (isClosureDateAlreadyClosed) {
      pushToast({ type: "info", title: "Giornata gia chiusa" });
      setIsDayCloseModalOpen(false);
      return;
    }

    if (closureOrders.length === 0) {
      pushToast({
        type: "info",
        title: "Nessun ordine",
        description: "Nessun ordine da chiudere per la data selezionata.",
      });
      return;
    }

    setClosingDay(true);

    try {
      setClosedBusinessDates((prev) => (prev.includes(closureDateKey) ? prev : [...prev, closureDateKey]));
      setIsDayCloseModalOpen(false);
      pushToast({
        type: "success",
        title: "Giornata chiusa",
        description: `${formatDateLabel(closureDateKey)} - Incasso ${formatEuroLabel(closureRevenueCents)}`,
      });
    } finally {
      setClosingDay(false);
    }
  }

  async function confirmDayReopen() {
    if (reopeningDay) {
      return;
    }

    if (!isClosureDateAlreadyClosed) {
      pushToast({ type: "info", title: "Giornata gia aperta" });
      setIsDayCloseModalOpen(false);
      return;
    }

    setReopeningDay(true);

    try {
      setClosedBusinessDates((prev) => prev.filter((dateKey) => dateKey !== closureDateKey));
      setIsDayCloseModalOpen(false);
      pushToast({
        type: "success",
        title: "Giornata riaperta",
        description: `${formatDateLabel(closureDateKey)} e nuovamente operativa.`,
      });
    } finally {
      setReopeningDay(false);
    }
  }

  function openDeleteOrderConfirm(orderId) {
    const selectedOrder = orders.find((order) => order.id === orderId) ?? null;

    if (!selectedOrder) {
      return;
    }

    setDeleteOrderRequest(selectedOrder);
  }

  function closeDeleteOrderConfirm() {
    setDeleteOrderRequest(null);
  }

  function handlePrintOrderPlaceholder(order) {
    const orderNumberLabel = order?.dailyNumber ? `#${order.dailyNumber}` : "selezionato";

    pushToast({
      type: "info",
      title: `Stampa ordine ${orderNumberLabel}`,
      description: "Funzionalita in sviluppo. La stampa verra implementata in un prossimo aggiornamento.",
    });
  }

  async function confirmDeleteOrder() {
    if (!deleteOrderRequest?.id) {
      return;
    }

    setActionError(null);
    setDeletingOrderId(deleteOrderRequest.id);

    try {
      await deleteOrder({ orderId: deleteOrderRequest.id });

      if (editingOrderId === deleteOrderRequest.id) {
        resetOrderComposer();
      }

      setDeleteOrderRequest(null);
      await reload();
      pushToast("Ordine eliminato con successo.");
    } catch (err) {
      setActionError(err);
      pushToast(err?.message || "Eliminazione ordine non riuscita.", "error");
    } finally {
      setDeletingOrderId("");
    }
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
      pushToast(customerModalMode === "edit" ? "Cliente aggiornato con successo." : "Cliente creato con successo.");
    } catch (err) {
      setActionError(err);
      pushToast(err?.message || "Salvataggio cliente non riuscito.", "error");
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
      pushToast("Cliente eliminato con successo.");
    } catch (err) {
      setActionError(err);
      pushToast(err?.message || "Eliminazione cliente non riuscita.", "error");
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
    <div className="space-y-3">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />

      {/* Blocco principale: composizione nuovo ordine (catalogo + carrello) */}
      {activeView === "compose" && (
        <section className="ui-surface min-h-[620px] p-4 sm:p-5">
          <form className="grid gap-5 xl:grid-cols-[1fr_360px]" onSubmit={handleSubmitOrder}>
            {/* Colonna sinistra: filtri e catalogo prodotti */}
            <div className="space-y-4">
              {/* Riga filtri ordine: cliente, tipo, data, orario, ricerca */}
              <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-3">
                <div ref={customerSearchContainerRef} className="relative grid gap-1.5 text-sm text-slate-600">
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
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    {isCustomerSearchOpen && (
                      <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectCustomer("");
                            setCustomerSearchQuery("");
                          }}
                          className="block w-full border-b border-slate-100 px-2 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50"
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
                            className="block w-full border-b border-slate-100 px-2 py-2 text-left hover:bg-emerald-50"
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
                    className="ui-btn ui-btn-success inline-flex w-fit items-center gap-1 px-2 py-1 text-xs shadow-sm"
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Tipo ordine</span>
                    <div className="flex h-10 w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, type: "ASPORTO" }))}
                        className={`flex-1 px-3 py-1 text-xs transition-colors ${formData.type === "ASPORTO"
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-slate-500 hover:bg-slate-50"
                          }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Pizza size={14} />
                          Asporto
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, type: "DOMICILIO" }))}
                        className={`flex-1 px-3 py-1 text-xs font-semibold transition-colors ${formData.type === "DOMICILIO"
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-slate-500 hover:bg-slate-50"
                          }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Car size={14} />
                          Domicilio
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-slate-600">Data ordine</span>
                    <div className="relative flex h-10 w-full items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById("hidden-date-input");
                          if (input) input.showPicker();
                        }}
                        className="flex h-full items-center justify-center border-r border-slate-200 bg-slate-100 px-3 text-slate-600 hover:bg-slate-200 focus:outline-none"
                      >
                        <Calendar size={16} />
                      </button>
                      <span className="flex-1 px-3 text-sm font-medium text-slate-700">
                        {new Date(formData.businessDate).toLocaleDateString("it-IT", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                      <input
                        id="hidden-date-input"
                        type="date"
                        value={formData.businessDate}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, businessDate: event.target.value }))
                        }
                        className="absolute inset-0 h-full w-full opacity-0"
                        style={{ pointerEvents: "none" }}
                      />
                    </div>
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  Orario
                  <select
                    value={formData.expectedTimeSlot}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, expectedTimeSlot: event.target.value }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {availableTimeSlots.length === 0 && <option value="">Nessuno slot disponibile</option>}
                    {availableTimeSlots.map((slot) => {
                      const stats = slotStatsByTime.get(slot) ?? { orders: 0, pizzas: 0, deliveries: 0 };
                      const orderLabel = stats.orders === 1 ? "ordine" : "ordini";
                      const pizzaLabel = stats.pizzas === 1 ? "pizza" : "pizze";
                      const deliveryLabel = stats.deliveries === 1 ? "consegna" : "consegne";
                      const statsParts = [];

                      if (stats.orders !== 0) {
                        statsParts.push(`${stats.orders} ${orderLabel}`);
                        statsParts.push(`${stats.pizzas} ${pizzaLabel}`);

                        if (stats.deliveries !== 0) {
                          statsParts.push(`${stats.deliveries} ${deliveryLabel}`);
                        }
                      }

                      return (
                        <option key={slot} value={slot}>
                          {statsParts.length > 0 ? `${slot} (${statsParts.join(", ")})` : slot}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </section>

              {formData.type === "DOMICILIO" && (
                <CustomerAddressMap
                  customerName={selectedCustomer?.name}
                  customerId={selectedCustomer?.id}
                  address={selectedCustomer?.address}
                  customerGeoLat={selectedCustomer?.geoLat}
                  customerGeoLng={selectedCustomer?.geoLng}
                  deliveryStops={deliveryStopsForSelectedSlot}
                  selectedTimeSlot={formData.expectedTimeSlot}
                />
              )}

              {/* Sezione catalogo: categorie e griglia prodotti */}
              <section className="space-y-3">
                {/* Filtri categoria prodotto */}
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {["ALL", ...categoryOrder].map((category) => {
                      const isActive = selectedCategory === category;

                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setSelectedCategory(category)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${isActive
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                          {getCategoryLabel(category, categoryLabels)}
                        </button>
                      );
                    })}

                    <div className="relative ml-auto w-full min-w-[240px] grow sm:max-w-sm">
                      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Cerca per nome..."
                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>

                {selectedCustomer && suggestedCustomerPizzas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-1.5 shadow-sm">
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-800">I più ordinati:</span>
                    <ul className="flex flex-wrap gap-1.5">
                      {suggestedCustomerPizzas.map((product) => (
                        <li key={`suggestion-${product.id}`}>
                          <button
                            type="button"
                            onClick={() => addProductToCart(product)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              openCustomizationForProduct(product);
                            }}
                            className="max-w-[160px] truncate rounded border border-emerald-200/60 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-900 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                            title={product.name}
                          >
                            {product.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {productsLoading && <p className="text-sm text-slate-500">Caricamento prodotti...</p>}

                {!productsLoading && visibleProducts.length === 0 && (
                  <p className="text-sm text-slate-500">Nessun prodotto trovato per i filtri selezionati.</p>
                )}

                {!productsLoading && visibleProducts.length > 0 && selectedCategory !== "ALL" && (
                  /* Griglia card prodotto */
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleProducts.map((product) => {
                      const ingredientNames = getProductIngredientNames(product, ingredientById);

                      return (
                        <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => addProductToCart(product)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            openCustomizationForProduct(product);
                          }}
                          className="group grid w-full gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50"
                        >
                          <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                          {ingredientNames.length > 0 && (
                            <span className="text-xs leading-4 text-slate-500">
                              {ingredientNames.join(", ")}
                            </span>
                          )}
                          <span className="text-sm font-bold text-emerald-700">{formatEuroLabel(product.priceCents)}</span>
                        </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!productsLoading && visibleProducts.length > 0 && selectedCategory === "ALL" && (
                  <div className="space-y-4">
                    {groupedVisibleProducts.map((group) => (
                      <section key={group.category} className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {getCategoryLabel(group.category, categoryLabels)}
                        </h4>

                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {group.items.map((product) => {
                            const ingredientNames = getProductIngredientNames(product, ingredientById);

                            return (
                              <li key={product.id}>
                              <button
                                type="button"
                                onClick={() => addProductToCart(product)}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  openCustomizationForProduct(product);
                                }}
                                className="group grid w-full gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50"
                              >
                                <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                                {ingredientNames.length > 0 && (
                                  <span className="text-xs leading-4 text-slate-500">
                                    Ingredienti: {ingredientNames.join(", ")}
                                  </span>
                                )}
                                <span className="text-sm font-bold text-emerald-700">{formatEuroLabel(product.priceCents)}</span>
                              </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}

                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Suggerimento: tasto destro su un prodotto per aprire la personalizzazione prima di aggiungerlo.
                </p>
              </section>
            </div>

            {/* Colonna destra: riepilogo carrello e conferma ordine */}
            <aside className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 xl:sticky xl:top-0 xl:flex xl:h-[calc(100vh-5.5rem)] xl:flex-col">
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
                    {selectedCustomer?.phone && (
                      <p className="text-xs text-slate-500">Tel: {selectedCustomer.phone}</p>
                    )}
                    {selectedCustomer?.address && (
                      <p className="text-xs text-slate-500">Indirizzo: {selectedCustomer.address}</p>
                    )}
                    {selectedCustomer?.notes && (
                      <p className="mt-1 rounded-md bg-white/80 px-2 py-1 text-[11px] text-slate-500">
                        Note cliente: {selectedCustomer.notes}
                      </p>
                    )}
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
              <ul className="space-y-2 overflow-auto pr-1 xl:min-h-0 xl:flex-1">
                {cartItems.map((item) => (
                  <li key={item.lineItemId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.lineItemId)}
                        className="inline-flex items-center justify-center rounded-md p-1 text-rose-700 transition-colors hover:bg-rose-50"
                        aria-label="Rimuovi riga dal carrello"
                        title="Rimuovi"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {item.isHalfAndHalf && item.secondaryHalfProductName && (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        {buildHalfAndHalfLabel(item.productName, item.secondaryHalfProductName)}
                      </p>
                    )}

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
                        {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                          <p className="text-[11px] text-slate-500">
                            {computeModifiersPerUnit(item.modifiers) > 0 ? `+${formatEuroLabel(computeModifiersPerUnit(item.modifiers))}` : `${formatEuroLabel(computeModifiersPerUnit(item.modifiers))}`}
                          </p>
                        )}
                        <p className="text-sm font-bold text-slate-900">
                          {formatEuroLabel(
                            item.quantity * (item.unitPriceCents + computeModifiersPerUnit(item.modifiers))
                          )}
                        </p>

                        <button
                          type="button"
                          onClick={() => openCustomizationForCartItem(item)}
                          className="inline-flex items-center justify-center rounded-md p-1 text-slate-700 transition-colors hover:bg-slate-100"
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>

                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">Totale</span>
                  <span className="text-xl font-bold text-slate-900">{formatEuroLabel(totalAmountCents)}</span>
                </div>

                {editingOrderId ? (
                  <button
                    type="submit"
                    disabled={submitting || cartItems.length === 0}
                    className="ui-btn ui-btn-success w-full px-3 py-2 text-sm"
                  >
                    {submitting ? "Salvataggio..." : "Salva modifiche ordine"}
                  </button>
                ) : (
                  <div className="relative">
                    <div className="flex w-full overflow-hidden rounded-lg shadow-sm">
                      <button
                        type="button"
                        disabled={submitting || cartItems.length === 0}
                        onClick={() => handleConfirmOrderAction(true)}
                        className="ui-btn ui-btn-success flex-1 rounded-none border-0 px-3 py-2 text-sm"
                      >
                        {submitting ? "Salvataggio..." : "Conferma ordine e stampa"}
                      </button>

                      <button
                        type="button"
                        disabled={submitting || cartItems.length === 0}
                        onClick={() => setIsConfirmMenuOpen((prev) => !prev)}
                        className="ui-btn ui-btn-success rounded-none border-0 border-l border-emerald-700/30 px-3 py-2"
                        aria-label="Mostra opzioni conferma ordine"
                        title="Opzioni conferma"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    {isConfirmMenuOpen && !(submitting || cartItems.length === 0) && (
                      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5">
                        <button
                          type="button"
                          onClick={() => handleConfirmOrderAction(false)}
                          className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          Conferma senza stampare
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {editingOrderId && (
                  <button
                    type="button"
                    onClick={cancelEditingOrder}
                    className="ui-btn ui-btn-neutral mt-2 w-full px-3 py-2 text-sm"
                  >
                    Annulla modifica
                  </button>
                )}
              </div>
            </aside>
          </form>
        </section>
      )}

      {/* Messaggi errore pagina */}
      {error && <p className="text-sm text-rose-600">{error.message}</p>}
      {actionError && <p className="text-sm text-rose-600">{actionError.message}</p>}

      {/* Modal personalizzazione prodotto/riga carrello */}
      {customization.isOpen && (
        <Modal
          title={customization.mode === "add" ? "Personalizza prodotto" : "Modifica personalizzazione"}
          onClose={closeCustomizationModal}
        >
          <div className="space-y-4">
            {/* Header modal: nome prodotto e prezzo base */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-sm font-semibold text-slate-900">{customization.productName}</p>
              <p className="text-xs text-slate-500">
                Prezzo: {formatEuroLabel(customization.unitPriceCents)}
                {customization.isHalfAndHalf ? " (meta e meta: pizza piu cara)" : ""}
              </p>
            </div>

            {canCustomizeIngredients && (
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={customization.isHalfAndHalf}
                    onChange={(event) => setCustomizationHalfAndHalfEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Pizza meta e meta
                </label>

                {customization.isHalfAndHalf && (
                  <div className="grid gap-1.5 text-sm text-slate-600">
                    <span>Seconda meta</span>
                    <select
                      value={customization.secondaryHalfProductId}
                      onChange={(event) => setCustomizationHalfAndHalfProduct(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Seleziona pizza</option>
                      {pizzaProducts
                        .filter((product) => product.id !== customization.productId)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({formatEuroLabel(product.priceCents)})
                          </option>
                        ))}
                    </select>
                    {!customization.secondaryHalfProductId && customization.secondaryHalfProductName && (
                      <p className="text-xs text-amber-700">
                        Metà salvata: {customization.secondaryHalfProductName} (non disponibile in catalogo).
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <label className="grid gap-1.5 text-sm text-slate-600">
              Quantità
              <input
                type="number"
                min={1}
                value={customization.quantity}
                onChange={(event) => setCustomizationQuantity(Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-slate-600">
              Note
              <textarea
                value={customization.notes}
                onChange={(event) =>
                  setCustomization((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={2}
                placeholder="Es. ben cotta, consegna al citofono..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            {canCustomizeIngredients &&
              Array.isArray(customization.baseIngredients) &&
              customization.baseIngredients.length > 0 && (
                /* Sezione ingredienti base (rimozioni) */
                <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingredienti base (clicca per rimuovere)</p>
                  <div className="flex flex-wrap gap-2">
                    {customization.baseIngredients.map((ingredient) => {
                      const isRemoved = (customization.modifiers ?? []).some(
                        (modifier) => modifier.action === "RIMUOVI" && modifier.ingredientId === ingredient.id
                      );

                      if (isRemoved) {
                        return (
                          <button
                            key={ingredient.id}
                            type="button"
                            onClick={() => setCustomizationIngredientRemoved(ingredient, false)}
                            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400 line-through transition-colors hover:border-slate-300 hover:text-slate-600"
                          >
                            {ingredient.name}
                          </button>
                        );
                      }

                      return (
                        <button
                          key={ingredient.id}
                          type="button"
                          onClick={() => setCustomizationIngredientRemoved(ingredient, true)}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                        >
                          {ingredient.name}
                          <X size={14} className="opacity-60" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

            {canCustomizeIngredients && (
              /* Sezione extra ingredienti (aggiunte) */
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extra ingredienti</p>
                  <div className="relative max-w-[150px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Cerca..."
                      value={ingredientSearch}
                      onChange={(e) => setIngredientSearch(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    {ingredientSearch && (
                      <button
                        type="button"
                        onClick={() => setIngredientSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex max-h-48 flex-wrap content-start gap-2 overflow-y-auto pr-1">
                  {filteredExtraIngredients.map((ingredient) => {
                    const isAdded = (customization.modifiers ?? []).some(
                      (modifier) => modifier.action === "AGGIUNGI" && modifier.ingredientId === ingredient.id
                    );

                    if (isAdded) {
                      return (
                        <button
                          key={ingredient.id}
                          type="button"
                          onClick={() => removeCustomizationExtraIngredient(ingredient.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
                        >
                          {ingredient.name} {ingredient.extraPriceCents > 0 && `(+${formatEuroLabel(ingredient.extraPriceCents)})`}
                          <X size={14} className="opacity-80" />
                        </button>
                      );
                    }

                    return (
                      <button
                        key={ingredient.id}
                        type="button"
                        onClick={() => addCustomizationExtraIngredient(ingredient.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        + {ingredient.name} {ingredient.extraPriceCents > 0 && `(+${formatEuroLabel(ingredient.extraPriceCents)})`}
                      </button>
                    );
                  })}

                  {filteredExtraIngredients.length === 0 && (
                    <p className="text-xs italic text-slate-500">Nessun ingrediente extra trovato.</p>
                  )}
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
            <div className="mt-1 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={closeCustomizationModal}
                className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
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
          <form className="grid gap-4" onSubmit={handleCreateCustomer}>
            <label className="grid gap-1.5 text-sm text-slate-600">
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
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-colors"
              />
              Cliente temporaneo (salvato solo per la giornata corrente)
            </label>

            <label className="grid gap-1.5 text-sm text-slate-600">
              Telefono
              <input
                value={customerForm.phone}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    phone: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {customerForm.phone.trim() && !isValidPhoneNumber(customerForm.phone) && (
                <span className="text-xs text-rose-600">Numero di telefono non valido</span>
              )}
            </label>

            <label className="grid gap-1.5 text-sm text-slate-600">
              Indirizzo
              <input
                value={customerForm.address}
                onChange={(event) =>
                  setCustomerForm((prev) => ({
                    ...prev,
                    address: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>

            <label className="grid gap-1.5 text-sm text-slate-600">
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
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
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
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">
                Confermi eliminazione cliente {customerForm.name || "selezionato"}?
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCustomerDeleteConfirm}
                  disabled={customerSubmitting}
                  className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
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
                className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
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

      {deleteOrderRequest && (
        <Modal
          title="Conferma eliminazione ordine"
          onClose={closeDeleteOrderConfirm}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Confermi l&apos;eliminazione dell&apos;ordine #{deleteOrderRequest.dailyNumber}?
            </p>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeDeleteOrderConfirm}
                disabled={Boolean(deletingOrderId)}
                className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
              >
                Torna indietro
              </button>
              <button
                type="button"
                onClick={confirmDeleteOrder}
                disabled={Boolean(deletingOrderId)}
                className="ui-btn ui-btn-danger px-3 py-2 text-sm"
              >
                {deletingOrderId ? "Eliminazione..." : "Elimina ordine"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {isDayCloseModalOpen && (
        <Modal
          title={isClosureDateAlreadyClosed ? "Riapertura giornata" : "Chiusura giornata"}
          onClose={closeDayCloseModal}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Data selezionata: <span className="font-semibold">{formatDateLabel(closureDateKey)}</span>
            </p>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Ordini</p>
                <p className="text-lg font-bold text-slate-900">{closureOrders.length}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Ordini attivi</p>
                <p className={`text-lg font-bold ${closureActiveOrdersCount > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {closureActiveOrdersCount}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Incasso (senza annullati)</p>
                <p className="text-lg font-bold text-slate-900">{formatEuroLabel(closureRevenueCents)}</p>
              </div>
            </div>

            {closureStatusBreakdown.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stati ordini</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {closureStatusBreakdown.map((item) => (
                    <span
                      key={item.status}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                    >
                      {getStatusLabel(item.status)}: {item.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isClosureDateAlreadyClosed && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Questa giornata risulta gia chiusa.
              </p>
            )}

            {!isClosureDateAlreadyClosed && closureOrders.length === 0 && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Nessun ordine presente per la data selezionata.
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeDayCloseModal}
                disabled={closingDay || reopeningDay}
                className="ui-btn ui-btn-neutral px-3 py-2 text-sm"
              >
                Annulla
              </button>
              {isClosureDateAlreadyClosed ? (
                <button
                  type="button"
                  onClick={confirmDayReopen}
                  disabled={!canConfirmDayReopen || reopeningDay}
                  className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reopeningDay ? "Riapertura..." : "Conferma riapertura"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirmDayClose}
                  disabled={!canConfirmDayClosure || closingDay}
                  className="ui-btn ui-btn-success px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {closingDay ? "Chiusura..." : "Conferma chiusura"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Sezione inferiore: storico/lista ordini */}
      {activeView === "list" && (
        <section className="ui-surface space-y-4 p-4 sm:p-5">
          {/* Header lista ordini con azione reload */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lista ordini</h3>

            <div className="flex items-center gap-2">
              {isClosureDateAlreadyClosed && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  Giornata chiusa
                </span>
              )}

              {isClosureDateAlreadyClosed ? (
                <button
                  type="button"
                  onClick={openDayCloseModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                >
                  Riapri giornata
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openDayCloseModal}
                  className="ui-btn ui-btn-success inline-flex items-center gap-2 px-3 py-2 text-sm"
                >
                  Chiusura giornata
                </button>
              )}

              <button
                type="button"
                onClick={() => reload()}
                className="ui-btn ui-btn-neutral inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600"
              >
                <RefreshCw size={14} />
                Ricarica
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={listCustomerFilter}
                onChange={(event) => setListCustomerFilter(event.target.value)}
                placeholder="Filtra per nome cliente..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                { key: "ALL", label: "Tutti" },
                { key: "ASPORTO", label: "Asporto" },
                { key: "DOMICILIO", label: "Domicilio" },
              ].map((typeOption) => (
                <button
                  key={typeOption.key}
                  type="button"
                  onClick={() => setListTypeFilter(typeOption.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${listTypeFilter === typeOption.key
                      ? "border border-slate-200/60 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                      : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  {typeOption.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="date"
                value={listDateFilter}
                onChange={(event) => setListDateFilter(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-xs font-semibold text-slate-700 shadow-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                aria-label="Filtra per data ordine"
                title="Filtra per data ordine"
              />

              {listDateFilter && (
                <button
                  type="button"
                  onClick={() => setListDateFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                  aria-label="Azzera filtro data"
                  title="Azzera filtro data"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={listSortBy}
              onChange={(event) => setListSortBy(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              aria-label="Ordina lista ordini"
              title="Ordina lista ordini"
            >
              <option value="RECENT">Più recenti</option>
              <option value="OLDEST">Più vecchi</option>
              <option value="CUSTOMER">Cliente A-Z</option>
            </select>
          </div>

          {loading && <p className="text-sm text-slate-500">Caricamento ordini...</p>}

          {!loading && orders.length === 0 && <p className="text-sm text-slate-500">Nessun ordine disponibile.</p>}
          {!loading && orders.length > 0 && filteredOrdersForList.length === 0 && (
            <p className="text-sm text-slate-500">Nessun ordine trovato con i filtri selezionati.</p>
          )}

          {/* Elenco ordini esistenti */}
          <ul className="space-y-2">
            {filteredOrdersForList.map((order) => (
              <li key={order.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:shadow-slate-200/50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {/* Colonna info ordine */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {order.customer?.name ?? "Banco"}
                      </p>
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {order.type === "DOMICILIO" ? <Car size={11} /> : <Pizza size={11} />}
                        {order.type}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">#{order.dailyNumber}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock3 size={11} />
                        {formatDateTimeLabel(order.expectedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Colonna azioni transizione stato */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ACTIVE_ORDER_STATUSES.has(order.status) && (
                      <button
                        type="button"
                        onClick={() => startEditingOrder(order)}
                        className="ui-btn ui-btn-accent inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                        disabled={statusUpdatingOrderId === order.id || deletingOrderId === order.id}
                        aria-label="Modifica ordine"
                        title="Modifica ordine"
                      >
                        <Pencil size={11} />
                        Modifica
                      </button>
                    )}

                    {getPrimaryNextStatus(order.status) && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(order.id, getPrimaryNextStatus(order.status))}
                        disabled={statusUpdatingOrderId === order.id || deletingOrderId === order.id}
                        className="ui-btn ui-btn-success inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                        aria-label={`Avanza a ${getStatusLabel(getPrimaryNextStatus(order.status))}`}
                        title={`Avanza a ${getStatusLabel(getPrimaryNextStatus(order.status))}`}
                      >
                        <ArrowRight size={11} />
                        {statusUpdatingOrderId === order.id
                          ? "Aggiornamento..."
                          : getStatusLabel(getPrimaryNextStatus(order.status))}
                      </button>
                    )}

                    {(NEXT_STATUS_OPTIONS[order.status] ?? [])
                      .filter((nextStatus) => nextStatus !== getPrimaryNextStatus(order.status))
                      .map((nextStatus) => (
                        <button
                          key={nextStatus}
                          type="button"
                          onClick={() => handleStatusChange(order.id, nextStatus)}
                          disabled={statusUpdatingOrderId === order.id || deletingOrderId === order.id}
                          className={
                            nextStatus === "ANNULLATO"
                              ? "ui-btn ui-btn-danger inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                              : "ui-btn ui-btn-neutral inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                          }
                          aria-label={getStatusLabel(nextStatus)}
                          title={getStatusLabel(nextStatus)}
                        >
                          {nextStatus === "ANNULLATO" ? <X size={11} /> : <Check size={11} />}
                          {getStatusLabel(nextStatus)}
                        </button>
                      ))}

                    <button
                      type="button"
                      onClick={() => handlePrintOrderPlaceholder(order)}
                      disabled={statusUpdatingOrderId === order.id || deletingOrderId === order.id}
                      className="ui-btn ui-btn-neutral inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                      aria-label="Stampa ordine"
                      title="Stampa ordine"
                    >
                      <Printer size={11} />
                      Stampa
                    </button>

                    <button
                      type="button"
                      onClick={() => openDeleteOrderConfirm(order.id)}
                      disabled={statusUpdatingOrderId === order.id || deletingOrderId === order.id}
                      className="ui-btn ui-btn-danger inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                      aria-label="Elimina ordine"
                      title="Elimina ordine"
                    >
                      <Trash2 size={11} />
                      {deletingOrderId === order.id ? "Eliminazione..." : "Elimina"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
