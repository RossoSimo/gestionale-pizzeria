import { useMemo, useState } from "react";
import {
  ArrowRight,
  Edit2,
  History,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import ToastNotifications, { useToastNotifications } from "../components/common/ToastNotifications";
import { useCustomers } from "../features/customers/hooks/useCustomers";
import { useOrders } from "../features/orders/hooks/useOrders";
import { centsToEuro } from "../lib/money";
import { createCustomer, deleteCustomer, updateCustomer } from "../services/ipc/customers.ipc";

function buildEmptyCustomerForm() {
  return {
    id: "",
    name: "",
    phone: "",
    address: "",
    notes: "",
    isTemporary: false,
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeSearchText(value) {
  return normalizeText(value).toLowerCase();
}

function isValidPhoneNumber(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return true;
  }

  if (!/^\+?[0-9\s()\-]{6,20}$/.test(normalized)) {
    return false;
  }

  const digitsOnly = normalized.replace(/\D/g, "");
  return digitsOnly.length >= 6 && digitsOnly.length <= 15;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEuroLabel(cents) {
  return `${centsToEuro(cents).replace(".", ",")} EUR`;
}

function getOrderStatusLabel(status) {
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

function getOrderTypeLabel(type) {
  if (type === "DOMICILIO") {
    return "Domicilio";
  }

  if (type === "ASPORTO") {
    return "Asporto";
  }

  return type ?? "-";
}

function CustomerModal({
  formState,
  isEditing,
  submitting,
  actionError,
  onClose,
  onSubmit,
  onFieldChange,
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">
            {isEditing ? "Modifica cliente" : "Nuovo cliente"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Chiudi"
          >
            <X size={20} />
          </button>
        </header>

        <form className="space-y-4 p-6" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-700 md:col-span-2">
              Nome cliente *
              <input
                value={formState.name}
                onChange={(event) => onFieldChange("name", event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                disabled={submitting}
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Telefono
              <input
                value={formState.phone}
                onChange={(event) => onFieldChange("phone", event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                disabled={submitting}
                placeholder="Es: +39 333 1234567"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-700">
              Indirizzo
              <input
                value={formState.address}
                onChange={(event) => onFieldChange("address", event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                disabled={submitting}
                placeholder="Via e numero civico"
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-700 md:col-span-2">
              Note
              <textarea
                value={formState.notes}
                onChange={(event) => onFieldChange("notes", event.target.value)}
                className="min-h-[90px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                disabled={submitting}
                placeholder="Indicazioni consegna, citofono, ecc."
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={formState.isTemporary}
                onChange={(event) => onFieldChange("isTemporary", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                disabled={submitting}
              />
              Cliente temporaneo (valido solo per oggi)
            </label>
          </div>

          {actionError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {actionError.message || "Operazione non riuscita"}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              disabled={submitting}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Crea cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const { customers, loading: customersLoading, error, reload } = useCustomers();
  const { orders, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useOrders();
  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState(buildEmptyCustomerForm());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [historyCustomer, setHistoryCustomer] = useState(null);

  const isEditing = Boolean(formState.id);

  const filteredCustomers = useMemo(() => {
    const search = normalizeSearchText(searchText);

    if (!search) {
      return customers;
    }

    return customers.filter((customer) => {
      return [customer.name, customer.phone, customer.address, customer.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [customers, searchText]);

  const temporaryCount = useMemo(() => {
    return filteredCustomers.filter((customer) => customer.isTemporary).length;
  }, [filteredCustomers]);

  const historyOrders = useMemo(() => {
    if (!historyCustomer?.id) {
      return [];
    }

    return (orders ?? [])
      .filter((order) => {
        const orderCustomerId = order.customerId ?? order.customer?.id;
        return orderCustomerId === historyCustomer.id;
      })
      .sort((a, b) => {
        const timestampA = new Date(a.expectedAt ?? a.businessDate ?? a.createdAt ?? 0).getTime() || 0;
        const timestampB = new Date(b.expectedAt ?? b.businessDate ?? b.createdAt ?? 0).getTime() || 0;
        return timestampB - timestampA;
      });
  }, [historyCustomer, orders]);

  function handleFieldChange(field, value) {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function openCreateModal() {
    setActionError(null);
    setFormState(buildEmptyCustomerForm());
    setIsModalOpen(true);
  }

  function openEditModal(customer) {
    setActionError(null);
    setFormState({
      id: customer.id,
      name: customer.name ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      isTemporary: Boolean(customer.isTemporary),
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (submitting) {
      return;
    }

    setIsModalOpen(false);
    setActionError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      const payload = {
        name: normalizeText(formState.name),
        phone: normalizeText(formState.phone),
        address: normalizeText(formState.address),
        notes: normalizeText(formState.notes),
        isTemporary: Boolean(formState.isTemporary),
      };

      if (!payload.name) {
        throw new Error("Inserisci il nome del cliente");
      }

      if (!isValidPhoneNumber(payload.phone)) {
        throw new Error("Numero di telefono non valido");
      }

      if (isEditing) {
        await updateCustomer({
          id: formState.id,
          ...payload,
        });
        pushToast({ type: "success", title: "Cliente aggiornato" });
      } else {
        await createCustomer(payload);
        pushToast({ type: "success", title: "Cliente creato" });
      }

      setIsModalOpen(false);
      setFormState(buildEmptyCustomerForm());
      await reload();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(customer) {
    const confirmed = window.confirm(`Eliminare il cliente "${customer.name}"?`);

    if (!confirmed) {
      return;
    }

    setActionError(null);

    try {
      await deleteCustomer({ id: customer.id });
      pushToast({ type: "success", title: "Cliente eliminato" });
      await reload();
    } catch (err) {
      setActionError(err);
      pushToast({ type: "error", title: "Errore", description: err.message });
    }
  }

  async function handleRefresh() {
    try {
      await Promise.all([
        reload(),
        reloadOrders({ page: 1, pageSize: 100 }),
      ]);
      pushToast({ type: "success", title: "Lista clienti aggiornata" });
    } catch (err) {
      pushToast({ type: "error", title: "Errore", description: err.message });
    }
  }

  async function openHistoryModal(customer) {
    setHistoryCustomer(customer);

    try {
      await reloadOrders({ page: 1, pageSize: 100 });
    } catch (err) {
      pushToast({ type: "error", title: "Errore", description: err.message });
    }
  }

  function closeHistoryModal() {
    setHistoryCustomer(null);
  }

  function startOrderForCustomer(customer) {
    if (!customer?.id) {
      return;
    }

    navigate(`/orders?view=compose&customerId=${encodeURIComponent(customer.id)}`);
  }

  function openOrderInOrdersPage(orderId) {
    if (!orderId) {
      return;
    }

    closeHistoryModal();
    navigate(`/orders?view=list&editOrderId=${encodeURIComponent(orderId)}`);
  }

  return (
    <div className="space-y-4">
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />

      <section className="ui-surface rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">Anagrafica clienti</h3>
            <p className="text-sm text-slate-600">
              Gestisci clienti abituali e temporanei per velocizzare la composizione ordini.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              disabled={customersLoading}
            >
              <RefreshCw size={14} className={customersLoading ? "animate-spin" : ""} />
              Aggiorna
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <Plus size={14} />
              Nuovo cliente
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Clienti visibili</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{filteredCustomers.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Clienti temporanei</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{temporaryCount}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Con coordinate mappa</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {
                filteredCustomers.filter(
                  (customer) => Number.isFinite(Number(customer.geoLat)) && Number.isFinite(Number(customer.geoLng))
                ).length
              }
            </p>
          </article>
        </div>
      </section>

      <section className="ui-surface rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Cerca per nome, telefono, indirizzo o note"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error.message || "Impossibile caricare i clienti"}
          </p>
        )}

        {actionError && !isModalOpen && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {actionError.message || "Operazione non riuscita"}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {customersLoading && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Caricamento clienti in corso...
            </p>
          )}

          {!customersLoading && filteredCustomers.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Nessun cliente trovato con i filtri attuali.
            </p>
          )}

          {!customersLoading &&
            filteredCustomers.map((customer) => {
              const hasCoordinates =
                Number.isFinite(Number(customer.geoLat)) && Number.isFinite(Number(customer.geoLng));

              return (
                <article
                  key={customer.id}
                  className="group rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => startOrderForCustomer(customer)}
                      className="min-w-0 flex-1 space-y-2 rounded-lg text-left outline-none transition-colors hover:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                      title="Inizia nuovo ordine con questo cliente"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <UserRound size={14} />
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                        {customer.isTemporary && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Temporaneo
                          </span>
                        )}
                      </div>

                      <div className="grid gap-1 text-xs text-slate-600">
                        <p className="inline-flex items-center gap-2">
                          <Phone size={13} className="text-slate-400" />
                          <span>{customer.phone || "Telefono non indicato"}</span>
                        </p>
                        <p className="inline-flex items-center gap-2">
                          <MapPin size={13} className="text-slate-400" />
                          <span>{customer.address || "Indirizzo non indicato"}</span>
                        </p>
                        {customer.notes && <p className="rounded-md bg-slate-50 px-2 py-1 text-slate-500">{customer.notes}</p>}
                      </div>
                      <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        Nuovo ordine
                        <ArrowRight size={12} />
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          hasCoordinates
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                        title={
                          hasCoordinates
                            ? `Coordinate: ${Number(customer.geoLat).toFixed(5)}, ${Number(customer.geoLng).toFixed(5)}`
                            : "Coordinate non disponibili"
                        }
                      >
                        <Users size={11} />
                        {hasCoordinates ? "Geo pronto" : "No geo"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openHistoryModal(customer)}
                        className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        title="Storico ordini"
                      >
                        <History size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(customer)}
                        className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        title="Modifica cliente"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(customer)}
                        className="rounded-md border border-rose-200 bg-white p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                        title="Elimina cliente"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-400">
                    Ultimo aggiornamento: {formatDateTime(customer.updatedAt)}
                  </p>
                </article>
              );
            })}
        </div>
      </section>

      {isModalOpen && (
        <CustomerModal
          formState={formState}
          isEditing={isEditing}
          submitting={submitting}
          actionError={actionError}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onFieldChange={handleFieldChange}
        />
      )}

      {historyCustomer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Storico ordini cliente</h3>
                <p className="text-xs text-slate-500">{historyCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="Chiudi"
              >
                <X size={20} />
              </button>
            </header>

            <section className="space-y-3 p-6">
              <p className="text-xs text-slate-500">
                Clicca una riga per aprire l&apos;ordine nella pagina Ordini.
              </p>

              {ordersError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {ordersError.message || "Impossibile caricare lo storico ordini."}
                </p>
              )}

              {ordersLoading && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Caricamento storico in corso...
                </p>
              )}

              {!ordersLoading && historyOrders.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Nessun ordine trovato per questo cliente.
                </p>
              )}

              {!ordersLoading && historyOrders.length > 0 && (
                <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
                  {historyOrders.map((order) => (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => openOrderInOrdersPage(order.id)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900">
                              Ordine #{order.dailyNumber ?? "-"}
                            </p>
                            <p className="text-xs text-slate-500">{formatDateTime(order.expectedAt ?? order.businessDate)}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                              {getOrderTypeLabel(order.type)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                              {getOrderStatusLabel(order.status)}
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                              {formatEuroLabel(Number(order.totalAmountCents ?? 0))}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
