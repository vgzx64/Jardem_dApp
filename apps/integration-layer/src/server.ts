import express from "express";
import {PrismaClient} from "@prisma/client";
import Redis from "ioredis";
import {Status} from "@emergency/shared-types";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/home/dev2/Code/SmartShvydkoJardem/apps/integration-layer/prisma/dev.sqlite";
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}

const app = express();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
app.use(express.json());

const MODULES = [
  {name: "medical", base: process.env.MEDICAL_API_URL || "http://localhost:3001"},
  {name: "logistics", base: process.env.LOGISTICS_API_URL || "http://localhost:3002"},
];

// Idempotency check: returns true if this eventId/operationId was already processed
async function isDuplicate(eventId: string, operationId: string): Promise<boolean> {
  const eventKey = `idem:event:${eventId}`;
  const opKey = `idem:operation:${operationId}`;
  const [eventExists, opExists] = await Promise.all([
    redis.exists(eventKey),
    redis.exists(opKey),
  ]);
  return eventExists === 1 || opExists === 1;
}

// Mark eventId and operationId as processed (TTL 24h)
async function markProcessed(eventId: string, operationId: string): Promise<void> {
  const ttl = 60 * 60 * 24;
  await Promise.all([
    redis.setex(`idem:event:${eventId}`, ttl, "1"),
    redis.setex(`idem:operation:${operationId}`, ttl, "1"),
  ]);
}

// POST /events — module pushes an outbox event to the integration layer
app.post("/events", async (req, res) => {
  const {eventId, operationId, module, payload} = req.body;
  if (!eventId || !operationId || !module) {
    return res.status(400).json({error: "eventId, operationId, module are required"});
  }

  try {
    const duplicate = await isDuplicate(eventId, operationId);
    if (duplicate) {
      return res.status(200).json({status: "duplicate", eventId});
    }

    await markProcessed(eventId, operationId);

    await prisma.processedEvent.create({
      data: {
        eventId,
        operationId,
        module,
        status: "PENDING",
      },
    });

    res.status(202).json({status: "accepted", eventId});
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(200).json({status: "duplicate", eventId});
    }
    res.status(500).json({error: err.message});
  }
});

// GET /events/:eventId — check processing status
app.get("/events/:eventId", async (req, res) => {
  const ev = await prisma.processedEvent.findUnique({where: {eventId: req.params.eventId}});
  if (!ev) return res.status(404).json({error: "not found"});
  res.json(ev);
});

// POST /relay — manually trigger relay for a pending event
app.post("/relay", async (_req, res) => {
  const pending = await prisma.processedEvent.findMany({where: {status: "PENDING"}});
  let sent = 0;
  for (const ev of pending) {
    try {
      // In production this calls the ethers.js relayer; here we mark as sent
      await prisma.processedEvent.update({
        where: {id: ev.id},
        data: {status: "SENT"},
      });
      sent++;
    } catch {
      // continue
    }
  }
  res.json({sent});
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Integration layer listening on ${PORT}`);
});

export default app;