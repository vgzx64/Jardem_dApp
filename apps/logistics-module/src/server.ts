import express from "express";
import {PrismaClient} from "@prisma/client";
import {pathToFileURL} from "url";
import {Status} from "@emergency/shared-types";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = new URL(
    "../prisma/dev.sqlite",
    import.meta.url
  ).href;
}

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// POST /assignments — create a crew assignment + outbox event in one transaction
app.post("/assignments", async (req, res) => {
  const {eventId, operationId, crewId, vehicleId, payload} = req.body;
  if (!eventId || !operationId) {
    return res.status(400).json({error: "eventId and operationId are required"});
  }

  try {
    const [assignment] = await prisma.$transaction([
      prisma.crewAssignment.create({
        data: {
          eventId,
          operationId,
          status: crewId ? Status.DISPATCHED : Status.UNASSIGNED,
          crewId,
          vehicleId,
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
            module: "logistics",
            status: crewId ? Status.DISPATCHED : Status.UNASSIGNED,
            payloadHash: Buffer.from(JSON.stringify(payload ?? {})).toString("hex"),
            timestamp: Date.now(),
          }),
          status: "PENDING",
        },
      }),
    ]);

    res.status(201).json(assignment);
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({error: "eventId already exists"});
    }
    res.status(500).json({error: err.message});
  }
});

// GET /assignments/:eventId — fetch a crew assignment
app.get("/assignments/:eventId", async (req, res) => {
  const record = await prisma.crewAssignment.findUnique({
    where: {eventId: req.params.eventId},
  });
  if (!record) return res.status(404).json({error: "not found"});
  res.json(record);
});

// GET /outbox/pending — list pending outbox events (for the poller)
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

const PORT = process.env.PORT || 3002;
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Logistics module listening on ${PORT}`);
  });
}

export default app;
export { app, prisma };