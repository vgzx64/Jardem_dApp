/**
 * Load Test: Run E2E scenario 30 times under identical conditions.
 * Captures: Success Rate, State Discrepancies, p50 latency, p95 latency.
 */

const MEDICAL = "http://localhost:3001";
const LOGISTICS = "http://localhost:3002";
const INTEGRATION = "http://localhost:3003";

const ITERATIONS = 30;
const latencies = [];
let successes = 0;
let failures = 0;
let discrepancies = 0;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: {"Content-Type": "application/json", ...opts.headers},
    ...opts,
  });
  const body = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : await res.text();
  return {status: res.status, body};
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function runE2E(iteration) {
  const start = Date.now();
  const eventId = `evt-load-${iteration}-${Date.now()}`;
  const operationId = `op-load-${iteration}-${Date.now()}`;

  try {
    // Create medical call
    const mRes = await fetchJson(`${MEDICAL}/calls`, {
      method: "POST",
      body: JSON.stringify({eventId, operationId, priority: "URGENT", payload: {load: iteration}}),
    });
    if (mRes.status !== 201) throw new Error(`Medical: ${mRes.status}`);

    // Create logistics assignment
    const lRes = await fetchJson(`${LOGISTICS}/assignments`, {
      method: "POST",
      body: JSON.stringify({eventId, operationId, crewId: `crew-${iteration}`, payload: {load: iteration}}),
    });
    if (lRes.status !== 201) throw new Error(`Logistics: ${lRes.status}`);

    // Check for state discrepancy: medical DISPATCHED but logistics UNASSIGNED
    const mRecord = await fetchJson(`${MEDICAL}/calls/${eventId}`);
    const lRecord = await fetchJson(`${LOGISTICS}/assignments/${eventId}`);
    if (mRecord.body.status === "DISPATCHED" && lRecord.body.status === "UNASSIGNED") {
      discrepancies++;
    }

    // Push to integration layer
    const iRes = await fetchJson(`${INTEGRATION}/events`, {
      method: "POST",
      body: JSON.stringify({eventId, operationId, module: "medical", payload: {}}),
    });
    if (iRes.status !== 202 && iRes.status !== 200) throw new Error(`Integration: ${iRes.status}`);

    successes++;
  } catch (err) {
    failures++;
    console.error(`  Iteration ${iteration} failed: ${err.message}`);
  }

  latencies.push(Date.now() - start);
}

async function main() {
  console.log(`Running load test: ${ITERATIONS} E2E iterations\n`);

  for (let i = 1; i <= ITERATIONS; i++) {
    await runE2E(i);
    if (i % 5 === 0) console.log(`  Completed ${i}/${ITERATIONS}`);
  }

  latencies.sort((a, b) => a - b);
  const successRate = ((successes / ITERATIONS) * 100).toFixed(2);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);

  console.log("\n=== Load Test Results ===");
  console.log(`Total iterations:   ${ITERATIONS}`);
  console.log(`Successes:          ${successes}`);
  console.log(`Failures:           ${failures}`);
  console.log(`Success rate:       ${successRate}%`);
  console.log(`State discrepancies: ${discrepancies}`);
  console.log(`p50 latency:        ${p50}ms`);
  console.log(`p95 latency:        ${p95}ms`);
  console.log(`Avg latency:        ${avgLatency}ms`);

  const exitCode = failures > 0 || discrepancies > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Load test error:", err);
  process.exit(1);
});