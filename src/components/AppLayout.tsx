import Link from "next/link";
import { Activity, BarChart3, Database, FlaskConical, LineChart, PieChart } from "lucide-react";

interface AppLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/upload", label: "Upload", icon: Database },
  { href: "/signals", label: "Signals", icon: LineChart },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/backtest", label: "Backtest", icon: FlaskConical }
];

export function AppLayout({ title, description, children }: AppLayoutProps) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 md:p-8">
        <header className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-white to-emerald-50 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Korea Market Monitor
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
                {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-sm sm:px-4">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                href={href}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
