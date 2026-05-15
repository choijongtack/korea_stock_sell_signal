import fs from 'fs';
import path from 'path';

// Manually load .env.local
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

const AUTH_KEY = process.env.KRX_OPENAPI_AUTH_KEY || '';
const BASE_URLS = [
  'https://openapi.krx.co.kr',
  'https://data-dbg.krx.co.kr'
];
const API_ID = 'ksq_bydd_trd';
const DATE = '20260514'; // Past date to ensure data exists

async function testHeader(baseUrl: string, headerName: string) {
  const url = `${baseUrl}/svc/apis/sto/${API_ID}?basDd=${DATE}`;
  console.log(`\nTesting ${baseUrl} with header ${headerName}...`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        [headerName]: AUTH_KEY,
        'Accept': 'application/json'
      }
    });
    const body = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${body.slice(0, 200)}`);
  } catch (err: any) {
    console.log(`Fetch Error: ${err.message}`);
  }
}

async function run() {
  if (!AUTH_KEY) {
    console.error('No AUTH_KEY found in .env.local');
    return;
  }

  const headers = ['AUTH_KEY', 'Auth-Key', 'X-AUTH-KEY', 'Authorization'];
  
  for (const base of BASE_URLS) {
    for (const h of headers) {
      await testHeader(base, h);
    }
  }
}

run();
