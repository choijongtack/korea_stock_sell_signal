import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { syncKrxMarketCapForDates } from "@/lib/syncKrxOpenApi";
import { uploadKrxDailyCsv, downloadKrxDailyCsv } from "@/lib/supabaseStorage";

type Payload = {
  dataType: "market_liquidity_partial" | "market_index" | "investor_flow" | "market_cma" | "market_credit_balance" | "krx_market_breadth" | "krx_stock_daily";
  rows: Record<string, unknown>[];
};

const hasKeys = (row: Record<string, unknown>, required: string[]): boolean => required.every((key) => key in row);

const toMarketLiquidityPartial = (rows: Record<string, unknown>[]) =>
  rows.map((r) => {
    const row: Record<string, unknown> = {
      trade_date: r.tradeDate,
      created_at: r.createdAt
    };
    if (r.investorDepositMillionKrw !== undefined) row.investor_deposit_million_krw = r.investorDepositMillionKrw;
    if (r.derivativesDepositMillionKrw !== undefined) row.derivatives_deposit_million_krw = r.derivativesDepositMillionKrw;
    if (r.rpBalanceMillionKrw !== undefined) row.rp_balance_million_krw = r.rpBalanceMillionKrw;
    if (r.unsettledBalanceMillionKrw !== undefined) row.unsettled_balance_million_krw = r.unsettledBalanceMillionKrw;
    return row;
  });

const toMarketCreditBalance = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate,
    credit_loan_million_krw: r.creditLoanMillionKrw,
    credit_short_million_krw: r.creditShortMillionKrw,
    collateral_loan_million_krw: r.collateralLoanMillionKrw,
    total_credit_million_krw: r.totalCreditMillionKrw,
    created_at: r.createdAt
  }));

const toMarketIndex = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate,
    market: r.market,
    close: r.close,
    change: r.change,
    change_rate: r.changeRate,
    open: r.open,
    high: r.high,
    low: r.low,
    volume: r.volume,
    trading_value_million_krw: r.tradingValueMillionKrw,
    created_at: r.createdAt
  }));

const toInvestorFlow = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate,
    market: r.market,
    foreign_net_buy: r.foreignNetBuy,
    institution_net_buy: r.institutionNetBuy,
    individual_net_buy: r.individualNetBuy,
    program_net_buy: r.programNetBuy,
    created_at: r.createdAt
  }));

const toInvestorFlowNormalized = (rows: Record<string, unknown>[]) => {
  const normalizedRows: Array<{
    trade_date: unknown;
    market: string;
    investor_type: string;
    net_buy_amount: unknown;
    created_at: unknown;
  }> = [];

  rows.forEach((r) => {
    const market = typeof r.market === "string" && r.market ? r.market : "ALL";
    normalizedRows.push({
      trade_date: r.tradeDate,
      market,
      investor_type: "foreign",
      net_buy_amount: r.foreignNetBuy,
      created_at: r.createdAt
    });
    normalizedRows.push({
      trade_date: r.tradeDate,
      market,
      investor_type: "institution",
      net_buy_amount: r.institutionNetBuy,
      created_at: r.createdAt
    });
    normalizedRows.push({
      trade_date: r.tradeDate,
      market,
      investor_type: "individual",
      net_buy_amount: r.individualNetBuy,
      created_at: r.createdAt
    });
  });

  return normalizedRows;
};

const toMarketCma = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate,
    rp_type_million_krw: r.rpTypeMillionKrw,
    mmf_type_million_krw: r.mmfTypeMillionKrw,
    jonggeum_type_million_krw: r.jonggeumTypeMillionKrw,
    issuing_note_type_million_krw: r.issuingNoteTypeMillionKrw,
    other_type_million_krw: r.otherTypeMillionKrw,
    total_million_krw: r.totalMillionKrw,
    created_at: r.createdAt
  }));

