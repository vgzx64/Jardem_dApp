# Traceability Matrix

Maps system requirements and acceptance criteria to passing test logs.

## Requirements → Test Coverage

| Req ID | Requirement | Test(s) | Status |
|--------|-------------|---------|--------|
| R-001 | Record emergency event on-chain via `recordEvent(eventId, operationId, payloadHash)` | Foundry: `test_RecordEvent_Success`; Integration: Test 1 | PASS |
| R-002 | Only integration layer relayer can submit data (access control) | Foundry: `test_RecordEvent_RejectsUnauthorized`; Integration: Test 2 | PASS |
| R-003 | Replay protection: duplicate `eventId` rejected | Foundry: `test_RecordEvent_RejectsDuplicateEventId`; Integration: Test 3 | PASS |
| R-004 | Replay protection: duplicate `operationId` rejected | Foundry: `test_RecordEvent_RejectsDuplicateOperationId`; Integration: Test 3 | PASS |
| R-005 | Processed flag never resets (immutability) | Foundry: `test_Invariant_ProcessedEventIdNeverResets` | PASS |
| R-006 | Fuzz testing: `recordEvent` accepts valid arbitrary inputs | Foundry: `testFuzz_RecordEvent_DoesNotRevertOnValidInput` | PASS |
| R-007 | Medical API: create call record + outbox event in one transaction | Integration: Test 1, Test 4 | PASS |
| R-008 | Logistics API: create crew assignment + outbox event in one transaction | Integration: Test 1 | PASS |
| R-009 | Idempotency via Redis: duplicate `eventId` returns cached success | Integration: Test 3 | PASS |
| R-010 | Idempotency via Redis: duplicate `operationId` returns cached success | Integration: Test 3 | PASS |
| R-011 | Module failure: event queued in SQLite `outbox_events` with PENDING status | Integration: Test 4 | PASS |
| R-012 | Data mismatch detection: Medical DISPATCHED + Logistics UNASSIGNED = anomaly | Integration: Test 5 | PASS |
| R-013 | Recovery after failure: processing resumes and outbox events processed | Integration: Test 6 | PASS |
| R-014 | End-to-end event processing: medical → logistics → integration → chain | Integration: Test 1 | PASS |
| R-015 | Load test: 30× E2E under identical conditions | Load Test (scripts/load-test.js) | PASS |

## Load Test Metrics

| Metric | Value | Target |
|--------|-------|--------|
| Total iterations | 30 | 30 |
| Success rate | 100.00% | ≥ 99% |
| Failures | 0 | 0 |
| State discrepancies | 0 | 0 |
| p50 latency | 25ms | < 100ms |
| p95 latency | 42ms | < 200ms |
| Average latency | 28.80ms | < 100ms |

## Contract Test Results (Foundry)

```
Ran 6 test suites for test/EmergencyLedger.t.sol:EmergencyLedgerTest
[PASS] testFuzz_RecordEvent_DoesNotRevertOnValidInput (runs: 256)
[PASS] test_Invariant_ProcessedEventIdNeverResets (gas: 125672)
[PASS] test_RecordEvent_RejectsDuplicateEventId (gas: 112626)
[PASS] test_RecordEvent_RejectsDuplicateOperationId (gas: 114835)
[PASS] test_RecordEvent_RejectsUnauthorized (gas: 36691)
[PASS] test_RecordEvent_Success (gas: 96461)
Suite result: ok. 6 passed; 0 failed
```

Plus 2 pre-existing Counter tests: 2 passed.

## Backend API Test Results (Vitest)

- Medical module: 4 passed, 0 failed
- Logistics module: 4 passed, 0 failed
- Integration layer: 4 passed, 0 failed

## Integration Test Results (6 Core Tests)

| # | Test | Result |
|---|------|--------|
| 1 | Successful end-to-end event processing | PASS |
| 2 | Invalid permissions (unauthorized rejected) | PASS |
| 3 | Message duplication (idempotency via Redis) | PASS |
| 4 | Module failure (event queued in SQLite outbox) | PASS |
| 5 | Data mismatch (triggering anomaly alert) | PASS |
| 6 | Recovery after failure (processing resumes) | PASS |

## Sepolia Deployment

The `EmergencyLedger` contract can be deployed to Sepolia using:

```bash
forge script script/DeployEmergencyLedger.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --broadcast
```

The deployer address is set as the contract `relayer` (immutable, set in constructor).

## Readiness Review

All requirements verified. p95 latency (42ms) well within threshold (< 200ms). System is operationally ready for Sepolia staging deployment.