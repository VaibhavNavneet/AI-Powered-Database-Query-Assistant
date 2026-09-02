import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const inputPath = process.argv[3] || "test_queries.txt";
const resultsPath = path.join(root, "eval", "results.json");
const reportPath = path.join(root, "EVALUATION_REPORT.md");

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const fullPath = path.join(root, filename);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function inferCategory(question) {
  const q = question.toLowerCase();
  if (/\b(join|customer|employee|office|product line|sales by)\b/.test(q)) return "join";
  if (/\b(total|sum|average|avg|count|maximum|minimum|highest|lowest|number of)\b/.test(q)) return "aggregation";
  if (/\b(year|month|date|between|during|in 20\d\d)\b/.test(q)) return "date";
  if (/\b(top|bottom|most|least|highest|lowest|rank)\b/.test(q)) return "ranking";
  if (/\b(list|show|find|get|which)\b/.test(q)) return "filter";
  return "other";
}

function parseQueries(text) {
  const queries = [];
  let category = "uncategorized";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const numbered = line.match(/^\d+[.)]\s*(.*)$/);
    if (numbered && !numbered[1].includes("?")) {
      category = numbered[1].trim();
      continue;
    }

    const question = (numbered ? numbered[1] : line).trim();
    queries.push({
      id: `q_${String(queries.length + 1).padStart(3, "0")}`,
      category: category === "uncategorized" ? inferCategory(question) : category,
      question,
    });
  }

  return queries;
}

function readJsonIfPresent(filename) {
  const fullPath = path.join(root, filename);
  return fs.existsSync(fullPath) ? JSON.parse(fs.readFileSync(fullPath, "utf8")) : null;
}

function numeric(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

function valuesEqual(actual, expected) {
  const aNumber = numeric(actual);
  const eNumber = numeric(expected);
  if (aNumber !== null && eNumber !== null) return Math.abs(aNumber - eNumber) <= 0.000001;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    return actual.every((value, index) => valuesEqual(value, expected[index]));
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    return actualKeys.join("\0") === expectedKeys.join("\0") && expectedKeys.every((key) => valuesEqual(actual[key], expected[key]));
  }
  return actual === expected;
}

function resultsEqual(actual, expected, ordered = false) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
  if (ordered) return valuesEqual(actual, expected);
  const sortRows = (rows) => rows.map((row) => JSON.stringify(row, Object.keys(row).sort())).sort();
  return valuesEqual(sortRows(actual), sortRows(expected));
}

function percentile(values, fraction) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
}

function classifyFailure(error) {
  if (!error) return null;
  if (/\b429\b|rate[ -]?limit|rate_limit_exceeded|tokens per minute|quota/i.test(error)) return "groq_rate_limit";
  try {
    const parsed = JSON.parse(error);
    if (parsed?.error?.code === 429) return "groq_rate_limit";
    if (parsed?.error?.code >= 500) return "server_error";
  } catch {
    // Keep the plain-text checks below for transport and runtime errors.
  }
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|timeout/i.test(error)) return "transport";
  return "application_error";
}

function percent(value, denominator) {
  return denominator ? `${((value / denominator) * 100).toFixed(2)}%` : "N/A";
}

loadLocalEnv();
const inputFullPath = path.join(root, inputPath);
const tests = fs.existsSync(inputFullPath) ? parseQueries(fs.readFileSync(inputFullPath, "utf8")) : [];
const gold = readJsonIfPresent("eval/gold_results.json") || {};
const results = [];
let blockedReason = null;

if (tests.length > 0) {
  for (const test of tests) {
    const started = performance.now();
    let response;
    let data = {};
    try {
      response = await fetch(`${baseUrl}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: test.question, history: [] }),
        signal: AbortSignal.timeout(70_000),
      });
      data = await response.json();
      const item = {
        ...test,
        success: response.ok,
        latencyMs: Math.round(performance.now() - started),
        serverTimingsMs: data.timingsMs || null,
        repairAttempted: Boolean(data.repairAttempted),
        resultCorrect: Object.prototype.hasOwnProperty.call(gold, test.id)
          ? resultsEqual(data.rows, gold[test.id].rows, Boolean(gold[test.id].ordered))
          : null,
        sql: data.sql || null,
        error: data.error || null,
        failureType: response.ok ? null : classifyFailure(data.error),
      };
      results.push(item);
      if (item.failureType === "groq_rate_limit") {
        blockedReason = "Groq API rate limit reached; evaluation stopped early.";
        break;
      }
    } catch (error) {
      results.push({ ...test, success: false, latencyMs: Math.round(performance.now() - started), serverTimingsMs: null, repairAttempted: false, resultCorrect: null, sql: null, error: error.message, failureType: classifyFailure(error.message) });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

const successful = results.filter((item) => item.success);
const repaired = results.filter((item) => item.repairAttempted);
const repairedSuccessfully = repaired.filter((item) => item.success);
const scored = results.filter((item) => item.resultCorrect !== null);
const correct = scored.filter((item) => item.resultCorrect);
const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
const categories = [...new Set(results.map((item) => item.category))];
const runStatus = blockedReason ? `BLOCKED — ${blockedReason}` : tests.length === 100 ? "COMPLETED" : "INCOMPLETE";
const categoryRows = categories.map((category) => {
  const group = results.filter((item) => item.category === category);
  const groupScored = group.filter((item) => item.resultCorrect !== null);
  return `| ${category} | ${group.length} | ${percent(group.filter((item) => item.success).length, group.length)} | ${groupScored.length ? percent(groupScored.filter((item) => item.resultCorrect).length, groupScored.length) : "N/A"} |`;
}).join("\n");

const report = `# NL2SQL Evaluation Report

Generated: ${new Date().toISOString()}
Endpoint: ${baseUrl}
Input: ${inputPath}
Expected questions: 100
Queries attempted: ${results.length}
Run status: ${runStatus}

## Summary

| Metric | Result |
|---|---:|
| Total queries (input) | ${tests.length} |
| Queries attempted | ${results.length} |
| Execution success (attempted) | ${percent(successful.length, results.length)} |
| Result accuracy | ${scored.length ? percent(correct.length, scored.length) : "N/A — add eval/gold_results.json"} |
| Repair attempts | ${repaired.length} |
| Repair recovery rate | ${percent(repairedSuccessfully.length, repaired.length)} |
| Median latency | ${percentile(latencies, 0.5) === null ? "N/A" : `${percentile(latencies, 0.5)} ms`} |
| p95 latency | ${percentile(latencies, 0.95) === null ? "N/A" : `${percentile(latencies, 0.95)} ms`} |

## By category

| Category | Queries | Execution success | Result accuracy |
|---|---:|---:|---:|
${categoryRows || "| No queries loaded | 0 | N/A | N/A |"}

## Interpretation

- Result accuracy is calculated only for questions present in eval/gold_results.json; execution success alone does not prove correctness.
- Repair recovery rate is successful final responses divided by responses where the API reported repairAttempted=true.
- Latency is measured end-to-end by the evaluator and includes schema loading, Groq calls, database execution, and answer generation.
- ${tests.length === 0 ? "No questions were executed because test_queries.txt is empty or missing." : "Review eval/results.json for every generated SQL query, error, latency, and correctness result."}
- ${tests.length !== 100 ? `Warning: ${tests.length} questions were parsed; expected 100. Check the input format.` : "All 100 questions were parsed successfully."}
- ${blockedReason || "No infrastructure block was detected."}
`;
fs.writeFileSync(reportPath, report);
console.log(report);
