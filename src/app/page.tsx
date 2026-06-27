import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { LiquidityChart } from "@/components/LiquidityChart";
import { RiskNormalizedCompareChart } from "@/components/RiskNormalizedCompareChart";
import { RiskScoreTrendChart } from "@/components/RiskScoreTrendChart";
import { RiskSummaryCard } from "@/components/RiskSummaryCard";
import { buildKospiRiskStateSeries } from "@/lib/kospiRiskStateModel";
import {
  fetchMarketLiquidityDaily,
  fetchMarketIndexDaily,
  fetchInvestorFlowDaily,
  fetchMarketCreditBalanceDaily,
  fetchMarketCmaDaily,
  fetchMarketBreadthDaily,
  fetchMarketCapDaily,
  fetchMarketM2Monthly,
  fetchKospiRiskStateDailySeries
} from "@/lib/fetchMarketData";

export const dynamic = "force-dynamic";

type RangeFilter = "all" | "last5";

const clampRangeFilter = (value: string | undefined): RangeFilter => (value === "last5" ? "last5" : "all");

const takeRange = <T extends { tradeDate: string }>(rows: T[], range: RangeFilter): T[] => {
  if (range === "all") return rows;
  const recentDates = Array.from(new Set(rows.map((row) => row.tradeDate)))
    .sort((a, b) => a.localeCompare(b))
    .slice(-5);
  const recentDateSet = new Set(recentDates);
  return rows.filter((row) => recentDateSet.has(row.tradeDate));
};

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
  const breadthData = await fetchMarketBreadthDaily();
  const marketCapData = await fetchMarketCapDaily();
  const m2Data = await fetchMarketM2Monthly();
  const savedKospiRiskSeries = await fetchKospiRiskStateDailySeries();

  const params = await searchParams;
  const range = clampRangeFilter(params?.range);

  const filteredLiquidity = takeRange(liquidityData, range);
  const filteredIndex = takeRange(indexData, range);
  const filteredFlow = takeRange(flowData, range);
  const filteredCredit = takeRange(creditData, range);
  const filteredCma = takeRange(cmaData, range);
  const filteredBreadth = takeRange(breadthData, range);

  const marketCapByDate = new Map<string, number>();
  marketCapData.forEach((row) => {
    const market = String(row.market).replace(/\s/g, "").toUpperCase();
    if (market !== "KOSPI" && market !== "KOSDAQ") return;
    if (typeof row.marketCapMillionKrw !== "number" || row.marketCapMillionKrw <= 0) return;
    marketCapByDate.set(row.tradeDate, (marketCapByDate.get(row.tradeDate) ?? 0) + row.marketCapMillionKrw);
  });

  const sortedM2 = [...m2Data]
    .filter((row) => typeof row.m2BillionKrw === "number" && row.m2BillionKrw > 0)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const getM2ForDate = (tradeDate: string): number | null => {
    let matched: number | null = null;
    for (const row of sortedM2) {
      if (row.tradeDate > tradeDate) break;
      matched = row.m2BillionKrw;
    }
    return matched;
  };

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

  const m2MarketCapSeries = filteredLiquidity.map((row) => {
    const m2BillionKrw = getM2ForDate(row.tradeDate);
    const totalMarketCapMillionKrw = marketCapByDate.get(row.tradeDate) ?? null;
    return {
      tradeDate: row.tradeDate,
      m2TrillionKrw: m2BillionKrw === null ? null : m2BillionKrw / 1000,
      totalMarketCapTrillionKrw: totalMarketCapMillionKrw === null ? null : totalMarketCapMillionKrw / 1_000_000
    };
  });

  const liquidityRatioSeries = filteredLiquidity.map((row) => {
    const investorDeposit = row.investorDepositMillionKrw;
    const m2BillionKrw = getM2ForDate(row.tradeDate);
    const totalMarketCapMillionKrw = marketCapByDate.get(row.tradeDate) ?? null;
    return {
      tradeDate: row.tradeDate,
      depositToM2Ratio:
        typeof investorDeposit === "number" && typeof m2BillionKrw === "number" && m2BillionKrw > 0
          ? (investorDeposit / (m2BillionKrw * 1000)) * 100
          : null,
      depositToMarketCapRatio:
        typeof investorDeposit === "number" && typeof totalMarketCapMillionKrw === "number" && totalMarketCapMillionKrw > 0
          ? (investorDeposit / totalMarketCapMillionKrw) * 100
          : null
    };
  });

  const calculatedRiskSeries = buildKospiRiskStateSeries({
    liquidityRows: liquidityData,
    creditRows: creditData,
    cmaRows: cmaData,
    indexRows: indexData,
    flowRows: flowData,
    breadthRows: breadthData,
    marketCapRows: marketCapData,
    m2Rows: m2Data
  }).map((row) => ({
    tradeDate: row.tradeDate,
    totalScore: row.totalScore,
    riskLevel: row.riskLevel,
    summary: row.summary,
    kospiReturn20d: row.kospiReturn20d,
    kospiForwardReturn5d: null,
    kospiForwardReturn20d: null,
    components: row.components
  }));
  const riskSeriesBase = savedKospiRiskSeries.length > 0 ? savedKospiRiskSeries : calculatedRiskSeries;
  const riskSeries = takeRange(riskSeriesBase, range);
  const cardRisk = riskSeriesBase.at(-1) ?? {
    totalScore: 0,
    riskLevel: "stable" as const,
    summary: "KOSPI 위험 상태 지수를 계산할 데이터가 아직 부족합니다.",
    components: {}
  };

  const description = `실제 데이터 | 유동성: ${filteredLiquidity.length}건, 신용잔고: ${filteredCredit.length}건, CMA: ${filteredCma.length}건, 지수: ${filteredIndex.length}건, 투자자 수급: ${filteredFlow.length}건, 시장폭: ${filteredBreadth.length}건`;

  return (
    <AppLayout title="한국 증시 매도 위험 대시보드" description={description}>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">차트 표시 범위</span>
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
              최근 5거래일
            </Link>
          </div>
        </div>
        <span className="text-sm font-medium text-slate-600">KOSPI 위험 상태 지수 모델</span>
      </div>

      <div className="space-y-4">
        <RiskSummaryCard totalScore={cardRisk.totalScore} riskLevel={cardRisk.riskLevel} summary={cardRisk.summary ?? null} components={cardRisk.components} />
        <RiskScoreTrendChart data={riskSeries} />
        <RiskNormalizedCompareChart riskSeries={riskSeries} indexSeries={indexSeries} />
        <LiquidityChart
          data={{
            liquidity: liquiditySeries,
            credit: creditSeries,
            cma: cmaSeries,
            index: indexSeries,
            flow: flowSeries,
            m2MarketCap: m2MarketCapSeries,
            liquidityRatio: liquidityRatioSeries
          }}
        />
      </div>
    </AppLayout>
  );
}
