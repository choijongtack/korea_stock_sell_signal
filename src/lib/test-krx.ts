import fs from 'fs';
import path from 'path';

// Manually load .env.local BEFORE importing modules that use them
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Now import the logic
import { syncMarketBreadthDaily } from './syncMarketBreadth';

async function test() {
  console.log('Starting KRX API test...');
  
  // Override for testing via env when needed.
  
  console.log('KRX_OPENAPI_BASE_URL:', process.env.KRX_OPENAPI_BASE_URL);
  console.log('KRX_OPENAPI_AUTH_KEY:', process.env.KRX_OPENAPI_AUTH_KEY ? 'PRESENT' : 'MISSING');
  
  try {
    // Test last 5 days to ensure we hit a weekday with data
    console.log('Testing last 5 days...');
    const result = await syncMarketBreadthDaily(5);
    console.log('Sync Result:', JSON.stringify(result, null, 2));
    
    if (result.warnings.length > 0) {
      console.log('Warnings:', result.warnings);
    }
  } catch (error: any) {
    console.error('Test failed:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

test();
