import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MODEL_VERSION = "kospi_corr_state_v1";
const TARGET_HORIZON = 20;
const TARGET_THRESHOLD_PCT = -3;
const TRAIN_RATIO = 0.75;
const MAX_FEATURES = 12;

const args = new Set(process.argv.slice(2));
const shouldSave = args.has("--save");
const shouldWriteJson = args.has("--json");

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous !== 0 ? (current / previous - 1) * 100 : null;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function stddev(values) {
  if (values.length < 2) return null;
  const mean = avg(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function pearson(rows, xKey, yKey) {
  const data = rows.filter((row) => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]));
  if (data.length < 30) return null;
  const meanX = avg(data.map((row) => row[xKey]));
  const meanY = avg(data.map((row) => row[yKey]));
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (const row of data) {
    const dx = row[xKey] - meanX;
    const dy = row[yKey] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? null : numerator / denom;
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array(values.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) out[sorted[k].index] = rank;
    i = j;
  }
  return out;
}

function spearman(rows, xKey, yKey) {
  const data = rows.filter((row) => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]));
  if (data.length < 30) return null;
  const xRanks = ranks(data.map((row) => row[xKey]));
  const yRanks = ranks(data.map((row) => row[yKey]));
  return pearson(data.map((row, index) => ({ x: xRanks[index], y: yRanks[index] })), "x", "y");
}

function auc(rows, scoreKey, eventKey) {
  const data = rows.filter((row) => Number.isFinite(row[scoreKey]) && (row[eventKey] === 0 || row[eventKey] === 1));
  const positives = data.filter((row) => row[eventKey] === 1).length;
  const negatives = data.length - positives;
  if (positives === 0 || negatives === 0) return null;
  const ranked = data.map((row) => row[scoreKey]);
  const rankValues = ranks(ranked);
  let positiveRankSum = 0;
  data.forEach((row, index) => {
    if (row[eventKey] === 1) positiveRankSum += rankValues[index];
  });
  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function percentileScore(sortedValues, value) {
  if (!Number.isFinite(value) || sortedValues.length === 0) return null;
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(100, (lo / sortedValues.length) * 100));
}

function riskLevel(score) {
  if (score >= 90) return "crisis";
  if (score >= 75) return "danger";
  if (score >= 60) return "warning";
  if (score >= 40) return "caution";
  return "stable";
}

async function selectAll(supabase, table, select, orderColumn = "trade_date") {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function groupByDate(rows, valueFn) {
  const map = new Map();
  for (const row of rows) {
    const value = valueFn(row);
    if (!row.trade_date || !Number.isFinite(value)) continue;
    map.set(row.trade_date, value);
  }
  return map;
}

function addRollingFeature(rows, name, byDate, windows = [1, 5, 20, 60]) {
  const series = rows.map((row) => ({ date: row.date, value: byDate.get(row.date) ?? null }));
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i].value;
    rows[i][name] = Number.isFinite(value) ? value : null;
    for (const window of windows) {
      if (i < window || !Number.isFinite(value)) {
        rows[i][`${name}_pct${window}d`] = null;
        continue;
      }
      rows[i][`${name}_pct${window}d`] = pct(value, series[i - window].value);
    }
  }
}

