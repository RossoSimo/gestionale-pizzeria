import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChartColumnBig,
  CheckCircle2,
  ChevronDown,
  ChartNoAxesColumn,
  ClipboardList,
  Info,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  Wifi,
  WifiOff,
  Waves,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { pingHealth } from "../../services/ipc/health.ipc";

const navBaseClass =
  "flex items-center gap-3 px-3 py-2 text-[15px] font-medium no-underline transition-all duration-150";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesColumn, end: true },
  { to: "/orders", label: "Ordini", icon: ClipboardList },
  { to: "/statistics", label: "Statistiche", icon: ChartColumnBig },
  { to: "/customers", label: "Clienti", icon: Users },
  { to: "/products", label: "Prodotti", icon: Package },
];


function navClassName({ isActive }) {
  return isActive
    ? `${navBaseClass} border-l-2 border-emerald-500 bg-emerald-50 text-emerald-700`
    : `${navBaseClass} text-slate-700 hover:bg-teal-50`;
}

function getPageTitle(pathname) {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/orders")) return "Ordini";
  if (pathname.startsWith("/statistics")) return "Statistiche";
  if (pathname.startsWith("/customers")) return "Clienti";
  if (pathname.startsWith("/products")) return "Prodotti";
  if (pathname.startsWith("/settings")) return "Impostazioni";
  return "Gestionale";
}

const ALERT_STYLE_BY_LEVEL = {
  warning: {
    cardClass: "border-amber-200 bg-amber-50/70",
    iconClass: "text-amber-600",
    Icon: AlertTriangle,
  },
  success: {
    cardClass: "border-emerald-200 bg-emerald-50/70",
    iconClass: "text-emerald-600",
    Icon: CheckCircle2,
  },
  info: {
    cardClass: "border-sky-200 bg-sky-50/70",
    iconClass: "text-sky-600",
    Icon: Info,
  },
};

