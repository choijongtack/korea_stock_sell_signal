async function run() {
  try {
    console.log("Triggering sync API for 5 days...");
    const res = await fetch("http://localhost:3001/api/admin/sync-krx-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastDays: 5, syncType: "krx_stocks" })
    });
    
    if (!res.ok) {
      console.error("HTTP Error:", res.status, res.statusText);
      console.error(await res.text());
      return;
    }
    
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