function rollingSum(rows, valueByDate, index, window) {
  if (index < window - 1) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = valueByDate.get(rows[i].date);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function modelRowsWithScores(rows, selectedFeatures, trainRows) {
  const stats = new Map();
  for (const feature of selectedFeatures) {
    const values = trainRows.map((row) => row[feature.name]).filter(Number.isFinite);
    stats.set(feature.name, {
      mean: avg(values),
      stddev: stddev(values) || 1
    });
  }

  for (const row of rows) {
    let weighted = 0;
    let weightSum = 0;
    const components = {};
    const featureValues = {};

    for (const feature of selectedFeatures) {
      const value = row[feature.name];
      const stat = stats.get(feature.name);
      if (!Number.isFinite(value) || !stat) continue;
      const z = Math.max(-3, Math.min(3, (value - stat.mean) / stat.stddev));
      const oriented = z * feature.direction;
      const contribution = oriented * feature.weight;
      weighted += contribution;
      weightSum += feature.weight;
      components[feature.name] = contribution;
      featureValues[feature.name] = value;
    }

    row.model_raw_score = weightSum > 0 ? weighted / weightSum : null;
    row.model_components = components;
    row.model_feature_values = featureValues;
  }

  const trainRawScores = trainRows.map((row) => row.model_raw_score).filter(Number.isFinite).sort((a, b) => a - b);
  for (const row of rows) {
    row.risk_score = percentileScore(trainRawScores, row.model_raw_score);
    row.risk_level = row.risk_score === null ? null : riskLevel(row.risk_score);
  }
}

function summarizeByBucket(rows, label, returnKey, eventKey) {
  const valid = rows.filter((row) => Number.isFinite(row.risk_score) && Number.isFinite(row[returnKey]));
  const buckets = [
    ["0-39", (row) => row.risk_score < 40],
    ["40-59", (row) => row.risk_score >= 40 && row.risk_score < 60],
    ["60-74", (row) => row.risk_score >= 60 && row.risk_score < 75],
    ["75-89", (row) => row.risk_score >= 75 && row.risk_score < 90],
    ["90-100", (row) => row.risk_score >= 90]
  ];

  return {
    label,
    rows: valid.length,
    buckets: buckets.map(([bucket, predicate]) => {
      const group = valid.filter(predicate);
      const returns = group.map((row) => row[returnKey]);
      const events = group.filter((row) => row[eventKey] === 1).length;
      return {
        bucket,
        n: group.length,
        avgReturn: returns.length ? avg(returns) : null,
        downsideEventRate: group.length ? events / group.length : null
      };
    })
  };
}

function metricSummary(rows, scoreKey, returnKey, eventKey) {
  const valid = rows.filter((row) => Number.isFinite(row[scoreKey]) && Number.isFinite(row[returnKey]));
  return {
    n: valid.length,
    pearsonReturn: pearson(valid, scoreKey, returnKey),
    spearmanReturn: spearman(valid, scoreKey, returnKey),
    aucDownside: auc(valid, scoreKey, eventKey)
  };
}

loadEnv(".env.local");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase environment variables.");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const [
  indexRows,
  liquidityRows,
  creditRows,
  cmaRows,
  flowRows,
  breadthRows,
  capRows,
  m2Rows,
  oldRiskRows
] = await Promise.all([
  selectAll(supabase, "market_index_daily", "trade_date,market,close,volume,trading_value_million_krw"),
  selectAll(supabase, "market_liquidity_daily", "*"),
  selectAll(supabase, "market_credit_balance_daily", "*"),
  selectAll(supabase, "market_cma_daily", "*"),
  selectAll(supabase, "investor_flow_daily", "*"),
  selectAll(supabase, "market_breadth_daily", "*"),
  selectAll(supabase, "market_cap_daily", "*"),
  selectAll(supabase, "market_m2_monthly", "*"),
  selectAll(supabase, "market_risk_daily", "trade_date,total_score")
]);

