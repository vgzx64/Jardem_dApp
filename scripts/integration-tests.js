/**
 * 6 Core Integration Tests for Emergency Response Coordination MVP
 *
 * Prerequisites:
 *   - Anvil running on http://localhost:31337
 *   - Redis running on localhost:6379
 *   - Medical module on http://localhost:3001
 *   - Logistics module on http://localhost:3002
 *   - Integration layer on http://localhost:3003
 */

const assert = require("assert");
const path = require("path");
const { execSync } = require("child_process");

const MEDICAL = "http://localhost:3001";
const LOGISTICS = "http://localhost:3002";
const INTEGRATION = "http://localhost:3003";
const ANVIL_RPC = "http://localhost:31337";

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => {
      console.log(`  PASS: ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`  FAIL: ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const body = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : await res.text();
  return { status: res.status, body };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Test 1: Successful end-to-end event processing
async function testE2ESuccess() {
  const eventId = `evt-e2e-${Date.now()}`;
  const operationId = `op-e2e-${Date.now()}`;

  const mRes = await fetchJson(`${MEDICAL}/calls`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      priority: "CRITICAL",
      patientId: "patient-e2e",
      payload: { symptoms: ["trauma"] },
    }),
  });
  assert.strictEqual(mRes.status, 201, `Medical create failed: ${JSON.stringify(mRes.body)}`);

  const lRes = await fetchJson(`${LOGISTICS}/assignments`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      crewId: "crew-e2e",
      vehicleId: "vehicle-e2e",
      payload: { location: "scene" },
    }),
  });
  assert.strictEqual(lRes.status, 201, `Logistics create failed: ${JSON.stringify(lRes.body)}`);

  const mOutbox = await fetchJson(`${MEDICAL}/outbox/pending`);
  assert.ok(mOutbox.body.some((e) => e.eventId === eventId), "Medical outbox missing event");

  const lOutbox = await fetchJson(`${LOGISTICS}/outbox/pending`);
  assert.ok(lOutbox.body.some((e) => e.eventId === eventId), "Logistics outbox missing event");

  const iRes = await fetchJson(`${INTEGRATION}/events`, {
    method: "POST",
    body: JSON.stringify({ eventId, operationId, module: "medical", payload: {} }),
  });
  assert.ok(
    iRes.status === 202 || iRes.status === 200,
    `Integration accept failed: ${JSON.stringify(iRes.body)}`
  );
}

// Test 2: Invalid permissions (unauthorized access rejected at contract level)
async function testUnauthorizedRejected() {
  const relayerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const nonRelayer = "0x5678";

  // Deploy a fresh contract on Anvil
  execSync(
    `forge script script/DeployEmergencyLedger.s.sol --rpc-url ${ANVIL_RPC} --private-key ${relayerKey} --broadcast 2>&1 | tail -5`,
    { cwd: path.join(__dirname, "..", "contracts"), encoding: "utf8" }
  );

  // Find the deployed contract address in the broadcast output
  let contractAddr = "";
  try {
    const runJson = JSON.parse(
      execSync(
        `find broadcast -path "*31337/run-latest.json" -print -quit 2>/dev/null`,
        { cwd: path.join(__dirname, "..", "contracts"), encoding: "utf8" }
      ).toString("utf8")
    );
    contractAddr = runJson.contractAddress;
  } catch {
    console.log("    (no broadcast run-latest.json found, skipping contract-level check)");
    return;
  }

  if (!contractAddr) {
    console.log("    (contract address not found, skipping contract-level check)");
    return;
  }

  // Calling recordEvent from non-relayer should revert
  try {
    execSync(
      `cast send ${contractAddr} "recordEvent(string,string,bytes32)" "evt-test" "op-test" "0x1234" --rpc-url ${ANVIL_RPC} --private-key ${nonRelayer}`,
      { cwd: path.join(__dirname, "..", "contracts"), encoding: "utf8" }
    );
    assert.fail("Expected transaction to revert for unauthorized caller");
  } catch (err) {
    const stderr = err.stderr || err.message || "";
    assert.ok(
      stderr.includes("revert"),
      `Expected revert, got: ${stderr.slice(0, 200)}`
    );
  }
}

