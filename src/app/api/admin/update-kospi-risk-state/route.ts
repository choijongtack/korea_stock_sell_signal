import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { isAdminMode } from "@/lib/adminAuth";
import { syncEcosM2Update } from "@/lib/syncEcosOpenApi";
import { syncKisInvestorFlowUpdate } from "@/lib/syncKisOpenApi";
import {
  syncKofiaCmaUpdate,
  syncKofiaCreditBalanceUpdate,
  syncKofiaMarketLiquidityUpdate
} from "@/lib/syncKofiaOpenApi";
import { syncKrxIndexUpdate, syncKrxMarketCapUpdate } from "@/lib/syncKrxOpenApi";
import { syncMarketBreadthUpdate } from "@/lib/syncMarketBreadth";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncStepResult = {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

async function runSyncStep(name: string, fn: () => Promise<unknown>): Promise<SyncStepResult> {
  try {
    return { name, ok: true, result: await fn() };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

function parseRiskModelStdout(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!(await isAdminMode())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      includeDataSync?: boolean;
      lastDays?: number;
    };
    const includeDataSync = body.includeDataSync !== false;
    const lastDays = typeof body.lastDays === "number" && body.lastDays > 0 ? Math.min(Math.floor(body.lastDays), 365) : 30;

    const syncResults: SyncStepResult[] = [];
    if (includeDataSync) {
      const syncSteps: Array<[string, () => Promise<unknown>]> = [
        ["KRX KOSPI/KOSDAQ index", () => syncKrxIndexUpdate(lastDays)],
        ["KRX market cap", () => syncKrxMarketCapUpdate(lastDays)],
        ["KOFIA liquidity", () => syncKofiaMarketLiquidityUpdate(lastDays)],
        ["KOFIA credit balance", () => syncKofiaCreditBalanceUpdate(lastDays)],
        ["KOFIA CMA", () => syncKofiaCmaUpdate(lastDays)],
        ["KIS investor flow", () => syncKisInvestorFlowUpdate(lastDays)],
        ["ECOS M2", () => syncEcosM2Update(lastDays)],
        ["Market breadth", () => syncMarketBreadthUpdate(lastDays, "ALL")]
      ];
      for (const [name, fn] of syncSteps) {
        syncResults.push(await runSyncStep(name, fn));
      }
    }

    const { stdout, stderr } = await execFileAsync(process.execPath, ["scripts/kospi-risk-model.mjs", "--save"], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000
    });
    const metrics = parseRiskModelStdout(stdout);

    return NextResponse.json({
      ok: true,
      includeDataSync,
      lastDays,
      syncResults,
      model: {
        ok: true,
        metrics,
        stderr: stderr.trim() || null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
