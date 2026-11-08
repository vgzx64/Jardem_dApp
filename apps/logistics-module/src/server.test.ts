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

describe("Logistics Module API", () => {
  beforeAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await prisma.crewAssignment.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /assignments creates a crew assignment and outbox event", async () => {
    const res = await request(app).post("/assignments").send({
      eventId: "evt-log-001",
      operationId: "op-log-001",
      crewId: "crew-1",
      vehicleId: "vehicle-1",
      payload: {location: "downtown"},
    });
    expect(res.status).toBe(201);
    expect(res.body.eventId).toBe("evt-log-001");
    expect(res.body.status).toBe(Status.DISPATCHED);
  });

  it("POST /assignments rejects duplicate eventId", async () => {
    const res = await request(app).post("/assignments").send({
      eventId: "evt-log-001",
      operationId: "op-log-002",
      payload: {},
    });
    expect(res.status).toBe(409);
  });

  it("GET /assignments/:eventId returns the record", async () => {
    const res = await request(app).get("/assignments/evt-log-001");
    expect(res.status).toBe(200);
    expect(res.body.eventId).toBe("evt-log-001");
  });

  it("GET /outbox/pending returns the pending outbox event", async () => {
    const res = await request(app).get("/outbox/pending");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].eventId).toBe("evt-log-001");
  });
});
