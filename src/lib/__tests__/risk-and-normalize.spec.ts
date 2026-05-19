import { describe, expect, it } from "vitest";
import { calculateMarketRisk, calculateMarketRiskEngine } from "@/lib/calculateMarketRisk";
import { normalizeFreesisLiquidity } from "@/lib/normalizeFreesis";
import { normalizeKrxIndex } from "@/lib/normalizeKrxIndex";
import { normalizeInvestorFlow } from "@/lib/normalizeInvestorFlow";
import type { InvestorFlowDaily, MarketCreditBalanceDaily, MarketIndexDaily, MarketLiquidityDaily } from "@/types/market";

const date = (day: number): string => `2026-01-${String(day).padStart(2, "0")}`;

const makeLiquidity = (day: number, deposit: number): MarketLiquidityDaily => ({
  tradeDate: date(day),
  investorDepositMillionKrw: deposit,
  derivativesDepositMillionKrw: 100,
  rpBalanceMillionKrw: 100,
  unsettledBalanceMillionKrw: 100,
  createdAt: `${date(day)}T00:00:00.000Z`
});

const makeCredit = (day: number, creditLoan: number): MarketCreditBalanceDaily => ({
  tradeDate: date(day),
  creditLoanMillionKrw: creditLoan,
  creditShortMillionKrw: 100,
  collateralLoanMillionKrw: 100,
  totalCreditMillionKrw: creditLoan + 200,
  createdAt: `${date(day)}T00:00:00.000Z`
});

const makeKospi = (day: number, close: number): MarketIndexDaily => ({
  tradeDate: date(day),
  market: "KOSPI",
  close,
  change: 0,
  changeRate: 0,
  open: close,
  high: close,
  low: close,
  volume: 1000,
  tradingValueMillionKrw: 1000,
  createdAt: `${date(day)}T00:00:00.000Z`
});

const makeFlow = (day: number, foreign: number): InvestorFlowDaily => ({
  tradeDate: date(day),
  foreignNetBuy: foreign,
  institutionNetBuy: 0,
  individualNetBuy: 0,
  programNetBuy: 0,
  createdAt: `${date(day)}T00:00:00.000Z`
});

