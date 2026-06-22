import type {
  InvestorFlowDaily,
  MarketBreadthDaily,
  MarketCapDaily,
  MarketCmaDaily,
  MarketCreditBalanceDaily,
  MarketIndexDaily,
  MarketLiquidityDaily,
  MarketM2Monthly,
  RiskLevel
} from "@/types/market";

type ModelRow = {
  tradeDate: string;
  kospiClose: number;
  kospiReturn20d: number | null;
  totalScore: number;
  riskLevel: RiskLevel;
  summary: string;
  components: Record<string, number>;
};

type FeatureRow = {
  [key: string]: number | string | null | undefined | Record<string, number>;
  tradeDate: string;
  kospiClose: number;
  kospiReturn20d: number | null;
  currentDownside20d: number | null;
  rawScore?: number | null;
  components?: Record<string, number>;
};

const TARGET_THRESHOLD_PCT = -3;
const TRAIN_RATIO = 0.75;
const MAX_FEATURES = 10;

const candidateFeatures = [
  "investorDepositPct20d",
  "investorDepositPct60d",
  "derivativesDepositPct20d",
  "rpBalancePct20d",
  "cmaBalancePct20d",
  "creditLoanPct20d",
  "creditTotalPct20d",
  "creditToDeposit",
  "depositToTotalCap",
  "creditToTotalCap",
  "depositToM2",
  "kospiAdvanceRatio",
  "kospiDeclinerRatio",
  "kospiBreadthTradingValuePct20d",
  "kosdaqAdvanceRatio",
  "kosdaqDeclinerRatio",
  "kospiForeign5d",
  "kospiForeign20d",
  "kospiInstitution5d",
  "kospiInstitution20d",
  "kospiIndividual5d",
  "kospiIndividual20d",
  "kosdaqForeign20d",
  "kosdaqInstitution20d",
  "kosdaqIndividual20d"
];

const featureLabels: Record<string, string> = {
  kospiForeign20d: "KOSPI 외국인 20일 누적",
  depositToTotalCap: "예탁금/시총 비율",
  kospiForeign5d: "KOSPI 외국인 5일 누적",
  investorDepositPct20d: "투자자예탁금 20일 변화",
  rpBalancePct20d: "RP 잔고 20일 변화",
  kosdaqForeign20d: "KOSDAQ 외국인 20일 누적",
  kospiIndividual20d: "KOSPI 개인 20일 누적",
  kospiInstitution5d: "KOSPI 기관 5일 누적",
  kosdaqInstitution20d: "KOSDAQ 기관 20일 누적",
  derivativesDepositPct20d: "파생상품 예수금 20일 변화"
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = avg(values);
  if (mean === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function pct(current: number | null | undefined, previous: number | null | undefined): number | null {
  return isNumber(current) && isNumber(previous) && previous !== 0 ? (current / previous - 1) * 100 : null;
}

function pearson(rows: FeatureRow[], xKey: string, yKey: string): number | null {
  const data = rows.filter((row) => isNumber(row[xKey]) && isNumber(row[yKey])) as Array<FeatureRow & Record<string, number>>;
  if (data.length < 30) return null;
  const meanX = avg(data.map((row) => row[xKey]));
  const meanY = avg(data.map((row) => row[yKey]));
  if (meanX === null || meanY === null) return null;

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

function percentileScore(sortedValues: number[], value: number | null): number | null {
  if (!isNumber(value) || sortedValues.length === 0) return null;
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(100, (lo / sortedValues.length) * 100));
}

function riskLevel(score: number): RiskLevel {
  if (score >= 90) return "crisis";
  if (score >= 75) return "danger";
  if (score >= 60) return "warning";
  if (score >= 40) return "caution";
  return "stable";
}

function byDate<T extends { tradeDate: string }>(rows: T[], valueFn: (row: T) => number | null | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = valueFn(row);
    if (isNumber(value)) map.set(row.tradeDate, value);
  }
  return map;
}

function addRollingFeature(rows: FeatureRow[], name: string, valuesByDate: Map<string, number>, windows = [20, 60]) {
  const series = rows.map((row) => ({ tradeDate: row.tradeDate, value: valuesByDate.get(row.tradeDate) ?? null }));
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i].value;
    rows[i][name] = isNumber(value) ? value : null;
    for (const window of windows) {
      rows[i][`${name}Pct${window}d`] = i >= window ? pct(value, series[i - window].value) : null;
    }
  }
}

