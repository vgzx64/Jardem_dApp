import {PrismaClient} from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const MODULES = [
  {name: "medical", base: process.env.MEDICAL_API_URL || "http://localhost:3001"},
  {name: "logistics", base: process.env.LOGISTICS_API_URL || "http://localhost:3002"},
];

async function fetchPendingFromModule(base: string) {
  try {
    const res = await fetch(`${base}/outbox/pending`);
    return await res.json();
  } catch {
    return [];
  }
}

async function markModuleSent(base: string, id: string, txHash: string | null) {
  try {
    await fetch(`${base}/outbox/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status: "SENT", txHash}),
    });
  } catch {
    // ignore
  }
}

async function poll() {
  while (true) {
    try {
      for (const mod of MODULES) {
        const pending: any[] = await fetchPendingFromModule(mod.base);
        for (const ev of pending) {
          const payload = JSON.parse(ev.payload);
          // Push to integration layer's /events endpoint (idempotency handled there)
          await fetch(`${process.env.INTEGRATION_API_URL || "http://localhost:3003"}/events`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
              eventId: ev.eventId,
              operationId: ev.operationId,
              module: mod.name,
              payload,
            }),
          }).then(async (res) => {
            const result = await res.json();
            if (result.status === "accepted" || result.status === "duplicate") {
              await markModuleSent(mod.base, ev.id, null);
            }
          });
        }
      }
    } catch (err) {
      console.error("Outbox poller error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

if (require.main === module) {
  console.log("Outbox poller starting...");
  poll().catch(console.error);
}

export {poll};