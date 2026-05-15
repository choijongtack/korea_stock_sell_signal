import type { InvestorFlowDaily, MarketCreditBalanceDaily, MarketIndexDaily, MarketLiquidityDaily } from "@/types/market";

const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

export const mockLiquidityData: MarketLiquidityDaily[] = Array.from({ length: 25 }, (_, i) => {
  const start = new Date("2026-03-30T00:00:00.000Z");
  const tradeDate = formatDate(new Date(start.getTime() + i * DAY_MS));
  return {
    tradeDate,
    investorDepositMillionKrw: 65000000 - i * 520000,
    derivativesDepositMillionKrw: 13800000 - i * 40000,
    rpBalanceMillionKrw: 7200000 - i * 18000,
    unsettledBalanceMillionKrw: 1900000 - i * 9000,
    createdAt: `${tradeDate}T15:30:00.000Z`
  };
});

export const mockCreditData: MarketCreditBalanceDaily[] = Array.from({ length: 25 }, (_, i) => {
  const start = new Date("2026-03-30T00:00:00.000Z");
  const tradeDate = formatDate(new Date(start.getTime() + i * DAY_MS));
  const creditLoan = i < 15 ? 21500000 - i * 120000 : 19700000 - (i - 15) * 280000;
  return {
    tradeDate,
    creditLoanMillionKrw: creditLoan,
    creditShortMillionKrw: 2400000 - i * 12000,
    collateralLoanMillionKrw: 3100000 - i * 10000,
    totalCreditMillionKrw: 28900000 - i * 130000,
    createdAt: `${tradeDate}T15:30:00.000Z`
  };
});

export const mockIndexData: MarketIndexDaily[] = Array.from({ length: 25 }, (_, i) => {
  const start = new Date("2026-03-30T00:00:00.000Z");
  const tradeDate = formatDate(new Date(start.getTime() + i * DAY_MS));
  const close = 2750 - i * 8;
  return {
    tradeDate,
    market: "KOSPI",
    close,
    change: i === 0 ? 0 : -8,
    changeRate: i === 0 ? 0 : -0.29,
    open: close + 5,
    high: close + 9,
    low: close - 12,
    volume: 450000 + i * 1300,
    tradingValueMillionKrw: 9200000 + i * 25000,
    createdAt: `${tradeDate}T15:30:00.000Z`
  };
});

export const mockFlowData: InvestorFlowDaily[] = Array.from({ length: 25 }, (_, i) => {
  const start = new Date("2026-03-30T00:00:00.000Z");
  const tradeDate = formatDate(new Date(start.getTime() + i * DAY_MS));
  const foreignNetBuy = i < 20 ? 30000 - i * 5000 : -120000 - (i - 20) * 30000;
  return {
    tradeDate,
    foreignNetBuy,
    institutionNetBuy: -foreignNetBuy / 2,
    individualNetBuy: -foreignNetBuy / 3,
    programNetBuy: -foreignNetBuy / 4,
    createdAt: `${tradeDate}T15:30:00.000Z`
  };
});