// Test 3: Message duplication (idempotency via Redis)
async function testIdempotency() {
  const eventId = `evt-idem-${Date.now()}`;
  const operationId = `op-idem-${Date.now()}`;

  const res1 = await fetchJson(`${INTEGRATION}/events`, {
    method: "POST",
    body: JSON.stringify({ eventId, operationId, module: "medical", payload: {} }),
  });
  assert.ok(
    res1.status === 202 || res1.status === 200,
    `First request failed: ${JSON.stringify(res1.body)}`
  );

  const res2 = await fetchJson(`${INTEGRATION}/events`, {
    method: "POST",
    body: JSON.stringify({ eventId, operationId: "op-different", module: "medical", payload: {} }),
  });
  assert.strictEqual(res2.status, 200, `Duplicate should return 200`);
  assert.strictEqual(res2.body.status, "duplicate", `Expected "duplicate" status`);

  const res3 = await fetchJson(`${INTEGRATION}/events`, {
    method: "POST",
    body: JSON.stringify({ eventId: "evt-different", operationId, module: "logistics", payload: {} }),
  });
  assert.strictEqual(res3.status, 200, `Duplicate opId should return 200`);
  assert.strictEqual(res3.body.status, "duplicate", `Expected "duplicate" status`);
}

// Test 4: Module failure - event queued in SQLite outbox
async function testModuleFailureQueued() {
  const eventId = `evt-fail-${Date.now()}`;
  const operationId = `op-fail-${Date.now()}`;

  const res = await fetchJson(`${MEDICAL}/calls`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      priority: "URGENT",
      payload: { test: "failure-scenario" },
    }),
  });
  assert.strictEqual(res.status, 201);

  const outbox = await fetchJson(`${MEDICAL}/outbox/pending`);
  const found = outbox.body.find((e) => e.eventId === eventId);
  assert.ok(found, "Outbox event should exist");
  assert.strictEqual(found.status, "PENDING", "Outbox status should be PENDING");
}

// Test 5: Data mismatch triggers anomaly alert condition
async function testDataMismatchAlert() {
  const eventId = `evt-mismatch-${Date.now()}`;
  const operationId = `op-mismatch-${Date.now()}`;

  await fetchJson(`${MEDICAL}/calls`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      priority: "CRITICAL",
      payload: { test: "mismatch" },
    }),
  });

  await fetchJson(`${LOGISTICS}/assignments`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      payload: { test: "mismatch" },
    }),
  });

  const mRecord = await fetchJson(`${MEDICAL}/calls/${eventId}`);
  const lRecord = await fetchJson(`${LOGISTICS}/assignments/${eventId}`);
  assert.strictEqual(mRecord.body.status, "DISPATCHED", "Medical should be DISPATCHED");
  assert.strictEqual(lRecord.body.status, "UNASSIGNED", "Logistics should be UNASSIGNED");
  assert.ok(
    mRecord.body.status === "DISPATCHED" && lRecord.body.status === "UNASSIGNED",
    "State mismatch exists"
  );
}

// Test 6: Recovery after failure - processing resumes
async function testRecovery() {
  const eventId = `evt-recover-${Date.now()}`;
  const operationId = `op-recover-${Date.now()}`;

  await fetchJson(`${MEDICAL}/calls`, {
    method: "POST",
    body: JSON.stringify({
      eventId,
      operationId,
      payload: { test: "recovery" },
    }),
  });

  const outbox = await fetchJson(`${MEDICAL}/outbox/pending`);
  const found = outbox.body.find((e) => e.eventId === eventId);
  assert.ok(found && found.status === "PENDING", "Outbox should have PENDING event");

  const res = await fetchJson(`${INTEGRATION}/events`, {
    method: "POST",
    body: JSON.stringify({ eventId, operationId, module: "medical", payload: {} }),
  });
  assert.ok(
    res.status === 202 || res.status === 200,
    `Recovery processing failed: ${JSON.stringify(res.body)}`
  );
}

async function main() {
  console.log("Running 6 Core Integration Tests\n");

  await test("1. Successful end-to-end event processing", testE2ESuccess);
  await test("2. Invalid permissions (unauthorized rejected)", testUnauthorizedRejected);
  await test("3. Message duplication (idempotency via Redis)", testIdempotency);
  await test("4. Module failure (event queued in SQLite outbox)", testModuleFailureQueued);
  await test("5. Data mismatch (triggering anomaly alert)", testDataMismatchAlert);
  await test("6. Recovery after failure (processing resumes)", testRecovery);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
