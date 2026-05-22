import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { LiquidityChart } from "@/components/LiquidityChart";
import { RiskSummaryCard } from "@/components/RiskSummaryCard";
import { SignalChecklist } from "@/components/SignalChecklist";
import { RunRiskButton } from "@/components/RunRiskButton";
import { calculateMarketRisk } from "@/lib/calculateMarketRisk";
import {
  fetchMarketLiquidityDaily,
  fetchMarketIndexDaily,
  fetchInvestorFlowDaily,
  fetchMarketCreditBalanceDaily,
  fetchMarketCmaDaily,
  fetchLatestMarketRiskDaily,
  fetchLatestSignalEvents
} from "@/lib/fetchMarketData";

export const dynamic = "force-dynamic";

type RangeFilter = "all" | "last5";

const clampRangeFilter = (value: string | undefined): RangeFilter => (value === "last5" ? "last5" : "all");

const takeRange = <T,>(rows: T[], range: RangeFilter): T[] => (range === "last5" ? rows.slice(-5) : rows);

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const liquidityData = await fetchMarketLiquidityDaily();
  const indexData = await fetchMarketIndexDaily();
  const flowData = await fetchInvestorFlowDaily();
  const creditData = await fetchMarketCreditBalanceDaily();
  const cmaData = await fetchMarketCmaDaily();
  const latestRiskRow = await fetchLatestMarketRiskDaily();
  const latestSignals = await fetchLatestSignalEvents();

  const params = await searchParams;
  const range = clampRangeFilter(params?.range);

  const filteredLiquidity = takeRange(liquidityData, range);
  const filteredIndex = takeRange(indexData, range);
  const filteredFlow = takeRange(flowData, range);
  const filteredCredit = takeRange(creditData, range);
  const filteredCma = takeRange(cmaData, range);

  const risk = calculateMarketRisk(filteredLiquidity, filteredIndex, filteredFlow, filteredCredit);
  const cardRisk = latestRiskRow ?? { totalScore: risk.totalScore, riskLevel: risk.riskLevel, summary: null };

  const liquiditySeries = filteredLiquidity.map((row) => ({
    tradeDate: row.tradeDate,
    investorDepositMillionKrw: row.investorDepositMillionKrw,
    derivativesDepositMillionKrw: row.derivativesDepositMillionKrw,
    rpBalanceMillionKrw: row.rpBalanceMillionKrw,
    unsettledBalanceMillionKrw: row.unsettledBalanceMillionKrw
  }));

  const creditSeries = filteredCredit.map((row) => ({
    tradeDate: row.tradeDate,
    creditLoanMillionKrw: row.creditLoanMillionKrw,
    creditShortMillionKrw: row.creditShortMillionKrw,
    collateralLoanMillionKrw: row.collateralLoanMillionKrw,
    totalCreditMillionKrw: row.totalCreditMillionKrw
  }));

  const cmaSeries = filteredCma.map((row) => ({
    tradeDate: row.tradeDate,
    totalMillionKrw: row.totalMillionKrw,
    rpTypeMillionKrw: row.rpTypeMillionKrw,
    mmfTypeMillionKrw: row.mmfTypeMillionKrw,
    jonggeumTypeMillionKrw: row.jonggeumTypeMillionKrw,
    issuingNoteTypeMillionKrw: row.issuingNoteTypeMillionKrw,
    otherTypeMillionKrw: row.otherTypeMillionKrw
  }));

  const indexByDate = new Map<string, { tradeDate: string; kospi: number | null; kosdaq: number | null; kospi200: number | null }>();
  filteredIndex.forEach((row) => {
    if (!indexByDate.has(row.tradeDate)) {
      indexByDate.set(row.tradeDate, { tradeDate: row.tradeDate, kospi: null, kosdaq: null, kospi200: null });
    }
    const item = indexByDate.get(row.tradeDate);
    if (!item) return;
    if (row.market === "KOSPI") item.kospi = row.close;
    if (row.market === "KOSDAQ") item.kosdaq = row.close;
    if (row.market === "KOSPI200") item.kospi200 = row.close;
  });
  const indexSeries = Array.from(indexByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);

  const flowByDate = new Map<
    string,
    {
      tradeDate: string;
      foreignNetBuy: number;
      institutionNetBuy: number;
      individualNetBuy: number;
      programNetBuy: number;
    }
  >();
  filteredFlow.forEach((row) => {
    if (!flowByDate.has(row.tradeDate)) {
      flowByDate.set(row.tradeDate, {
        tradeDate: row.tradeDate,
        foreignNetBuy: 0,
        institutionNetBuy: 0,
        individualNetBuy: 0,
        programNetBuy: 0
      });
    }
    const item = flowByDate.get(row.tradeDate);
    if (!item) return;
    item.foreignNetBuy += row.foreignNetBuy ?? 0;
    item.institutionNetBuy += row.institutionNetBuy ?? 0;
    item.individualNetBuy += row.individualNetBuy ?? 0;
    item.programNetBuy += row.programNetBuy ?? 0;
  });
  const flowSeries = Array.from(flowByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);

  const description = `실제 데이터 | 유동성: ${filteredLiquidity.length}건, 신용잔고: ${filteredCredit.length}건, CMA: ${filteredCma.length}건, 지수: ${filteredIndex.length}건, 투자자 수급: ${filteredFlow.length}건`;

  return (
    <AppLayout title="한국 증시 매도 위험 대시보드" description={description}>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">표시 구간</span>
          <div className="flex rounded-lg bg-slate-100 p-1">
            <Link
              href="/"
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                range === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
            >
              전체
            </Link>
            <Link
              href="/?range=last5"
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${range === "last5" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
            >
              최근 5건
            </Link>
          </div>
        </div>
        <RunRiskButton />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <RiskSummaryCard totalScore={cardRisk.totalScore} riskLevel={cardRisk.riskLevel} summary={cardRisk.summary ?? null} />
          <LiquidityChart
            data={{
              liquidity: liquiditySeries,
              credit: creditSeries,
              cma: cmaSeries,
              index: indexSeries,
              flow: flowSeries
            }}
          />
        </div>
        <SignalChecklist signals={latestSignals} />
      </div>
    </AppLayout>
  );
}
