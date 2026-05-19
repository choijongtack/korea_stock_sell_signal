import { syncKrxStocksDaily } from "./src/lib/syncKrxOpenApi";
import { config } from "dotenv";

config({ path: ".env.local" });

async function run() {
  console.log("Starting test sync...");
  try {
    const result = await syncKrxStocksDaily(1); // 1 day
    console.log("Sync Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Test failed:", err);
  }
}

run();
