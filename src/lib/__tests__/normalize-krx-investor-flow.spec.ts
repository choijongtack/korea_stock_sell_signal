import { describe, expect, it } from "vitest";
import { normalizeKrxInvestorFlow } from "@/lib/normalizeKrxInvestorFlow";

describe("normalizeKrxInvestorFlow", () => {
  it("normalizes date summary CSV, sorts asc, and dedupes by latest row", () => {
    const rows = [
      {
        Date: "2026/05/14",
        "Subtotal-Institutions": "100",
        "Other corporations": "10",
        Individuals: "200",
        "Total of foreign": "-310",
        Total: "0"
      },
      {
        Date: "2026/05/13",
        "Subtotal-Institutions": "11",
        "Other corporations": "1",
        Individuals: "22",
        "Total of foreign": "-34",
        Total: "0"
      },
      {
        Date: "2026/05/14",
        "Subtotal-Institutions": "101",
        "Other corporations": "11",
        Individuals: "202",
        "Total of foreign": "-314",
        Total: "0"
      }
    ];

    const result = normalizeKrxInvestorFlow(rows, { market: "KOSPI" });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].tradeDate).toBe("2026-05-13");
    expect(result.data[1].tradeDate).toBe("2026-05-14");
    expect(result.data[1].institutionNetBuyMillionKrw).toBe(101);
    expect(result.data[1].otherCorporationNetBuyMillionKrw).toBe(11);
    expect(result.data[1].market).toBe("KOSPI");
    expect(result.warnings).toHaveLength(0);
  });
});

