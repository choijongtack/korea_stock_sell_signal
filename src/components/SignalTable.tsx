import type { SignalItem } from "@/types";

interface SignalTableProps {
  signals: SignalItem[];
}

export function SignalTable({ signals }: SignalTableProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-4 text-lg font-semibold">Sell Signals (Mock)</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-2 py-2">Ticker</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Signal</th>
              <th className="px-2 py-2">Score</th>
              <th className="px-2 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-2 py-3 font-medium">{item.ticker}</td>
                <td className="px-2 py-3">{item.name}</td>
                <td className="px-2 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      item.signal === "SELL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {item.signal}
                  </span>
                </td>
                <td className="px-2 py-3">{item.score}</td>
                <td className="px-2 py-3 text-slate-600">{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
