import { CalendarClock, Tags } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const settingsSections = [
  {
    to: "orari",
    title: "Orari e slot",
    description: "Apertura settimanale e intervalli di consegna",
    Icon: CalendarClock,
  },
  {
    to: "categorie",
    title: "Categorie prodotti",
    description: "Gestione etichette e categorie personalizzate",
    Icon: Tags,
  },
];

function sectionNavClass({ isActive }) {
  return isActive
    ? "group flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-800"
    : "group flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30";
}

export default function SettingsPage() {
  return (
    <div className="space-y-4">

      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="ui-surface rounded-xl p-3">
          <nav className="space-y-2" aria-label="Sotto-pagine impostazioni">
            {settingsSections.map((section) => {
              const Icon = section.Icon;

              return (
                <NavLink key={section.to} to={section.to} className={sectionNavClass}>
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{section.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{section.description}</span>
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </section>
    </div>
  );
}
