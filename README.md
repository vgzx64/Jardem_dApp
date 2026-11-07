# SmartShvydkoJardem — Emergency Response Coordination MVP

A monorepo for coordinating emergency response between Medical and Logistics modules, with event proofs recorded on-chain via an Ethereum smart contract.

## Architecture

```
contracts/          Foundry smart contracts (EmergencyLedger.sol)
shared-types/       Shared TypeScript types (@emergency/shared-types)
apps/
  medical-module/   Express + Prisma + SQLite API (call records)
  logistics-module/ Express + Prisma + SQLite API (crew assignments)
  integration-layer/Express + ethers.js relayer, Redis idempotency, outbox poller, monitor
  frontend-dashboard/ Vite + React dashboard
scripts/            Integration tests + load test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.13, Foundry 1.8.3 |
| Local Chain | Anvil |
| Staging | Ethereum Sepolia |
| Backend | Node 22, TypeScript, Express, Prisma ORM, SQLite |
| Cache/Queue | Redis |
| Web3 Client | ethers.js v6 |
| Frontend | Vite, React 18 |
| Testing | Vitest, Foundry (forge test), Node integration scripts |
| CI | GitHub Actions |

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd SmartShvydkoJardem
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values (PRIVATE_KEY, RPC URLs, etc.)
```

### 3. Start local infrastructure (Docker or Podman)

```bash
# Docker
docker compose up -d

# Podman
podman-compose up -d
```

This starts Anvil (http://localhost:31337) and Redis (localhost:6379).

### 4. Start the backend modules

```bash
# Terminal 1 — Medical module
cd apps/medical-module
cp .env.example .env   # if present
PORT=3001 npx tsx src/server.ts

# Terminal 2 — Logistics module
cd apps/logistics-module
PORT=3002 npx tsx src/server.ts

# Terminal 3 — Integration layer
cd apps/integration-layer
PORT=3003 REDIS_URL=redis://localhost:6379 npx tsx src/server.ts
```

### 5. Start the frontend

```bash
cd apps/frontend-dashboard
npm install
npm run dev
# http://localhost:5173
```

## Testing

### Smart contracts (Foundry)

```bash
forge test --root contracts
# 8 tests pass (6 EmergencyLedger + 2 Counter)
```

### Backend APIs (Vitest)

```bash
npm run test:all
# Medical: 4, Logistics: 4, Integration: 4 = 12 total
```

### End-to-end integration tests

```bash
# Requires Anvil, Redis, and all 3 backend modules running
node scripts/integration-tests.js
# 6/6 tests pass
```

### Load test

```bash
node scripts/load-test.js
# 30 E2E iterations; reports success rate, p50/p95 latency
```

## Smart Contracts

### EmergencyLedger.sol

- `recordEvent(string eventId, string operationId, bytes32 payloadHash)` — records an event proof on-chain
- Access control: only the configured `relayer` address can call `recordEvent`
- Replay protection: each `eventId` and `operationId` can only be processed once
- Emits `EventRecorded` event with submitter and timestamp

### Deploy

**Anvil (local):**

```bash
forge script script/DeployEmergencyLedger.s.sol \
  --rpc-url http://localhost:31337 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

**Sepolia (staging):**

```bash
forge script script/DeployEmergencyLedger.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --broadcast
```

The deployer address is set as the immutable `relayer` in the constructor.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

1. **Contracts job:** `forge fmt --check`, `forge build --sizes`, `forge test`
2. **Backend job:** `npm ci`, `prisma generate` for all 3 apps, `npm run test:all`

## Environment Variables

See `.env.example` for the full list. Required at minimum:

| Variable | Description |
|----------|-------------|
| `ANVIL_RPC_URL` | Local Anvil RPC endpoint |
| `RELAYER_PRIVATE_KEY` | Private key funded on Anvil (relayer) |
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint (staging) |
| `SEPOLIA_PRIVATE_KEY` | Sepolia deployer private key |
| `REDIS_URL` | Redis connection string |
| `DATABASE_URL` | Per-app SQLite file path |

Never commit real `.env` files — only `.env.example` is tracked.

## Project Structure

```
contracts/
  src/EmergencyLedger.sol          # Core on-chain ledger
  test/EmergencyLedger.t.sol       # Foundry unit + fuzz + invariant tests
  script/DeployEmergencyLedger.s.sol # Foundry deploy script
shared-types/
  src/index.ts                     # Shared TS types for all apps
apps/
  medical-module/
    prisma/schema.prisma           # CallRecord, OutboxEvent models
    src/server.ts                  # Express API
    src/server.test.ts             # Vitest tests
  logistics-module/
    prisma/schema.prisma           # CrewAssignment, OutboxEvent models
    src/server.ts                  # Express API
    src/server.test.ts             # Vitest tests
  integration-layer/
    prisma/schema.prisma           # ProcessedEvent model
    src/server.ts                  # Express API + idempotency
    src/relayer.ts                 # ethers.js relayer to Anvil/Sepolia
    src/outbox-poller.ts           # SQLite outbox → Redis poller
    src/monitor.ts                 # Cross-module anomaly detection
    src/server.test.ts             # Vitest tests
  frontend-dashboard/
    src/App.tsx                    # React dashboard
scripts/
  integration-tests.js             # 6 core E2E integration tests
  load-test.js                     # 30-iteration load test with metrics
```

## License

ISC