import type { StockRiskResult } from "@/types/portfolioRisk";

export interface EvaluatedHolding {
  id: string;
  stock: StockRiskResult;
  dropFromPeakPct: number;
  belowMa20: boolean;
  belowMa60: boolean;
  usingCredit: boolean;
}

interface HoldingsTableProps {
  items: EvaluatedHolding[];
  onDelete: (id: string) => void;
}

export function HoldingsTable({ items, onDelete }: HoldingsTableProps) {
  if (items.length === 0) return <p className="mt-3 text-sm text-slate-500">추가된 종목이 없습니다.</p>;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-2 py-2">종목</th>
            <th className="px-2 py-2">수익률</th>
            <th className="px-2 py-2">고점대비하락</th>
            <th className="px-2 py-2">이동평균</th>
            <th className="px-2 py-2">신용</th>
            <th className="px-2 py-2">위험점수</th>
            <th className="px-2 py-2">결과</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="px-2 py-3 font-medium">
                {item.stock.stock_name} ({item.stock.stock_code})
              </td>
              <td className="px-2 py-3">{item.stock.profit_rate.toFixed(2)}%</td>
              <td className="px-2 py-3">{item.dropFromPeakPct.toFixed(2)}%</td>
              <td className="px-2 py-3">
                {item.belowMa20 ? "20일선 " : ""}
                {item.belowMa60 ? "60일선" : ""}
              </td>
              <td className="px-2 py-3">{item.usingCredit ? "사용" : "미사용"}</td>
              <td className="px-2 py-3">{item.stock.risk_score}</td>
              <td className="px-2 py-3">
                <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">{item.stock.recommendation}</span>
              </td>
              <td className="px-2 py-3">
                <button type="button" onClick={() => onDelete(item.id)} className="text-xs text-red-600">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