export default function AppLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({ state: "checking" });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => new Set());
  const notificationsPanelRef = useRef(null);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTitle = getPageTitle(location.pathname);
  const isOrdersRoute = location.pathname.startsWith("/orders");
  const ordersView = searchParams.get("view") === "list" ? "list" : "compose";

  const refreshCloudStatus = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setCloudStatus({ state: "offline" });
      return;
    }

    try {
      const response = await pingHealth();
      const cloudOk =
        typeof response?.cloud?.ok === "boolean" ? response.cloud.ok : response?.ok === true;

      setCloudStatus({ state: cloudOk ? "online" : "offline" });
    } catch {
      setCloudStatus({ state: "offline" });
    }
  }, []);

  useEffect(() => {
    void refreshCloudStatus();

    const intervalId = window.setInterval(() => {
      void refreshCloudStatus();
    }, 20000);

    const handleOnline = () => {
      void refreshCloudStatus();
    };

    const handleOffline = () => {
      setCloudStatus({ state: "offline" });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCloudStatus]);

  const cloudStatusUi = useMemo(() => {
    if (cloudStatus.state === "online") {
      return {
        label: "Cloud online",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        Icon: Wifi,
      };
    }

    if (cloudStatus.state === "offline") {
      return {
        label: "Cloud offline",
        className: "border-rose-200 bg-rose-50 text-rose-700",
        Icon: WifiOff,
      };
    }

    return {
      label: "Verifica cloud...",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      Icon: Wifi,
    };
  }, [cloudStatus.state]);

  const gridClass = isCollapsed
    ? "mx-auto grid h-screen w-full grid-cols-1 bg-slate-100 md:grid-cols-[84px_1fr]"
    : "mx-auto grid h-screen w-full grid-cols-1 bg-slate-100 md:grid-cols-[280px_1fr]";

  const notificationAlerts = useMemo(() => {
    if (cloudStatus.state === "offline") {
      return [
        {
          id: "cloud-offline",
          level: "warning",
          title: "Cloud non raggiungibile",
          detail: "Lavori in locale: la sincronizzazione riprendera automaticamente.",
          timeLabel: "adesso",
        },
        {
          id: "local-mode",
          level: "info",
          title: "Modalita locale attiva",
          detail: "Gli ordini restano salvati in locale e verranno sincronizzati appena online.",
          timeLabel: "adesso",
        },
      ];
    }

    if (cloudStatus.state === "checking") {
      return [
        {
          id: "cloud-checking",
          level: "info",
          title: "Verifica connessione cloud",
          detail: "Controllo stato in corso.",
          timeLabel: "adesso",
        },
      ];
    }

    return [
      {
        id: "cloud-online",
        level: "success",
        title: "Cloud connesso",
        detail: "Sincronizzazione ordini disponibile.",
        timeLabel: "adesso",
      },
      {
        id: "orders-ready",
        level: "info",
        title: "Sistema operativo",
        detail: "Puoi continuare a inserire ordini dal gestionale.",
        timeLabel: "adesso",
      },
    ];
  }, [cloudStatus.state]);

  const visibleNotificationAlerts = useMemo(
    () => notificationAlerts.filter((alert) => !dismissedAlertIds.has(alert.id)),
    [notificationAlerts, dismissedAlertIds]
  );

  useEffect(() => {
    setDismissedAlertIds(new Set());
  }, [cloudStatus.state]);

  function dismissNotification(alertId) {
    setDismissedAlertIds((previous) => {
      const next = new Set(previous);
      next.add(alertId);
      return next;
    });
  }

  function clearAllNotifications() {
    setDismissedAlertIds(new Set(notificationAlerts.map((alert) => alert.id)));
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!notificationsPanelRef.current) {
        return;
      }

      if (!notificationsPanelRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    setIsNotificationsOpen(false);
  }, [location.pathname]);

  function handleChangeOrdersView(nextView) {
    const safeView = nextView === "list" ? "list" : "compose";
    const nextParams = new URLSearchParams(searchParams);

    nextParams.set("view", safeView);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <main className="h-screen overflow-hidden bg-slate-100 text-slate-900 [font-family:'Trebuchet_MS','Segoe_UI',sans-serif]">
      <section className={gridClass}>
        <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto border-r border-gray-300 bg-gradient-to-b from-teal-50 to-white px-3 py-4 md:px-5">
          <header className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Waves size={22} className="text-teal-600" />
              {!isCollapsed && <span className="text-sm font-semibold text-slate-800">Gestionale</span>}
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-2 text-slate-500 transition hover:bg-teal-100"
              aria-label={isCollapsed ? "Espandi sidebar" : "Collassa sidebar"}
              title={isCollapsed ? "Espandi sidebar" : "Collassa sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </header>

          <nav className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navClassName}
                  aria-label={item.label}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0 text-teal-500" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <NavLink to="/settings" className={navClassName} title={isCollapsed ? "Impostazioni" : undefined}>
              <Settings size={18} className="shrink-0 text-teal-500" />
              {!isCollapsed && <span>Impostazioni</span>}
            </NavLink>
          </div>
        </aside>

        <section className="grid h-screen grid-rows-[72px_minmax(0,1fr)] bg-slate-50">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-300 bg-white px-8">
            <div className="flex min-w-0 items-center gap-3 text-slate-500">
              <h2 className="text-lg font-semibold text-teal-700">{pageTitle}</h2>
              {isOrdersRoute && (
                <div className="ml-2 flex space-x-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => handleChangeOrdersView("compose")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${ordersView === "compose"
                        ? "border border-slate-200/60 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    Crea ordine
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeOrdersView("list")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${ordersView === "list"
                        ? "border border-slate-200/60 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    Lista ordini
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-5">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${cloudStatusUi.className}`}
                title={cloudStatusUi.label}
                aria-live="polite"
              >
                <cloudStatusUi.Icon size={14} />
                <span>{cloudStatusUi.label}</span>
              </div>

              <div ref={notificationsPanelRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-teal-600 transition-colors hover:bg-teal-50"
                  aria-label="Apri notifiche"
                  aria-expanded={isNotificationsOpen}
                  aria-haspopup="menu"
                  title="Notifiche"
                >
                  <Bell size={18} />
                  {visibleNotificationAlerts.length > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                      {visibleNotificationAlerts.length}
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div
                    className="absolute right-0 top-11 z-50 w-[340px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5"
                    role="menu"
                    aria-label="Centro notifiche"
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-sm font-semibold text-slate-800">Notifiche</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {visibleNotificationAlerts.length} alert
                        </span>
                        <button
                          type="button"
                          onClick={clearAllNotifications}
                          disabled={visibleNotificationAlerts.length === 0}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancella tutte
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {visibleNotificationAlerts.length === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                          Nessuna notifica da mostrare.
                        </div>
                      )}

                      {visibleNotificationAlerts.map((alert) => {
                        const style = ALERT_STYLE_BY_LEVEL[alert.level] ?? ALERT_STYLE_BY_LEVEL.info;
                        const AlertIcon = style.Icon;

                        return (
                          <div
                            key={alert.id}
                            className={`rounded-xl border p-2.5 transition-colors ${style.cardClass}`}
                            role="menuitem"
                          >
                            <div className="flex items-start gap-2">
                              <AlertIcon size={16} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800">{alert.title}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{alert.detail}</p>
                                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">{alert.timeLabel}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => dismissNotification(alert.id)}
                                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"
                                aria-label="Cancella notifica"
                                title="Cancella notifica"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-7 w-px bg-teal-100" />
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center bg-emerald-100 text-xs font-bold text-emerald-700">
                  CDG
                </span>
                <span className="text-sm font-semibold text-slate-800">Chicco Di Grano</span>
                <ChevronDown size={16} className="text-slate-500" />
              </div>
            </div>
          </header>

          <section className="overflow-y-auto">
            <div className="min-h-[500px] p-3">
              <Outlet />
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
