import {Wallet, ethers} from "ethers";
import {PrismaClient} from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const RPC_URL = process.env.ANVIL_RPC_URL || process.env.SEPOLIA_RPC_URL || "http://localhost:31337";
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("RELAYER_PRIVATE_KEY or SEPOLIA_PRIVATE_KEY must be set");
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = wallet.connect(provider);

// EmergencyLedger ABI (minimal — only recordEvent)
const ABI = [
  "function recordEvent(string eventId, string operationId, bytes32 payloadHash) external",
];

// Contract address — set after deployment
const CONTRACT_ADDRESS = process.env.EMERGENCY_LEDGER_ADDRESS || "0x0000000000000000000000000000000000000000";

const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

async function isDuplicate(eventId: string, operationId: string): Promise<boolean> {
  const eventKey = `idem:event:${eventId}`;
  const opKey = `idem:operation:${operationId}`;
  const [eventExists, opExists] = await Promise.all([
    redis.exists(eventKey),
    redis.exists(opKey),
  ]);
  return eventExists === 1 || opExists === 1;
}

async function markProcessed(eventId: string, operationId: string): Promise<void> {
  const ttl = 60 * 60 * 24;
  await Promise.all([
    redis.setex(`idem:event:${eventId}`, ttl, "1"),
    redis.setex(`idem:operation:${operationId}`, ttl, "1"),
  ]);
}

async function processEvent(ev: any) {
  const duplicate = await isDuplicate(ev.eventId, ev.operationId);
  if (duplicate) {
    await prisma.processedEvent.update({
      where: {id: ev.id},
      data: {status: "DUPLICATE"},
    });
    console.log(`Skipped duplicate event ${ev.eventId}`);
    return;
  }

  try {
    const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(ev.payload));
    const tx = await contract.recordEvent(ev.eventId, ev.operationId, payloadHash);
    const receipt = await tx.wait();

    await markProcessed(ev.eventId, ev.operationId);
    await prisma.processedEvent.update({
      where: {id: ev.id},
      data: {status: "CONFIRMED", txHash: receipt.hash},
    });
    console.log(`Confirmed event ${ev.eventId} in tx ${receipt.hash}`);
  } catch (err: any) {
    console.error(`Failed to relay event ${ev.eventId}:`, err.message);
    await prisma.processedEvent.update({
      where: {id: ev.id},
      data: {status: "FAILED"},
    });
  }
}

async function poll() {
  while (true) {
    try {
      const pending = await prisma.processedEvent.findMany({
        where: {status: "PENDING"},
        take: 10,
      });
      for (const ev of pending) {
        await processEvent(ev);
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

if (require.main === module) {
  console.log(`Relayer starting on ${RPC_URL}...`);
  poll().catch(console.error);
}

export {processEvent};