import express from "express";
import {PrismaClient} from "@prisma/client";
import {Status} from "@emergency/shared-types";
import {v4 as uuidv4} from "uuid";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/home/dev2/Code/SmartShvydkoJardem/apps/medical-module/prisma/dev.sqlite";
}

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// POST /calls — create a call record + outbox event in one transaction
app.post("/calls", async (req, res) => {
  const {eventId, operationId, priority, patientId, payload} = req.body;
  if (!eventId || !operationId) {
    return res.status(400).json({error: "eventId and operationId are required"});
  }

  try {
    const [callRecord] = await prisma.$transaction([
      prisma.callRecord.create({
        data: {
          eventId,
          operationId,
          status: Status.DISPATCHED,
          priority: priority ?? Status.PENDING,
          patientId,
          payload: JSON.stringify(payload ?? {}),
        },
      }),
      prisma.outboxEvent.create({
        data: {
          eventId,
          operationId,
          payload: JSON.stringify({
            eventId,
            operationId,
            module: "medical",
            status: Status.DISPATCHED,
            payloadHash: Buffer.from(JSON.stringify(payload ?? {})).toString("hex"),
            timestamp: Date.now(),
          }),
          status: "PENDING",
        },
      }),
    ]);

    res.status(201).json(callRecord);
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({error: "eventId already exists"});
    }
    res.status(500).json({error: err.message});
  }
});

// GET /calls/:eventId — fetch a call record
app.get("/calls/:eventId", async (req, res) => {
  const record = await prisma.callRecord.findUnique({where: {eventId: req.params.eventId}});
  if (!record) return res.status(404).json({error: "not found"});
  res.json(record);
});

// GET /outbox — list pending outbox events (for the poller)
app.get("/outbox/pending", async (_req, res) => {
  const events = await prisma.outboxEvent.findMany({where: {status: "PENDING"}});
  res.json(events);
});

// PATCH /outbox/:id — mark outbox event as sent
app.patch("/outbox/:id", async (req, res) => {
  const {status, txHash} = req.body;
  const updated = await prisma.outboxEvent.update({
    where: {id: req.params.id},
    data: {status, txHash, sentAt: status === "SENT" ? new Date() : null},
  });
  res.json(updated);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Medical module listening on ${PORT}`);
});

export default app;