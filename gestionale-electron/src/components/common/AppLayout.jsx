import { useState } from "react";
import {
  Bell,
  ChevronDown,
  ChartNoAxesColumn,
  ClipboardList,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Waves,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const navBaseClass =
  "flex items-center gap-3 px-3 py-2 text-[15px] font-medium no-underline transition-all duration-150";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesColumn, end: true },
  { to: "/orders", label: "Ordini", icon: ClipboardList },
  { to: "/products", label: "Prodotti", icon: Package },
];


function navClassName({ isActive }) {
  return isActive
    ? `${navBaseClass} bg-indigo-50 text-indigo-600`
    : `${navBaseClass} text-slate-700 hover:bg-slate-100`;
}

function getPageTitle(pathname) {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/orders")) return "Ordini";
  if (pathname.startsWith("/products")) return "Prodotti";
  if (pathname.startsWith("/settings")) return "Impostazioni";
  return "Gestionale";
}

export default function AppLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  const gridClass = isCollapsed
    ? "mx-auto grid h-screen w-full grid-cols-1 bg-slate-100 md:grid-cols-[84px_1fr]"
    : "mx-auto grid h-screen w-full grid-cols-1 bg-slate-100 md:grid-cols-[280px_1fr]";

  return (
    <main className="h-screen overflow-hidden bg-slate-100 text-slate-900 [font-family:'Trebuchet_MS','Segoe_UI',sans-serif]">
      <section className={gridClass}>
        <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 px-3 py-4 md:px-5">
          <header className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Waves size={22} className="text-indigo-500" />
              {!isCollapsed && <span className="text-sm font-semibold text-slate-800">Gestionale</span>}
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="p-2 text-slate-500 transition hover:bg-slate-200"
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
                  <Icon size={18} className="shrink-0 text-slate-400" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto pt-6">
            <NavLink to="/settings" className={navClassName} title={isCollapsed ? "Impostazioni" : undefined}>
              <Settings size={18} className="shrink-0 text-slate-400" />
              {!isCollapsed && <span>Settings</span>}
            </NavLink>
          </div>
        </aside>

        <section className="grid h-screen grid-rows-[72px_minmax(0,1fr)] bg-white">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-8">
            <div className="flex min-w-0 items-center gap-3 text-slate-500">
              <h2 className="text-lg font-semibold text-slate-700">{pageTitle}</h2>
            </div>

            <div className="flex items-center gap-5">
              <Bell size={18} className="text-slate-500" />
              <div className="h-7 w-px bg-slate-200" />
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center bg-amber-200 text-xs font-bold text-amber-900">
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
