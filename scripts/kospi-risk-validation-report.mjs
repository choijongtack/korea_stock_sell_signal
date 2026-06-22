import fs from "node:fs";
import { spawnSync } from "node:child_process";

const modelRun = spawnSync(process.execPath, ["scripts/kospi-risk-model.mjs", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

if (modelRun.status !== 0) {
  process.stderr.write(modelRun.stdout);
  process.stderr.write(modelRun.stderr);
  process.exit(modelRun.status ?? 1);
}

const artifactPath = "tmp/kospi-risk-model-v1-analysis.json";
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const rows = artifact.rows
  .filter((row) => Number.isFinite(row.risk_score))
  .sort((a, b) => a.date.localeCompare(b.date));

function avg(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function pct(count, total) {
  return total > 0 ? (count / total) * 100 : null;
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function riskBucket(score) {
  if (score >= 90) return "90-100 crisis";
  if (score >= 75) return "75-89 danger";
  if (score >= 60) return "60-74 warning";
  if (score >= 40) return "40-59 caution";
  return "0-39 stable";
}

function summarizeGroup(group) {
  return {
    n: group.length,
    avgKospiReturn5d: fmt(avg(group.map((row) => row.kospi_return_5d))),
    avgKospiReturn20d: fmt(avg(group.map((row) => row.kospi_return_20d))),
    avgForward5d: fmt(avg(group.map((row) => row.forward_return_5d))),
    avgForward20d: fmt(avg(group.map((row) => row.forward_return_20d))),
    currentDownside20dRate: fmt(pct(group.filter((row) => row.kospi_return_20d <= -3).length, group.length)),
    forwardDownside5dRate: fmt(pct(group.filter((row) => row.forward_return_5d <= -3).length, group.filter((row) => Number.isFinite(row.forward_return_5d)).length)),
    forwardDownside20dRate: fmt(pct(group.filter((row) => row.forward_return_20d <= -3).length, group.filter((row) => Number.isFinite(row.forward_return_20d)).length))
  };
}

function componentSummary(row) {
  return Object.entries(row.model_components ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([name, value]) => ({ name, contribution: fmt(value, 3) }));
}

const byBucket = {};
for (const bucket of ["0-39 stable", "40-59 caution", "60-74 warning", "75-89 danger", "90-100 crisis"]) {
  byBucket[bucket] = summarizeGroup(rows.filter((row) => riskBucket(row.risk_score) === bucket));
}

const byYear = {};
for (const year of [...new Set(rows.map((row) => row.date.slice(0, 4)))]) {
  const group = rows.filter((row) => row.date.startsWith(year));
  byYear[year] = {
    ...summarizeGroup(group),
    dangerDays: group.filter((row) => row.risk_score >= 75).length,
    crisisDays: group.filter((row) => row.risk_score >= 90).length,
    avgRiskScore: fmt(avg(group.map((row) => row.risk_score)))
  };
}

const topCrisisDates = [...rows]
  .sort((a, b) => b.risk_score - a.risk_score || a.date.localeCompare(b.date))
  .slice(0, 30)
  .map((row) => ({
    date: row.date,
    score: fmt(row.risk_score, 1),
    level: row.risk_level,
    kospiClose: row.kospi_close,
    kospiReturn20d: fmt(row.kospi_return_20d),
    forward5d: fmt(row.forward_return_5d),
    forward20d: fmt(row.forward_return_20d),
    topComponents: componentSummary(row)
  }));

const scoreJumpDates = rows
  .map((row, index) => {
    const prev = index > 0 ? rows[index - 1] : null;
    return {
      ...row,
      scoreChange1d: prev ? row.risk_score - prev.risk_score : null
    };
  })
  .filter((row) => Number.isFinite(row.scoreChange1d))
  .sort((a, b) => b.scoreChange1d - a.scoreChange1d)
  .slice(0, 30)
  .map((row) => ({
    date: row.date,
    score: fmt(row.risk_score, 1),
    scoreChange1d: fmt(row.scoreChange1d, 1),
    kospiReturn20d: fmt(row.kospi_return_20d),
    forward5d: fmt(row.forward_return_5d),
    forward20d: fmt(row.forward_return_20d),
    topComponents: componentSummary(row)
  }));

const downsideWindows = rows
  .filter((row) => row.kospi_return_20d <= -3)
  .map((row) => ({
    date: row.date,
    score: fmt(row.risk_score, 1),
    level: row.risk_level,
    kospiReturn20d: fmt(row.kospi_return_20d),
    topComponents: componentSummary(row)
  }));

const monthlyCrisisCounts = {};
for (const row of rows.filter((item) => item.risk_score >= 90)) {
  const month = row.date.slice(0, 7);
  monthlyCrisisCounts[month] = (monthlyCrisisCounts[month] ?? 0) + 1;
}

const report = {
  modelScope: artifact.metrics.scope,
  selectedFeatures: artifact.metrics.selectedFeatures,
  bucketValidation: byBucket,
  yearlyValidation: byYear,
  topCrisisDates,
  largestScoreJumps: scoreJumpDates,
  downsideWindowSample: downsideWindows.slice(0, 60),
  monthlyCrisisCounts: Object.fromEntries(Object.entries(monthlyCrisisCounts).sort((a, b) => a[0].localeCompare(b[0]))),
  interpretationChecks: {
    crisisBucketLooksUseful: byBucket["90-100 crisis"].currentDownside20dRate >= 45,
    dangerBucketNeedsReview: byBucket["75-89 danger"].avgKospiReturn20d > 0,
    forwardPredictionWeak: artifact.metrics.model.forwardValidationAll.aucDownside < 0.6,
    forward5PredictionWeak: artifact.metrics.model.forward5ValidationAll.aucDownside < 0.6
  }
};

fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync("tmp/kospi-risk-validation-report.json", JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
