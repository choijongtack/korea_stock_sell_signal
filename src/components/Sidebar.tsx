import type { MenuItem } from "@/types";

interface SidebarProps {
  items: MenuItem[];
  activeItem: MenuItem;
}

export function Sidebar({ items, activeItem }: SidebarProps) {
  return (
    <aside className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">MENU</h2>
      <nav className="space-y-2">
        {items.map((item) => {
          const isActive = item === activeItem;
          return (
            <button
              key={item}
              type="button"
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {item}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
