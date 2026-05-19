"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { MarketBreadthDaily, MarketIndexDaily } from "@/types/market";
import { normalizeFreesisCma, normalizeFreesisCreditBalance, normalizeFreesisLiquidity } from "@/lib/normalizeFreesis";
import { normalizeKrxInvestorFlow } from "@/lib/normalizeKrxInvestorFlow";
import { normalizeKrxIndex } from "@/lib/normalizeKrxIndex";
import { normalizeKrxStockDaily } from "@/lib/normalizeKrxStockDaily";
import { upsertInvestorFlowDaily, upsertMarketBreadthDaily, upsertMarketCmaDaily, upsertMarketCreditBalanceDaily, upsertMarketIndexDaily, upsertMarketLiquidityDailyPartial, upsertKrxStockDaily } from "@/lib/saveMarketDataApi";

type UploadDataType =
  | "freesis_market_liquidity"
  | "freesis_credit_balance"
  | "freesis_cma"
  | "krx_index"
  | "investor_flow"
  | "krx_market_breadth"
  | "krx_market_cap"
  | "krx_stock_daily";
type ParsedRow = Record<string, string | number | boolean | null>;

const DATA_TYPE_OPTIONS: UploadDataType[] = [
  "freesis_market_liquidity",
  "freesis_credit_balance",
  "freesis_cma",
  "krx_index",
  "investor_flow",
  "krx_market_breadth",
  "krx_market_cap",
  "krx_stock_daily"
];
const DATA_TYPE_LABELS: Record<UploadDataType, string> = {
  freesis_market_liquidity: "KOFIA market liquidity",
  freesis_credit_balance: "KOFIA credit balance",
  freesis_cma: "KOFIA CMA",
  krx_index: "KIS market index",
  investor_flow: "KIS investor flow",
  krx_market_breadth: "KRX market breadth",
  krx_market_cap: "KRX market cap",
  krx_stock_daily: "KRX stock daily"
};
const PREVIEW_LIMIT = 20;
const INDEX_ORDER: Array<MarketIndexDaily["market"]> = ["KOSPI", "KOSDAQ", "KOSPI200"];
const MERGED_PREVIEW_COLUMNS = [
  "tradeDate",
  "indexName",
  "close",
  "change",
  "changeRate",
  "open",
  "high",
  "low",
  "volume",
  "tradingValueMillionKrw"
];

const isFreesisType = (type: UploadDataType) =>
  type === "freesis_market_liquidity" || type === "freesis_credit_balance" || type === "freesis_cma";

const kofiaSyncTypeByUploadType: Partial<Record<UploadDataType, "kofia_liquidity" | "kofia_credit_balance" | "kofia_cma">> = {
  freesis_market_liquidity: "kofia_liquidity",
  freesis_credit_balance: "kofia_credit_balance",
  freesis_cma: "kofia_cma"
};
const kofiaSyncLabelByUploadType: Partial<Record<UploadDataType, string>> = {
  freesis_market_liquidity: "KOFIA market liquidity",
  freesis_credit_balance: "KOFIA credit balance",
  freesis_cma: "KOFIA CMA"
};

const composeFreesisHeader = (top: any, sub: any): string => {
  const a = String(top ?? "").replace(/\s+/g, " ").trim();
  const b = String(sub ?? "").replace(/\s+/g, " ").trim();
  if (!a && !b) return "";
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
};

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");

const detectIndexName = (fileName: string, rows: ParsedRow[]): MarketIndexDaily["market"] | null => {
  const upper = fileName.toUpperCase();
  if (upper.includes("KOSPI200") || upper.includes("코스피200")) return "KOSPI200";
  if (upper.includes("KOSDAQ") || upper.includes("코스닥")) return "KOSDAQ";
  if (upper.includes("KOSPI") || upper.includes("코스피")) return "KOSPI";

  const keys = Object.keys(rows[0] ?? {});
  const marketKey = keys.find((key) => {
    const h = normalizeHeader(key);
    return h.includes("시장명") || h.includes("지수명") || h.includes("market");
  });
  if (!marketKey) return null;

  for (const row of rows) {
    const raw = String(row[marketKey] ?? "").toUpperCase();
    if (raw.includes("KOSPI200") || raw.includes("코스피200")) return "KOSPI200";
    if (raw.includes("KOSDAQ") || raw.includes("코스닥")) return "KOSDAQ";
    if (raw.includes("KOSPI") || raw.includes("코스피")) return "KOSPI";
  }
  return null;
};

const parseDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d]/g, "");
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(raw.replace(/[./]/g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const pickValue = (row: ParsedRow, aliases: string[]): unknown => {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const h = normalizeHeader(key);
    if (aliases.some((alias) => h === normalizeHeader(alias))) return value;
  }
  return null;
};

const normalizeIndexRows = (rows: ParsedRow[], market: MarketIndexDaily["market"]): MarketIndexDaily[] =>
  rows
    .map((row) => {
      const tradeDate = parseDate(pickValue(row, ["기준일", "일자", "날짜", "거래일", "tradeDate", "date"]));
      if (!tradeDate) return null;
      return {
        tradeDate,
        market,
        close: parseNumber(pickValue(row, ["종가", "현재가", "close"])),
        change: parseNumber(pickValue(row, ["대비", "등락", "change"])),
        changeRate: parseNumber(pickValue(row, ["등락률", "등락률(%)", "changeRate", "%change"])),
        open: parseNumber(pickValue(row, ["시가", "open"])),
        high: parseNumber(pickValue(row, ["고가", "high"])),
        low: parseNumber(pickValue(row, ["저가", "low"])),
        volume: parseNumber(pickValue(row, ["거래량", "volume", "trading volume"])),
        tradingValueMillionKrw: parseNumber(pickValue(row, ["거래대금", "거래대금(백만)", "tradingValueMillionKrw", "trading value"])),
        createdAt: "1970-01-01T00:00:00.000Z"
      };
    })
    .filter((row): row is MarketIndexDaily => row !== null);

const sortMergedRows = (rows: MarketIndexDaily[]): MarketIndexDaily[] =>
  [...rows].sort((a, b) => {
    if (a.tradeDate !== b.tradeDate) return a.tradeDate.localeCompare(b.tradeDate);
    return INDEX_ORDER.indexOf(a.market) - INDEX_ORDER.indexOf(b.market);
  });

const normalizeMarketBreadthRows = (rows: ParsedRow[]): MarketBreadthDaily[] =>
  rows
    .map((row) => {
      const tradeDate = parseDate(
        pickValue(row, ["tradeDate", "trade_date", "date", "일자", "날짜", "거래일"])
      );
      const marketRaw = String(pickValue(row, ["market", "시장", "indexName", "지수명"]) ?? "").toUpperCase();
      const market = marketRaw.includes("KOSDAQ") || marketRaw.includes("코스닥") ? "KOSDAQ" : "KOSPI";
      if (!tradeDate) return null;
      return {
        tradeDate,
        market,
        advancers: parseNumber(pickValue(row, ["advancers", "상승종목수", "상승"])),
        decliners: parseNumber(pickValue(row, ["decliners", "하락종목수", "하락"])),
        unchanged: parseNumber(pickValue(row, ["unchanged", "보합종목수", "보합"])),
        tradingValueMillionKrw: parseNumber(
          pickValue(row, ["tradingValueMillionKrw", "trading_value_million_krw", "거래대금", "거래대금(백만)"])
        ),
        createdAt: "1970-01-01T00:00:00.000Z"
      };
    })
    .filter((row): row is MarketBreadthDaily => row !== null);

export function DataUpload() {
  const [selectedType, setSelectedType] = useState<UploadDataType>("freesis_market_liquidity");
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [investorFlowMarket, setInvestorFlowMarket] = useState<"KOSPI" | "KOSDAQ">("KOSPI");
  const [mergedIndexRows, setMergedIndexRows] = useState<MarketIndexDaily[]>([]);
  const [mergedIndexStats, setMergedIndexStats] = useState<{
    startDate: string | null;
    endDate: string | null;
    totalRows: number;
    counts: Record<string, number>;
  } | null>(null);
  const [isSyncingBreadth, setIsSyncingBreadth] = useState(false);
  const [syncDays, setSyncDays] = useState(180);

  const hasPreview = previewRows.length > 0;

  const previewKeys = useMemo(() => {
    if (columns.length > 0) return columns;
    if (previewRows.length === 0) return [];
    return Object.keys(previewRows[0]);
  }, [columns, previewRows]);

  const resetResult = () => {
    setColumns([]);
    setPreviewRows([]);
    setParsedRows([]);
    setError("");
    setSaveMessage("");
    setValidationMessage("");
    setMergedIndexRows([]);
    setMergedIndexStats(null);
  };

  const handleCsvParse = (file: File) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const rows = results.data.filter((row) => Object.keys(row).length > 0);
        setColumns(fields);
        setParsedRows(rows);
        setPreviewRows(rows.slice(0, PREVIEW_LIMIT));
        if (results.errors.length > 0) {
          setError(`CSV parsing completed with ${results.errors.length} warning(s).`);
        }
        console.log("Parsed upload data:", { dataType: selectedType, fileName: file.name, totalRows: rows.length, columns: fields, rows });
        setIsLoading(false);
      },
      error: (parseError) => {
        setError(`CSV parse error: ${parseError.message}`);
        setIsLoading(false);
      }
    });
  };

  const handleExcelParse = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (workbook.SheetNames.length === 0) {
        setError("Excel file has no sheets.");
        setIsLoading(false);
        return;
      }
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      let rows: ParsedRow[] = [];

      if (isFreesisType(selectedType)) {
        const matrix = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: null });
        const headerRowIndex = 2;
        const subHeaderRowIndex = selectedType === "freesis_credit_balance" ? 3 : -1;
        const rawHeader = matrix[headerRowIndex] ?? [];
        const rawSubHeader = subHeaderRowIndex >= 0 ? matrix[subHeaderRowIndex] ?? [] : [];
        const headers = rawHeader.map((h, idx) => composeFreesisHeader(h, rawSubHeader[idx]));
        const dataStart = subHeaderRowIndex >= 0 ? 4 : 3;
        rows = (matrix.slice(dataStart) as any[][])
          .filter((r) => Array.isArray(r) && r.some((v) => v !== null && String(v).trim() !== ""))
          .map((r) =>
            headers.reduce<ParsedRow>((acc, h, idx) => {
              if (h) acc[h] = (r[idx] ?? null) as string | number | boolean | null;
              return acc;
            }, {})
          );
      } else {
        rows = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: null });
      }

      const fields = Object.keys(rows[0] ?? {});
      setColumns(fields);
      setParsedRows(rows);
      setPreviewRows(rows.slice(0, PREVIEW_LIMIT));
      console.log("Parsed upload data:", { dataType: selectedType, fileName: file.name, totalRows: rows.length, columns: fields, rows });
    } catch (excelError) {
      const message = excelError instanceof Error ? excelError.message : "Unknown error";
      setError(`Excel parse error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const parseSingleFile = async (file: File): Promise<ParsedRow[]> => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      return await new Promise<ParsedRow[]>((resolve, reject) => {
        Papa.parse<ParsedRow>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results.data.filter((row) => Object.keys(row).length > 0)),
          error: (parseError) => reject(new Error(parseError.message))
        });
      });
    }
    if (ext === "xlsx" || ext === "xls") {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (workbook.SheetNames.length === 0) return [];
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: null });
    }
    throw new Error(`Unsupported file type: ${file.name}`);
  };

  const buildMergedIndexStats = (rows: MarketIndexDaily[]) => {
    const sorted = sortMergedRows(rows);
    const counts = { KOSPI: 0, KOSDAQ: 0, KOSPI200: 0 };
    sorted.forEach((row) => {
      if (row.market in counts) counts[row.market as keyof typeof counts] += 1;
    });
    return {
      startDate: sorted[0]?.tradeDate ?? null,
      endDate: sorted[sorted.length - 1]?.tradeDate ?? null,
      totalRows: sorted.length,
      counts
    };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    resetResult();
    setFileName(files.map((f) => f.name).join(", "));
    setIsLoading(true);

    if (selectedType !== "krx_index") {
      const file = files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") return handleCsvParse(file);
      if (ext === "xlsx" || ext === "xls") return handleExcelParse(file);
      setError("Unsupported file type. Use CSV, XLSX, or XLS.");
      setIsLoading(false);
      return;
    }

    try {
      const mergedMap = new Map<string, MarketIndexDaily>();
      let allRawRows: ParsedRow[] = [];

      for (const file of files) {
        const rawRows = await parseSingleFile(file);
        allRawRows = allRawRows.concat(rawRows);

        const indexName = detectIndexName(file.name, rawRows);
        if (!indexName) continue;
        const normalizedRows = normalizeIndexRows(rawRows, indexName);
        normalizedRows.forEach((row) => {
          mergedMap.set(`${row.tradeDate}|${row.market}`, row);
        });
      }

      const mergedRows = sortMergedRows(Array.from(mergedMap.values()));
      setColumns(MERGED_PREVIEW_COLUMNS);
      setParsedRows(allRawRows);
      setMergedIndexRows(mergedRows);
      setMergedIndexStats(buildMergedIndexStats(mergedRows));
      setPreviewRows(
        mergedRows.slice(0, PREVIEW_LIMIT).map((row) => ({
          tradeDate: row.tradeDate,
          indexName: row.market,
          close: row.close,
          change: row.change,
          changeRate: row.changeRate,
          open: row.open,
          high: row.high,
          low: row.low,
          volume: row.volume,
          tradingValueMillionKrw: row.tradingValueMillionKrw
        }))
      );
      setValidationMessage(`Merged ${files.length} files into ${mergedRows.length} unique rows.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Parse error: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const validateBeforeSave = (rawRows: ParsedRow[]): { ok: boolean; message: string } => {
    if (rawRows.length === 0) return { ok: false, message: "No parsed rows to save." };
    if (columns.length === 0) return { ok: false, message: "No columns detected from the uploaded file." };
    return { ok: true, message: `Validation passed: rows=${rawRows.length}, columns=${columns.length}` };
  };

  const handleSave = async () => {
    setError("");
    setSaveMessage("");
    const validation = validateBeforeSave(parsedRows);
    setValidationMessage(validation.message);
    if (!validation.ok) return;

    setIsSaving(true);
    try {
      if (selectedType === "freesis_market_liquidity") {
        const normalized = normalizeFreesisLiquidity(parsedRows);
        if (normalized.warnings.length > 0) setValidationMessage((prev) => `${prev} | warnings=${normalized.warnings.join(", ")}`);
        const result = await upsertMarketLiquidityDailyPartial(normalized.data);
        setSaveMessage(result.success ? `Saved ${result.count} rows to market_liquidity_daily.` : `Save failed: ${result.message}`);
        return;
      }

      if (selectedType === "freesis_credit_balance") {
        const normalized = normalizeFreesisCreditBalance(parsedRows);
        if (normalized.warnings.length > 0) setValidationMessage((prev) => `${prev} | warnings=${normalized.warnings.join(", ")}`);
        const result = await upsertMarketCreditBalanceDaily(normalized.data);
        setSaveMessage(result.success ? `Saved ${result.count} rows to market_credit_balance_daily.` : `Save failed: ${result.message}`);
        return;
      }

      if (selectedType === "freesis_cma") {
        const normalized = normalizeFreesisCma(parsedRows);
        if (normalized.warnings.length > 0) setValidationMessage((prev) => `${prev} | warnings=${normalized.warnings.join(", ")}`);
        const result = await upsertMarketCmaDaily(normalized.data);
        setSaveMessage(result.success ? `Saved ${result.count} rows to market_cma_daily.` : `Save failed: ${result.message}`);
        return;
      }

      if (selectedType === "krx_index") {
        const rowsToSave = mergedIndexRows.length > 0 ? mergedIndexRows : normalizeKrxIndex(parsedRows);
        if (rowsToSave.length === 0) {
          setSaveMessage("No index rows to save. Please upload files first.");
          return;
        }
        const result = await upsertMarketIndexDaily(rowsToSave);
        setSaveMessage(result.success ? `Saved ${result.count} rows to market_index_daily.` : `Save failed: ${result.message}`);
        return;
      }

      if (selectedType === "krx_market_breadth") {
        const normalized = normalizeMarketBreadthRows(parsedRows);
        if (normalized.length === 0) {
          setSaveMessage("No market breadth rows to save. Check column names.");
          return;
        }
        const result = await upsertMarketBreadthDaily(normalized);
        setSaveMessage(result.success ? `Saved ${result.count} rows to market_breadth_daily.` : `Save failed: ${result.message}`);
        return;
      }

      if (selectedType === "krx_market_cap") {
        setSaveMessage("market_cap_daily is populated through KRX index market cap API. Click the Generate button below.");
        return;
      }

      if (selectedType === "krx_stock_daily") {
        const normalized = normalizeKrxStockDaily(parsedRows);
        if (normalized.warnings.length > 0) {
          setValidationMessage((prev) => `${prev} | warnings=${normalized.warnings.slice(0, 5).join(" ; ")}`);
        }
        if (normalized.data.length === 0) {
          setSaveMessage("No valid KRX stock daily rows to save. Check file columns.");
          return;
        }
        const result = await upsertKrxStockDaily(normalized.data);
        setSaveMessage(result.success ? `Saved ${result.count} rows to Supabase Storage CSVs, and regenerated breadth & market cap metrics.` : `Save failed: ${result.message}`);
        return;
      }

      const normalizedKrx = normalizeKrxInvestorFlow(parsedRows, { market: investorFlowMarket });
      if (normalizedKrx.warnings.length > 0) {
        setValidationMessage((prev) => `${prev} | warnings=${normalizedKrx.warnings.slice(0, 3).join(" ; ")}`);
      }
      const payload = normalizedKrx.data.map((row) => ({
        tradeDate: row.tradeDate,
        market: row.market,
        foreignNetBuy: row.foreignerNetBuyMillionKrw,
        institutionNetBuy: row.institutionNetBuyMillionKrw,
        individualNetBuy: row.individualNetBuyMillionKrw,
        programNetBuy: null,
        createdAt: "1970-01-01T00:00:00.000Z"
      }));
      const result = await upsertInvestorFlowDaily(payload);
      setSaveMessage(result.success ? `Saved ${result.count} rows to investor_flow_daily (${investorFlowMarket}).` : `Save failed: ${result.message}`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unknown error";
      setSaveMessage(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoSyncBreadth = async (market: "ALL" | "KOSPI" | "KOSDAQ" = "ALL", backfill = false) => {
    setError("");
    setSaveMessage("");
    setValidationMessage("");
    setIsSyncingBreadth(true);
    try {
      const response = await fetch("/api/admin/sync-market-breadth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDays: syncDays, market, backfill })
      });
      const result = (await response.json()) as {
        ok: boolean;
        inserted?: number;
        datesTried?: number;
        datesSucceeded?: number;
        warnings?: string[];
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? result.message ?? "Auto sync failed");
      }
      const warnings = (result.warnings ?? []).slice(0, 5);
      const warningText = warnings.length > 0 ? ` | warnings: ${warnings.join(" ; ")}` : "";
      setSaveMessage(
        `Auto sync KRX breadth ${backfill ? "backfill " : ""}(${market}) completed: inserted=${result.inserted ?? 0}, tried=${result.datesTried ?? 0}, succeeded=${result.datesSucceeded ?? 0}${warningText}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Auto sync failed: ${message}`);
    } finally {
      setIsSyncingBreadth(false);
    }
  };

  const handleAutoSyncKrxData = async (syncType: "krx_index" | "krx_index_backfill" | "krx_investor_flow" | "krx_market_cap" | "krx_market_cap_backfill" | "krx_stocks" | "krx_stocks_backfill") => {
    setError("");
    setSaveMessage("");
    setValidationMessage("");
    setIsSyncingBreadth(true);
    try {
      const response = await fetch("/api/admin/sync-krx-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDays: syncDays, syncType })
      });
      const result = (await response.json()) as {
        ok: boolean;
        inserted?: number;
        datesTried?: number;
        datesSucceeded?: number;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Auto sync failed");
      const warnings = (result.warnings ?? []).slice(0, 5);
      setSaveMessage(
        `Auto sync (${syncType}) completed: inserted=${result.inserted ?? 0}, tried=${result.datesTried ?? 0}, succeeded=${result.datesSucceeded ?? 0}${warnings.length ? ` | warnings: ${warnings.join(" ; ")}` : ""}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Auto sync failed: ${message}`);
    } finally {
      setIsSyncingBreadth(false);
    }
  };

  const handleAutoSyncKisData = async (backfill = false) => {
    setError("");
    setSaveMessage("");
    setValidationMessage("");
    setIsSyncingBreadth(true);
    try {
      const response = await fetch("/api/admin/sync-kis-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDays: syncDays, syncType: backfill ? "kis_investor_flow_backfill" : "kis_investor_flow" })
      });
      const result = (await response.json()) as {
        ok: boolean;
        inserted?: number;
        datesTried?: number;
        datesSucceeded?: number;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Auto sync failed");
      const warnings = (result.warnings ?? []).slice(0, 5);
      setSaveMessage(
        `Auto sync (KIS investor flow${backfill ? " backfill" : ""}) completed: inserted=${result.inserted ?? 0}, tried=${result.datesTried ?? 0}, succeeded=${result.datesSucceeded ?? 0}${warnings.length ? ` | warnings: ${warnings.join(" ; ")}` : ""}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Auto sync failed: ${message}`);
    } finally {
      setIsSyncingBreadth(false);
    }
  };

  const handleAutoSyncKofiaData = async (
    syncType:
      | "kofia_liquidity"
      | "kofia_liquidity_backfill"
      | "kofia_credit_balance"
      | "kofia_credit_balance_backfill"
      | "kofia_cma"
      | "kofia_cma_backfill"
  ) => {
    setError("");
    setSaveMessage("");
    setValidationMessage("");
    setIsSyncingBreadth(true);
    try {
      const response = await fetch("/api/admin/sync-kofia-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDays: syncDays, syncType })
      });
      const result = (await response.json()) as {
        ok: boolean;
        inserted?: number;
        datesTried?: number;
        datesSucceeded?: number;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Auto sync failed");
      const warnings = (result.warnings ?? []).slice(0, 5);
      setSaveMessage(
        `Auto sync (${syncType}) completed: inserted=${result.inserted ?? 0}, tried=${result.datesTried ?? 0}, succeeded=${result.datesSucceeded ?? 0}${warnings.length ? ` | warnings: ${warnings.join(" ; ")}` : ""}`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(`Auto sync failed: ${message}`);
    } finally {
      setIsSyncingBreadth(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold">Data Upload</h2>
      <p className="mt-1 text-sm text-slate-500">Upload CSV or Excel and preview data. KIS market index auto sync uses KIS; manual index upload still accepts KRX files.</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700">
          <span className="mr-2">Auto sync days</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={syncDays}
            onChange={(e) => setSyncDays(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Data Type</span>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none ring-slate-300 focus:ring-2"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as UploadDataType)}
          >
            {DATA_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {DATA_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">File</span>
          <input
            type="file"
            multiple={selectedType === "krx_index"}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white"
          />
        </label>
      </div>
      {selectedType === "investor_flow" && (
        <div className="mt-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Investor Flow Market</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none ring-slate-300 focus:ring-2"
              value={investorFlowMarket}
              onChange={(e) => setInvestorFlowMarket(e.target.value as "KOSPI" | "KOSDAQ")}
            >
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={
            isSaving ||
            isLoading ||
            selectedType === "krx_market_cap" ||
            (selectedType === "krx_index" ? mergedIndexRows.length === 0 : parsedRows.length === 0)
          }
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSaving ? "Saving..." : "Save to Supabase"}
        </button>
        {fileName && <span className="text-sm text-slate-500">Selected: {fileName}</span>}
      </div>
      {selectedType === "krx_market_breadth" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleAutoSyncBreadth("ALL")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Generating..." : "Generate KRX breadth ALL"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncBreadth("ALL", true)}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Generating..." : "Backfill older breadth ALL"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncBreadth("KOSPI")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Generating..." : "Generate KOSPI breadth"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncBreadth("KOSDAQ")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Generating..." : "Generate KOSDAQ breadth"}
          </button>
        </div>
      )}
      {selectedType === "krx_index" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_index")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Auto Sync KIS index"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_index_backfill")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Backfill older KIS index"}
          </button>
        </div>
      )}
      {selectedType === "krx_market_cap" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_market_cap")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Generating..." : "Generate KRX market cap from index"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_market_cap_backfill")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Generating..." : "Backfill older market cap"}
          </button>
        </div>
      )}
      {selectedType === "krx_stock_daily" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_stocks")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Auto Sync KRX stock daily"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncKrxData("krx_stocks_backfill")}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Backfill older KRX stock daily"}
          </button>
        </div>
      )}
      {selectedType === "investor_flow" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleAutoSyncKisData()}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Auto Sync KIS Investor Flow"}
          </button>
          <button
            type="button"
            onClick={() => handleAutoSyncKisData(true)}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Syncing..." : "Backfill older KIS Investor Flow"}
          </button>
        </div>
      )}
      {isFreesisType(selectedType) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const syncType = kofiaSyncTypeByUploadType[selectedType];
              if (syncType) void handleAutoSyncKofiaData(syncType);
            }}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSyncingBreadth ? "Syncing..." : `Auto Sync ${kofiaSyncLabelByUploadType[selectedType]}`}
          </button>
          <button
            type="button"
            onClick={() => {
              const syncType = kofiaSyncTypeByUploadType[selectedType];
              if (syncType) void handleAutoSyncKofiaData(`${syncType}_backfill` as Parameters<typeof handleAutoSyncKofiaData>[0]);
            }}
            disabled={isSyncingBreadth || isLoading || isSaving}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSyncingBreadth ? "Syncing..." : `Backfill older ${kofiaSyncLabelByUploadType[selectedType]}`}
          </button>
        </div>
      )}

      {isLoading && <p className="mt-4 text-sm text-slate-500">Parsing file...</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {validationMessage && <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{validationMessage}</p>}
      {saveMessage && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{saveMessage}</p>}
      {selectedType === "krx_index" && mergedIndexStats && (
        <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <p>Start: {mergedIndexStats.startDate ?? "-"}</p>
          <p>End: {mergedIndexStats.endDate ?? "-"}</p>
          <p>Total Rows: {mergedIndexStats.totalRows}</p>
          <p>KOSPI: {mergedIndexStats.counts.KOSPI} | KOSDAQ: {mergedIndexStats.counts.KOSDAQ} | KOSPI200: {mergedIndexStats.counts.KOSPI200}</p>
        </div>
      )}

      {hasPreview && (
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Columns</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {previewKeys.map((key) => (
                <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {key}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700">Preview (first 20 rows)</h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {previewKeys.map((key) => (
                      <th key={key} className="px-3 py-2 text-left font-medium text-slate-600">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={`${rowIndex}-${fileName}`} className="border-t border-slate-100">
                      {previewKeys.map((key) => (
                        <td key={`${rowIndex}-${key}`} className="px-3 py-2 text-slate-700">
                          {String(row[key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
