import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { syncMarketBreadthDaily } from "../syncMarketBreadth";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const hasKrxBreadthEnv = Boolean(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.KRX_OPENAPI_BASE_URL &&
    process.env.KRX_OPENAPI_AUTH_KEY &&
    process.env.KRX_OPENAPI_BREADTH_API_ID_KOSPI &&
    process.env.KRX_OPENAPI_BREADTH_API_ID_KOSDAQ
);

describe("KRX API Connection Test", () => {
  it.skipIf(!hasKrxBreadthEnv)("should attempt to fetch data from KRX Open API or legacy endpoint", async () => {
    // We can't easily test the actual network call in a CI environment without real keys,
    // but the user's environment should have the keys.
    // We'll try to run the sync for just 1 day (today or yesterday) to see if it works.
    
    try {
      const result = await syncMarketBreadthDaily(1);
      console.log("Sync Result:", result);
      
      // If it succeeded, inserted should be 0 or more (depending on if data exists for today)
      // On weekends, it might be 0.
      expect(result).toBeDefined();
      expect(result.datesTried).toBe(1);
    } catch (error: any) {
      console.error("KRX Sync Failed:", error.message);
      // If it fails due to LOGOUT, we know the legacy method is blocked.
      // If it fails due to Auth, we know the Open API key is wrong.
      throw error;
    }
  }, 30000); // 30s timeout
});
