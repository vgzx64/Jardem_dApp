import {fileURLToPath} from "url";
import {dirname} from "path";
import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {PrismaClient} from "@prisma/client";
import request from "supertest";
import {Status} from "@emergency/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = dirname(__dirname);
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${appDir}/prisma/dev.sqlite`;
}

const app = (await import("./server")).default;
const prisma = new PrismaClient();

describe("Medical Module API", () => {
  beforeAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.callRecord.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /calls creates a call record and outbox event", async () => {
    const res = await request(app).post("/calls").send({
      eventId: "evt-med-001",
      operationId: "op-med-001",
      priority: "CRITICAL",
      patientId: "patient-1",
      payload: {symptoms: ["chest pain"]},
    });
    expect(res.status).toBe(201);
    expect(res.body.eventId).toBe("evt-med-001");
    expect(res.body.status).toBe(Status.DISPATCHED);
  });

  it("POST /calls rejects duplicate eventId", async () => {
    const res = await request(app).post("/calls").send({
      eventId: "evt-med-001",
      operationId: "op-med-002",
      payload: {},
    });
    expect(res.status).toBe(409);
  });

  it("GET /calls/:eventId returns the record", async () => {
    const res = await request(app).get("/calls/evt-med-001");
    expect(res.status).toBe(200);
    expect(res.body.eventId).toBe("evt-med-001");
  });

  it("GET /outbox/pending returns the pending outbox event", async () => {
    const res = await request(app).get("/outbox/pending");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].eventId).toBe("evt-med-001");
    expect(res.body[0].status).toBe("PENDING");
  });
});