describe("deterministic outputs", () => {
  it("normalizeFreesisLiquidity returns identical output for identical input", () => {
    const rows = [{ 기준일: "2026-01-02", 투자자예탁금: "1,000", 신용거래융자: "500", 합계: "1,500" }];
    const a = normalizeFreesisLiquidity(rows);
    const b = normalizeFreesisLiquidity(rows);
    expect(a).toStrictEqual(b);
  });

  it("normalizeKrxIndex returns identical output for identical input", () => {
    const rows = [{ 기준일: "2026/01/02", 시장명: "코스피", 종가: "2,500", 등락률: "-0.33%" }];
    const a = normalizeKrxIndex(rows);
    const b = normalizeKrxIndex(rows);
    expect(a).toStrictEqual(b);
  });

  it("normalizeInvestorFlow supports investor-type snapshot CSV format", () => {
    const rows = [
      { "Investor type": "Subtotal-Institutions", "Trading value_Net Buying": "-10292314.0" },
      { "Investor type": "Individuals", "Trading value_Net Buying": "76663307.0" },
      { "Investor type": "Foreigners", "Trading value_Net Buying": "-75835083.0" }
    ];
    const result = normalizeInvestorFlow(rows, "1970-01-01T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].institutionNetBuy).toBe(-10292314);
    expect(result[0].individualNetBuy).toBe(76663307);
    expect(result[0].foreignNetBuy).toBe(-75835083);
    expect(result[0].programNetBuy).toBeNull();
    expect(result[0].tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normalizeInvestorFlow supports date summary format", () => {
    const rows = [
      {
        Date: "2026/05/14",
        "Subtotal-Institutions": "252178.0",
        "Other corporations": "86609.0",
        Individuals: "1941090.0",
        "Total of foreign": "-2279877.0",
        Total: "0.0"
      },
      {
        Date: "2026/05/13",
        "Subtotal-Institutions": "1691095.0",
        "Other corporations": "156068.0",
        Individuals: "2477107.0",
        "Total of foreign": "-4324270.0",
        Total: "0.0"
      }
    ];
    const result = normalizeInvestorFlow(rows, "1970-01-01T00:00:00.000Z");
    expect(result).toHaveLength(2);
    expect(result[0].tradeDate).toBe("2026-05-13");
    expect(result[0].institutionNetBuy).toBe(1691095);
    expect(result[0].individualNetBuy).toBe(2477107);
    expect(result[0].foreignNetBuy).toBe(-4324270);
    expect(result[1].tradeDate).toBe("2026-05-14");
  });

  it("normalizeInvestorFlow groups by date and sums institution parts when subtotal is absent", () => {
    const rows = [
      { Date: "2026/05/14", "Investor type": "Financial investment", "Trading value_Net Buying": "-100" },
      { Date: "2026/05/14", "Investor type": "Insurance", "Trading value_Net Buying": "-20" },
      { Date: "2026/05/14", "Investor type": "Individuals", "Trading value_Net Buying": "50" },
      { Date: "2026/05/14", "Investor type": "Foreigners", "Trading value_Net Buying": "70" },
      { Date: "2026/05/13", "Investor type": "Financial investment", "Trading value_Net Buying": "10" },
      { Date: "2026/05/13", "Investor type": "Individuals", "Trading value_Net Buying": "-5" },
      { Date: "2026/05/13", "Investor type": "Foreigners", "Trading value_Net Buying": "-6" }
    ];

    const result = normalizeInvestorFlow(rows, "1970-01-01T00:00:00.000Z");

    expect(result).toHaveLength(2);
    expect(result[0].tradeDate).toBe("2026-05-13");
    expect(result[0].institutionNetBuy).toBe(10);
    expect(result[1].tradeDate).toBe("2026-05-14");
    expect(result[1].institutionNetBuy).toBe(-120);
  });
});

describe("leverage score date alignment", () => {
  it("does not add leverageScore when liquidity/index dates are not aligned", () => {
    const liquidity = Array.from({ length: 10 }, (_, i) => makeLiquidity(i + 1, 10000 - i * 100));
    const credit = Array.from({ length: 10 }, (_, i) => makeCredit(i + 1, 1000 - i * 10));
    const index = Array.from({ length: 10 }, (_, i) => makeKospi(i + 12, 3000 - i * 5));
    const flow = Array.from({ length: 10 }, (_, i) => makeFlow(i + 1, 100));

    const result = calculateMarketRisk(liquidity, index, flow, credit);
    expect(result.leverageScore).toBe(0);
  });

  it("adds leverageScore when aligned 10-day credit drop and KOSPI decline are both satisfied", () => {
    const liquidity = Array.from({ length: 10 }, (_, i) => makeLiquidity(i + 1, 10000 - i * 100));
    const credit = Array.from({ length: 10 }, (_, i) => makeCredit(i + 1, 1000 - i * 10));
    const index = Array.from({ length: 10 }, (_, i) => makeKospi(i + 1, 3000 - i * 5));
    const flow = Array.from({ length: 10 }, (_, i) => makeFlow(i + 1, 100));

    const result = calculateMarketRisk(liquidity, index, flow, credit);
    expect(result.leverageScore).toBeGreaterThan(0);
  });
});

describe("credit to market cap ratio", () => {
  const engineDate = (day: number): string => {
    const d = new Date(Date.UTC(2026, 0, day));
    return d.toISOString().slice(0, 10);
  };

  it("adds a leverage signal only after credit/market cap ratio exceeds historical p95", () => {
    const liquidityRows = Array.from({ length: 65 }, (_, i) => ({
      trade_date: engineDate(i + 1),
      investor_deposit_million_krw: 10000
    }));
    const creditRows = Array.from({ length: 65 }, (_, i) => ({
      trade_date: engineDate(i + 1),
      credit_loan_million_krw: 1000,
      total_credit_million_krw: 1100
    }));
    const indexRows = Array.from({ length: 65 }, (_, i) => ({
      trade_date: engineDate(i + 1),
      market: "KOSPI",
      close: 3000
    }));
    const marketCapRows = Array.from({ length: 65 }, (_, i) => {
      const isLast = i === 64;
      return [
        {
          trade_date: engineDate(i + 1),
          market: "KOSPI",
          market_cap_million_krw: isLast ? 50000 : 60000
        },
        {
          trade_date: engineDate(i + 1),
          market: "KOSDAQ",
          market_cap_million_krw: isLast ? 33333 : 40000
        }
      ];
    }).flat();

    const result = calculateMarketRiskEngine({
      liquidityRows,
      creditRows,
      cmaRows: [],
      indexRows,
      flowRows: [],
      marketCapRows
    });

    expect(result.signals.some((signal) => signal.signal_type === "credit_to_market_cap_ratio_high")).toBe(true);
  });
});