const toMarketBreadth = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate,
    market: r.market,
    advancers: r.advancers,
    decliners: r.decliners,
    unchanged: r.unchanged,
    trading_value_million_krw: r.tradingValueMillionKrw,
    created_at: r.createdAt
  }));

const toKrxStockDaily = (rows: Record<string, unknown>[]) =>
  rows.map((r) => ({
    trade_date: r.tradeDate as string,
    market: r.market as "KOSPI" | "KOSDAQ",
    stock_code: r.stockCode as string,
    stock_name: r.stockName as string,
    close_price: r.closePrice as number | null,
    change_price: r.changePrice as number | null,
    change_rate: r.changeRate as number | null,
    open_price: r.openPrice as number | null,
    high_price: r.highPrice as number | null,
    low_price: r.lowPrice as number | null,
    volume: r.volume as number | null,
    trading_value_krw: r.tradingValueKrw as number | null,
    market_cap_krw: r.marketCapKrw as number | null,
    listed_shares: r.listedShares as number | null,
    created_at: (r.createdAt as string) ?? new Date().toISOString()
  }));

async function upsertCmaWithFallback(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  payload: ReturnType<typeof toMarketCma>
) {
  const configured = process.env.SUPABASE_MARKET_CMA_TABLE?.trim();
  const candidates = [configured, "market_cma_daily", "market_cma"].filter((v): v is string => Boolean(v));
  let lastError: { message: string } | null = null;

  for (const table of candidates) {
    const { error } = await supabaseAdmin.from(table).upsert(payload, { onConflict: "trade_date" });
    if (!error) return { ok: true as const };
    lastError = error;

    const message = String(error.message ?? "").toLowerCase();
    const isMissingTable = message.includes("could not find the table") || message.includes("relation") || message.includes("does not exist");
    if (!isMissingTable) break;
  }

  return { ok: false as const, message: lastError?.message ?? "CMA upsert failed." };
}

