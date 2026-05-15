import Link from "next/link";

interface AppLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function AppLayout({ title, description, children }: AppLayoutProps) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-4 bg-slate-50 px-3 py-4 sm:px-4 md:p-8">
      <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <Link className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5" href="/">
              Dashboard
            </Link>
            <Link className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5" href="/upload">
              Upload
            </Link>
            <Link className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5" href="/signals">
              Signals
            </Link>
            <Link className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5" href="/holdings">
              Holdings
            </Link>
            <Link className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5" href="/backtest">
              Backtest
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}