function rollingSum(rows: FeatureRow[], valuesByDate: Map<string, number>, index: number, window: number): number | null {
  if (index < window - 1) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = valuesByDate.get(rows[i].tradeDate);
    if (!isNumber(value)) return null;
    sum += value;
  }
  return sum;
}

function selectFeatures(trainRows: FeatureRow[]) {
  const stats = candidateFeatures
    .map((name) => {
      const n = trainRows.filter((row) => isNumber(row[name])).length;
      const corr = pearson(trainRows, name, "currentDownside20d");
      return {
        name,
        n,
        direction: corr === null ? 0 : Math.sign(corr),
        weight: corr === null ? 0 : Math.abs(corr)
      };
    })
    .filter((feature) => feature.n >= 100 && feature.weight >= 0.05)
    .sort((a, b) => b.weight - a.weight);

  const selected: typeof stats = [];
  for (const feature of stats) {
    selected.push(feature);
    if (selected.length >= MAX_FEATURES) break;
  }
  return selected;
}

function buildSummary(row: ModelRow): string {
  const top = Object.entries(row.components)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([key]) => featureLabels[key] ?? key);

  const levelText: Record<RiskLevel, string> = {
    stable: "안정",
    caution: "주의",
    warning: "경고",
    danger: "위험",
    crisis: "위기"
  };

  const drivers = top.length > 0 ? `주요 기여 지표는 ${top.join(", ")}입니다.` : "주요 기여 지표가 제한적입니다.";
  return `KOSPI 위험 상태 지수는 ${Math.round(row.totalScore)}점, ${levelText[row.riskLevel]} 단계입니다. ${drivers}`;
}