const kospi = indexRows
  .filter((row) => String(row.market).replace(/\s/g, "").toUpperCase() === "KOSPI" && Number.isFinite(numberOrNull(row.close)))
  .map((row) => ({
    date: row.trade_date,
    close: numberOrNull(row.close),
    volume: numberOrNull(row.volume),
    tradingValue: numberOrNull(row.trading_value_million_krw)
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

const rows = kospi.map((row, index) => {
  const closes = kospi.slice(0, index + 1).map((item) => item.close);
  const returnWindow = kospi.slice(Math.max(0, index - 19), index + 1).map((item, i, arr) => {
    if (i === 0) return null;
    return pct(item.close, arr[i - 1].close);
  }).filter(Number.isFinite);

  const ma20 = index >= 19 ? avg(closes.slice(index - 19, index + 1)) : null;
  const ma60 = index >= 59 ? avg(closes.slice(index - 59, index + 1)) : null;
  return {
    date: row.date,
    kospi_close: row.close,
    kospi_return_1d: index >= 1 ? pct(row.close, kospi[index - 1].close) : null,
    kospi_return_5d: index >= 5 ? pct(row.close, kospi[index - 5].close) : null,
    kospi_return_20d: index >= 20 ? pct(row.close, kospi[index - 20].close) : null,
    kospi_ma20_gap: ma20 ? ((row.close - ma20) / ma20) * 100 : null,
    kospi_ma60_gap: ma60 ? ((row.close - ma60) / ma60) * 100 : null,
    kospi_volatility_20d: stddev(returnWindow),
    forward_return_5d: index + 5 < kospi.length ? pct(kospi[index + 5].close, row.close) : null,
    forward_return_20d: index + TARGET_HORIZON < kospi.length ? pct(kospi[index + TARGET_HORIZON].close, row.close) : null
  };
});

for (const row of rows) {
  row.downside_event_5d = Number.isFinite(row.forward_return_5d) ? (row.forward_return_5d <= TARGET_THRESHOLD_PCT ? 1 : 0) : null;
  row.downside_severity_20d = Number.isFinite(row.forward_return_20d) ? -row.forward_return_20d : null;
  row.downside_event_20d = Number.isFinite(row.forward_return_20d) ? (row.forward_return_20d <= TARGET_THRESHOLD_PCT ? 1 : 0) : null;
  row.current_downside_severity_20d = Number.isFinite(row.kospi_return_20d) ? -row.kospi_return_20d : null;
  row.current_downside_event_20d = Number.isFinite(row.kospi_return_20d) ? (row.kospi_return_20d <= TARGET_THRESHOLD_PCT ? 1 : 0) : null;
}

addRollingFeature(rows, "investor_deposit", groupByDate(liquidityRows, (row) => numberOrNull(row.investor_deposit_million_krw)));
addRollingFeature(rows, "derivatives_deposit", groupByDate(liquidityRows, (row) => numberOrNull(row.derivatives_deposit_million_krw)));
addRollingFeature(rows, "rp_balance", groupByDate(liquidityRows, (row) => numberOrNull(row.rp_balance_million_krw)));
addRollingFeature(rows, "unsettled_balance", groupByDate(liquidityRows, (row) => numberOrNull(row.unsettled_balance_million_krw)));
addRollingFeature(rows, "credit_loan", groupByDate(creditRows, (row) => numberOrNull(row.credit_loan_million_krw)));
addRollingFeature(rows, "credit_total", groupByDate(creditRows, (row) => numberOrNull(row.total_credit_million_krw)));
addRollingFeature(rows, "cma_balance", groupByDate(cmaRows, (row) => numberOrNull(row.cma_balance_million_krw ?? row.total_million_krw)));
addRollingFeature(rows, "m2", groupByDate(m2Rows, (row) => numberOrNull(row.m2_billion_krw)), [20, 60]);

const kospiCap = groupByDate(capRows.filter((row) => String(row.market).toUpperCase() === "KOSPI"), (row) => numberOrNull(row.market_cap_million_krw));
const kosdaqCap = groupByDate(capRows.filter((row) => String(row.market).toUpperCase() === "KOSDAQ"), (row) => numberOrNull(row.market_cap_million_krw));
addRollingFeature(rows, "kospi_market_cap", kospiCap);
addRollingFeature(rows, "kosdaq_market_cap", kosdaqCap);

for (const market of ["KOSPI", "KOSDAQ"]) {
  const marketKey = market.toLowerCase();
  const marketBreadth = breadthRows.filter((row) => String(row.market).toUpperCase() === market);
  addRollingFeature(rows, `${marketKey}_advance_ratio`, groupByDate(marketBreadth, (row) => {
    const adv = numberOrNull(row.advancers);
    const dec = numberOrNull(row.decliners);
    const unch = numberOrNull(row.unchanged);
    const total = (adv ?? 0) + (dec ?? 0) + (unch ?? 0);
    return total > 0 ? adv / total : null;
  }));
  addRollingFeature(rows, `${marketKey}_decliner_ratio`, groupByDate(marketBreadth, (row) => {
    const adv = numberOrNull(row.advancers);
    const dec = numberOrNull(row.decliners);
    const unch = numberOrNull(row.unchanged);
    const total = (adv ?? 0) + (dec ?? 0) + (unch ?? 0);
    return total > 0 ? dec / total : null;
  }));
  addRollingFeature(rows, `${marketKey}_breadth_trading_value`, groupByDate(marketBreadth, (row) => numberOrNull(row.trading_value_million_krw)));
}

for (const market of ["KOSPI", "KOSDAQ"]) {
  const marketKey = market.toLowerCase();
  const marketFlow = flowRows.filter((row) => String(row.market).replace(/\s/g, "").toUpperCase() === market);
  const foreign = groupByDate(marketFlow, (row) => numberOrNull(row.foreign_net_buy ?? row.net_buy_amount_million_krw));
  const institution = groupByDate(marketFlow, (row) => numberOrNull(row.institution_net_buy));
  const individual = groupByDate(marketFlow, (row) => numberOrNull(row.individual_net_buy));
  for (let i = 0; i < rows.length; i += 1) {
    rows[i][`${marketKey}_foreign_5d`] = rollingSum(rows, foreign, i, 5);
    rows[i][`${marketKey}_foreign_20d`] = rollingSum(rows, foreign, i, 20);
    rows[i][`${marketKey}_institution_5d`] = rollingSum(rows, institution, i, 5);
    rows[i][`${marketKey}_institution_20d`] = rollingSum(rows, institution, i, 20);
    rows[i][`${marketKey}_individual_5d`] = rollingSum(rows, individual, i, 5);
    rows[i][`${marketKey}_individual_20d`] = rollingSum(rows, individual, i, 20);
  }
}

const oldRiskByDate = groupByDate(oldRiskRows, (row) => numberOrNull(row.total_score));
for (const row of rows) {
  const deposit = row.investor_deposit;
  const credit = row.credit_loan;
  const cap = row.kospi_market_cap;
  const kosdaq = row.kosdaq_market_cap;
  const m2 = row.m2;
  row.credit_to_deposit = Number.isFinite(credit) && Number.isFinite(deposit) && deposit > 0 ? credit / deposit : null;
  row.deposit_to_total_cap = Number.isFinite(deposit) && Number.isFinite(cap) && Number.isFinite(kosdaq) && cap + kosdaq > 0 ? deposit / (cap + kosdaq) : null;
  row.credit_to_total_cap = Number.isFinite(credit) && Number.isFinite(cap) && Number.isFinite(kosdaq) && cap + kosdaq > 0 ? credit / (cap + kosdaq) : null;
  row.deposit_to_m2 = Number.isFinite(deposit) && Number.isFinite(m2) && m2 > 0 ? deposit / (m2 * 1000) : null;
  row.old_risk_score = oldRiskByDate.get(row.date) ?? null;
}

const candidateFeatures = [
  "investor_deposit_pct20d",
  "investor_deposit_pct60d",
  "derivatives_deposit_pct20d",
  "rp_balance_pct20d",
  "cma_balance_pct20d",
  "credit_loan_pct20d",
  "credit_total_pct20d",
  "credit_to_deposit",
  "deposit_to_total_cap",
  "credit_to_total_cap",
  "deposit_to_m2",
  "kospi_advance_ratio",
  "kospi_decliner_ratio",
  "kospi_breadth_trading_value_pct20d",
  "kosdaq_advance_ratio",
  "kosdaq_decliner_ratio",
  "kospi_foreign_5d",
  "kospi_foreign_20d",
  "kospi_institution_5d",
  "kospi_institution_20d",
  "kospi_individual_5d",
  "kospi_individual_20d",
  "kosdaq_foreign_20d",
  "kosdaq_institution_20d",
  "kosdaq_individual_20d"
];

const labeledRows = rows.filter((row) => Number.isFinite(row.current_downside_severity_20d));
const trainCutoff = Math.floor(labeledRows.length * TRAIN_RATIO);
const trainRows = labeledRows.slice(0, trainCutoff);
const testRows = labeledRows.slice(trainCutoff);

const featureStats = candidateFeatures
  .map((name) => {
    const n = trainRows.filter((row) => Number.isFinite(row[name])).length;
    const corr = pearson(trainRows, name, "current_downside_severity_20d");
    const rankCorr = spearman(trainRows, name, "current_downside_severity_20d");
    return {
      name,
      n,
      corr,
      rankCorr,
      direction: corr === null ? 0 : Math.sign(corr),
      weight: corr === null ? 0 : Math.abs(corr)
    };
  })
  .filter((feature) => feature.n >= 100 && feature.weight >= 0.05)
  .sort((a, b) => b.weight - a.weight);

const selectedFeatures = [];
for (const feature of featureStats) {
  const isDuplicateFamily = selectedFeatures.some((existing) => {
    const a = existing.name.replace(/_(5|20|60)d|_pct(1|5|20|60)d/g, "");
    const b = feature.name.replace(/_(5|20|60)d|_pct(1|5|20|60)d/g, "");
    return a === b;
  });
  if (!isDuplicateFamily || selectedFeatures.length < 4) {
    selectedFeatures.push(feature);
  }
  if (selectedFeatures.length >= MAX_FEATURES) break;
}

modelRowsWithScores(rows, selectedFeatures, trainRows);

const outputRows = rows.filter((row) => Number.isFinite(row.risk_score));
const metrics = {
  scope: {
    startDate: rows[0]?.date ?? null,
    endDate: rows.at(-1)?.date ?? null,
    kospiRows: kospi.length,
    labeledRows: labeledRows.length,
    trainRows: trainRows.length,
    testRows: testRows.length,
    target: `current_${TARGET_HORIZON}d_return <= ${TARGET_THRESHOLD_PCT}%`
  },
  sourceRows: {
    index: indexRows.length,
    liquidity: liquidityRows.length,
    credit: creditRows.length,
    cma: cmaRows.length,
    flow: flowRows.length,
    breadth: breadthRows.length,
    cap: capRows.length,
    m2: m2Rows.length,
    oldRisk: oldRiskRows.length
  },
  selectedFeatures: selectedFeatures.map(({ name, n, corr, rankCorr, direction, weight }) => ({
    name,
    n,
    corrWithCurrentDownside20d: corr,
    spearmanWithCurrentDownside20d: rankCorr,
    direction,
    weight
  })),
  model: {
    train: metricSummary(trainRows, "risk_score", "kospi_return_20d", "current_downside_event_20d"),
    test: metricSummary(testRows, "risk_score", "kospi_return_20d", "current_downside_event_20d"),
    all: metricSummary(labeledRows, "risk_score", "kospi_return_20d", "current_downside_event_20d"),
    forward5ValidationAll: metricSummary(labeledRows, "risk_score", "forward_return_5d", "downside_event_5d"),
    forward5ValidationTest: metricSummary(testRows, "risk_score", "forward_return_5d", "downside_event_5d"),
    forwardValidationAll: metricSummary(labeledRows, "risk_score", "forward_return_20d", "downside_event_20d"),
    forwardValidationTest: metricSummary(testRows, "risk_score", "forward_return_20d", "downside_event_20d"),
    bucketsTrain: summarizeByBucket(trainRows, "train", "kospi_return_20d", "current_downside_event_20d"),
    bucketsTest: summarizeByBucket(testRows, "test", "kospi_return_20d", "current_downside_event_20d"),
    bucketsAll: summarizeByBucket(labeledRows, "all", "kospi_return_20d", "current_downside_event_20d")
  },
  oldRisk: {
    all: metricSummary(labeledRows, "old_risk_score", "kospi_return_20d", "current_downside_event_20d"),
    test: metricSummary(testRows, "old_risk_score", "kospi_return_20d", "current_downside_event_20d"),
    forward5ValidationAll: metricSummary(labeledRows, "old_risk_score", "forward_return_5d", "downside_event_5d"),
    forward5ValidationTest: metricSummary(testRows, "old_risk_score", "forward_return_5d", "downside_event_5d"),
    forwardValidationAll: metricSummary(labeledRows, "old_risk_score", "forward_return_20d", "downside_event_20d"),
    forwardValidationTest: metricSummary(testRows, "old_risk_score", "forward_return_20d", "downside_event_20d")
  },
  latest: outputRows.at(-1)
    ? {
        date: outputRows.at(-1).date,
        kospiClose: outputRows.at(-1).kospi_close,
        riskScore: outputRows.at(-1).risk_score,
        riskLevel: outputRows.at(-1).risk_level,
        rawScore: outputRows.at(-1).model_raw_score,
        components: outputRows.at(-1).model_components
      }
    : null
};

if (shouldWriteJson) {
  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync("tmp/kospi-risk-model-v1-analysis.json", JSON.stringify({ metrics, rows: outputRows }, null, 2));
}

if (shouldSave) {
  const runPayload = {
    model_version: MODEL_VERSION,
    model_name: "KOSPI Risk State Index",
    target_name: "kospi_current_20d_downside_state",
    target_description: "Current KOSPI 20-trading-day return is less than or equal to -3%. This is a state model, not a future prediction model.",
    target_horizon_days: TARGET_HORIZON,
    target_threshold_pct: TARGET_THRESHOLD_PCT,
    feature_names: selectedFeatures.map((feature) => feature.name),
    coefficients: Object.fromEntries(selectedFeatures.map((feature) => [feature.name, { direction: feature.direction, weight: feature.weight }])),
    metrics,
    notes: "Data-driven first-pass KOSPI downside state model. Source market tables are read-only; output is versioned."
  };
  const runResult = await supabase.from("kospi_risk_state_model_runs").upsert(runPayload, { onConflict: "model_version" });
  if (runResult.error) throw new Error(`kospi_risk_state_model_runs upsert failed: ${runResult.error.message}`);

  const payload = outputRows.map((row) => ({
    trade_date: row.date,
    model_version: MODEL_VERSION,
    kospi_close: row.kospi_close,
    risk_score: row.risk_score,
    risk_level: row.risk_level,
    summary: `KOSPI 위험 상태 지수는 ${Math.round(row.risk_score)}점, ${row.risk_level} 단계입니다.`,
    components: row.model_components,
    feature_values: row.model_feature_values,
    kospi_return_5d: row.kospi_return_5d,
    kospi_return_20d: row.kospi_return_20d,
    kospi_forward_return_5d: row.forward_return_5d,
    kospi_forward_return_20d: row.forward_return_20d,
    updated_at: new Date().toISOString()
  }));

  const pageSize = 500;
  for (let i = 0; i < payload.length; i += pageSize) {
    const page = payload.slice(i, i + pageSize);
    const result = await supabase.from("kospi_risk_state_daily").upsert(page, { onConflict: "trade_date,model_version" });
    if (result.error) throw new Error(`kospi_risk_state_daily upsert failed: ${result.error.message}`);
  }
}

console.log(JSON.stringify(metrics, null, 2));