async function upsertInvestorFlowWithFallback(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  sourceRows: Record<string, unknown>[]
) {
  const widePayload = toInvestorFlow(sourceRows);
  const normalizedPayload = toInvestorFlowNormalized(sourceRows);
  const summaryPayload = sourceRows.map((r) => ({
    trade_date: r.tradeDate,
    subtotal_institutions: r.institutionNetBuy,
    individuals: r.individualNetBuy,
    total_of_foreign: r.foreignNetBuy,
    created_at: r.createdAt
  }));

  const attempts: Array<{ payload: Record<string, unknown>[]; onConflict: string }> = [
    { payload: widePayload, onConflict: "trade_date,market" },
    { payload: summaryPayload, onConflict: "trade_date" }
  ];

  let lastError = "Unknown investor flow upsert error.";
  for (const attempt of attempts) {
    const result = await supabaseAdmin.from("investor_flow_daily").upsert(attempt.payload, { onConflict: attempt.onConflict });
    if (!result.error) return { ok: true as const, count: sourceRows.length };
    lastError = result.error.message;
  }

  return { ok: false as const, message: lastError };
}

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = (await req.json()) as Payload;
    if (!body?.dataType || !Array.isArray(body.rows)) {
      return NextResponse.json({ success: false, message: "Invalid upload payload." }, { status: 400 });
    }

    if (body.rows.length === 0) {
      return NextResponse.json({ success: false, message: "No rows to save." }, { status: 400 });
    }

    if (body.dataType === "market_liquidity_partial") {
      const payload = toMarketLiquidityPartial(body.rows);
      if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
        return NextResponse.json({ success: false, message: "Validation failed for market_liquidity_daily." }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from("market_liquidity_daily").upsert(payload, { onConflict: "trade_date" });
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      return NextResponse.json({ success: true, count: payload.length });
    }

    if (body.dataType === "market_index") {
      const payload = toMarketIndex(body.rows);
      if (!payload.every((row) => hasKeys(row, ["trade_date", "market", "created_at"]))) {
        return NextResponse.json({ success: false, message: "Validation failed for market_index_daily." }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from("market_index_daily").upsert(payload, { onConflict: "trade_date,market" });
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      return NextResponse.json({ success: true, count: payload.length });
    }

    if (body.dataType === "investor_flow") {
      const payload = body.rows;
      if (!payload.every((row) => hasKeys(row, ["tradeDate", "createdAt"]))) {
        return NextResponse.json({ success: false, message: "Validation failed for investor_flow_daily." }, { status: 400 });
      }
      const flowResult = await upsertInvestorFlowWithFallback(supabaseAdmin, payload);
      if (!flowResult.ok) return NextResponse.json({ success: false, message: flowResult.message }, { status: 400 });
      return NextResponse.json({ success: true, count: flowResult.count });
    }

    if (body.dataType === "market_credit_balance") {
      const payload = toMarketCreditBalance(body.rows);
      if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
        return NextResponse.json({ success: false, message: "Validation failed for market_credit_balance_daily." }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from("market_credit_balance_daily").upsert(payload, { onConflict: "trade_date" });
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
      return NextResponse.json({ success: true, count: payload.length });
    }

    if (body.dataType === "krx_stock_daily") {
      const payload = toKrxStockDaily(body.rows);
      if (!payload.every((row) => hasKeys(row, ["trade_date", "market", "stock_code", "stock_name"]))) {
        return NextResponse.json({ success: false, message: "Validation failed for krx_stock_daily." }, { status: 400 });
      }

      // Group rows by trade_date
      const groupedByDate = payload.reduce((acc, row) => {
        if (!acc[row.trade_date]) acc[row.trade_date] = [];
        acc[row.trade_date].push(row);
        return acc;
      }, {} as Record<string, typeof payload>);

      for (const [dateIso, rows] of Object.entries(groupedByDate)) {
        const ymd = dateIso.replace(/-/g, "");
        // Append to existing rows if any, to avoid overwriting KOSDAQ when uploading KOSPI or vice-versa
        let existing: Record<string, unknown>[] = [];
        try {
          existing = await downloadKrxDailyCsv(ymd);
        } catch {
          // ignore, file might not exist
        }

        // Deduplicate or merge existing and new rows. Since `krx_stock_daily` PK was trade_date,market,stock_code,
        // we can filter out existing rows that match the new ones.
        const newMap = new Map(rows.map(r => [`${r.market}_${r.stock_code}`, r]));
        const merged = existing.filter(r => {
          const key = `${r.market}_${r.stock_code}`;
          return !newMap.has(key);
        });
        merged.push(...(rows as unknown as Record<string, unknown>[]));

        try {
          await uploadKrxDailyCsv(ymd, merged);
        } catch (error) {
          const message = error instanceof Error ? error.message : "CSV Upload Error";
          return NextResponse.json({ success: false, message }, { status: 400 });
        }
      }

      // Breadth generation is archived for now; stock daily uploads only refresh market cap.
      const uniqueDates = Array.from(new Set(payload.map((row) => row.trade_date)));
      if (uniqueDates.length > 0) {
        try {
          await syncKrxMarketCapForDates(uniqueDates);
        } catch (calcError) {
          console.error("Post-upload aggregation failed:", calcError);
        }
      }

      return NextResponse.json({ success: true, count: payload.length });
    }

    if (body.dataType === "krx_market_breadth") {
      return NextResponse.json(
        {
          success: false,
          paused: true,
          message: "KRX market breadth upload is temporarily paused."
        },
        { status: 503 }
      );
    }

    const payload = toMarketCma(body.rows);
    if (!payload.every((row) => hasKeys(row, ["trade_date", "created_at"]))) {
      return NextResponse.json({ success: false, message: "Validation failed for market_cma_daily." }, { status: 400 });
    }
    const cmaResult = await upsertCmaWithFallback(supabaseAdmin, payload);
    if (!cmaResult.ok) return NextResponse.json({ success: false, message: cmaResult.message }, { status: 400 });
    return NextResponse.json({ success: true, count: payload.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
