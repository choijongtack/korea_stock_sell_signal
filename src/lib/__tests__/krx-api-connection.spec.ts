import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { syncMarketBreadthDaily } from "../syncMarketBreadth";

// Note: This test requires environment variables from .env.local
// Vitest might not load .env.local automatically depending on config.

describe("KRX API Connection Test", () => {
  it("should attempt to fetch data from KRX Open API or legacy endpoint", async () => {
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