export function buildKospiRiskStateSeries(params: {
  liquidityRows: MarketLiquidityDaily[];
  creditRows: MarketCreditBalanceDaily[];
  cmaRows: MarketCmaDaily[];
  indexRows: MarketIndexDaily[];
  flowRows: InvestorFlowDaily[];
  breadthRows: MarketBreadthDaily[];
  marketCapRows: MarketCapDaily[];
  m2Rows: MarketM2Monthly[];
}): ModelRow[] {
  const kospi = [...params.indexRows]
    .filter((row) => String(row.market).replace(/\s/g, "").toUpperCase() === "KOSPI" && isNumber(row.close))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  const rows: FeatureRow[] = kospi.map((row, index) => ({
    tradeDate: row.tradeDate,
    kospiClose: row.close as number,
    kospiReturn20d: index >= 20 ? pct(row.close, kospi[index - 20].close) : null,
    currentDownside20d: index >= 20 && isNumber(row.close) && isNumber(kospi[index - 20].close) ? -pct(row.close, kospi[index - 20].close)! : null
  }));

  addRollingFeature(rows, "investorDeposit", byDate(params.liquidityRows, (row) => row.investorDepositMillionKrw));
  addRollingFeature(rows, "derivativesDeposit", byDate(params.liquidityRows, (row) => row.derivativesDepositMillionKrw));
  addRollingFeature(rows, "rpBalance", byDate(params.liquidityRows, (row) => row.rpBalanceMillionKrw));
  addRollingFeature(rows, "cmaBalance", byDate(params.cmaRows, (row) => row.totalMillionKrw));
  addRollingFeature(rows, "creditLoan", byDate(params.creditRows, (row) => row.creditLoanMillionKrw));
  addRollingFeature(rows, "creditTotal", byDate(params.creditRows, (row) => row.totalCreditMillionKrw));
  addRollingFeature(rows, "m2", byDate(params.m2Rows, (row) => row.m2BillionKrw), [20, 60]);

  const kospiCap = byDate(params.marketCapRows.filter((row) => row.market === "KOSPI"), (row) => row.marketCapMillionKrw);
  const kosdaqCap = byDate(params.marketCapRows.filter((row) => row.market === "KOSDAQ"), (row) => row.marketCapMillionKrw);

  for (const row of rows) {
    const deposit = row.investorDeposit;
    const credit = row.creditLoan;
    const cap = kospiCap.get(row.tradeDate);
    const kosdaq = kosdaqCap.get(row.tradeDate);
    const m2 = row.m2;
    row.creditToDeposit = isNumber(credit) && isNumber(deposit) && deposit > 0 ? credit / deposit : null;
    row.depositToTotalCap = isNumber(deposit) && isNumber(cap) && isNumber(kosdaq) && cap + kosdaq > 0 ? deposit / (cap + kosdaq) : null;
    row.creditToTotalCap = isNumber(credit) && isNumber(cap) && isNumber(kosdaq) && cap + kosdaq > 0 ? credit / (cap + kosdaq) : null;
    row.depositToM2 = isNumber(deposit) && isNumber(m2) && m2 > 0 ? deposit / (m2 * 1000) : null;
  }

  for (const market of ["KOSPI", "KOSDAQ"]) {
    const key = market.toLowerCase();
    const breadth = params.breadthRows.filter((row) => String(row.market).toUpperCase() === market);
    addRollingFeature(rows, `${key}AdvanceRatio`, byDate(breadth, (row) => {
      const total = (row.advancers ?? 0) + (row.decliners ?? 0) + (row.unchanged ?? 0);
      return total > 0 && row.advancers !== null ? row.advancers / total : null;
    }));
    addRollingFeature(rows, `${key}DeclinerRatio`, byDate(breadth, (row) => {
      const total = (row.advancers ?? 0) + (row.decliners ?? 0) + (row.unchanged ?? 0);
      return total > 0 && row.decliners !== null ? row.decliners / total : null;
    }));
    addRollingFeature(rows, `${key}BreadthTradingValue`, byDate(breadth, (row) => row.tradingValueMillionKrw));
  }

  for (const market of ["KOSPI", "KOSDAQ"]) {
    const key = market.toLowerCase();
    const flows = params.flowRows.filter((row) => String(row.market).replace(/\s/g, "").toUpperCase() === market);
    const foreign = byDate(flows, (row) => row.foreignNetBuy);
    const institution = byDate(flows, (row) => row.institutionNetBuy);
    const individual = byDate(flows, (row) => row.individualNetBuy);
    for (let i = 0; i < rows.length; i += 1) {
      rows[i][`${key}Foreign5d`] = rollingSum(rows, foreign, i, 5);
      rows[i][`${key}Foreign20d`] = rollingSum(rows, foreign, i, 20);
      rows[i][`${key}Institution5d`] = rollingSum(rows, institution, i, 5);
      rows[i][`${key}Institution20d`] = rollingSum(rows, institution, i, 20);
      rows[i][`${key}Individual5d`] = rollingSum(rows, individual, i, 5);
      rows[i][`${key}Individual20d`] = rollingSum(rows, individual, i, 20);
    }
  }

  const labeledRows = rows.filter((row) => isNumber(row.currentDownside20d));
  const trainRows = labeledRows.slice(0, Math.floor(labeledRows.length * TRAIN_RATIO));
  const selectedFeatures = selectFeatures(trainRows);
  const featureStats = new Map(
    selectedFeatures.map((feature) => {
      const values = trainRows.map((row) => row[feature.name]).filter(isNumber);
      return [feature.name, { mean: avg(values) ?? 0, stddev: stddev(values) || 1 }];
    })
  );

  for (const row of rows) {
    let weighted = 0;
    let weightSum = 0;
    const components: Record<string, number> = {};
    for (const feature of selectedFeatures) {
      const value = row[feature.name];
      const stats = featureStats.get(feature.name);
      if (!isNumber(value) || !stats) continue;
      const z = Math.max(-3, Math.min(3, (value - stats.mean) / stats.stddev));
      const contribution = z * feature.direction * feature.weight;
      weighted += contribution;
      weightSum += feature.weight;
      components[feature.name] = contribution;
    }
    row.rawScore = weightSum > 0 ? weighted / weightSum : null;
    row.components = components;
  }

  const trainRawScores = trainRows.map((row) => row.rawScore).filter(isNumber).sort((a, b) => a - b);
  return rows
    .map((row) => {
      const score = percentileScore(trainRawScores, row.rawScore ?? null);
      if (score === null) return null;
      const modelRow: ModelRow = {
        tradeDate: row.tradeDate,
        kospiClose: row.kospiClose,
        kospiReturn20d: row.kospiReturn20d,
        totalScore: Number(score.toFixed(1)),
        riskLevel: riskLevel(score),
        summary: "",
        components: row.components as Record<string, number>
      };
      modelRow.summary = buildSummary(modelRow);
      return modelRow;
    })
    .filter((row): row is ModelRow => row !== null);
}
