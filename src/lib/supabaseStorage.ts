import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import Papa from "papaparse";

const BUCKET_NAME = "krx_daily_dumps";

export function getKrxDailyCsvFileName(ymd: string) {
  return `${ymd}.csv`;
}

export async function uploadKrxDailyCsv(ymd: string, rows: Record<string, unknown>[]) {
  const supabase = getSupabaseAdmin();
  
  const csv = Papa.unparse(rows);
  const fileName = getKrxDailyCsvFileName(ymd);
  
  let { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .upload(fileName, csv, {
      contentType: "text/csv",
      upsert: true,
    });
    
  if (error && error.message.includes("Bucket not found")) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: false });
    const retry = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(fileName, csv, {
        contentType: "text/csv",
        upsert: true,
      });
    data = retry.data;
    error = retry.error;
  }
    
  if (error) {
    throw new Error(`Failed to upload ${fileName} to storage: ${error.message}`);
  }
  
  return data;
}

export async function downloadKrxDailyCsv(ymd: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin();
  const fileName = getKrxDailyCsvFileName(ymd);
  
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .download(fileName);
    
  if (error) {
    if (error.message.includes("Object not found") || error.message.includes("not found")) return [];
    throw new Error(`Failed to download ${fileName} from storage: ${error.message}`);
  }
  
  const text = await data.text();
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`Failed to parse ${fileName}: ${firstError.message}`);
  }
  return parsed.data.filter((row) => Object.values(row).some((value) => value !== null && value !== undefined && value !== ""));
}
