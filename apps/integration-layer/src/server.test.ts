import {fileURLToPath} from "url";
import {dirname} from "path";
import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {PrismaClient} from "@prisma/client";
import request from "supertest";
import Redis from "ioredis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = dirname(__dirname);
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${appDir}/prisma/dev.sqlite`;
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}

const app = (await import("./server")).default;
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

describe("Integration Layer API", () => {
  beforeAll(async () => {
    await prisma.processedEvent.deleteMany();
    await redis.flushall();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /events accepts a new event", async () => {
    const res = await request(app).post("/events").send({
      eventId: "evt-int-001",
      operationId: "op-int-001",
      module: "medical",
      payload: {test: true},
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("accepted");
    expect(res.body.eventId).toBe("evt-int-001");
  });

  it("POST /events rejects duplicate eventId (idempotency)", async () => {
    const res = await request(app).post("/events").send({
      eventId: "evt-int-001",
      operationId: "op-int-002",
      module: "medical",
      payload: {test: true},
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("POST /events rejects duplicate operationId (idempotency)", async () => {
    const res = await request(app).post("/events").send({
      eventId: "evt-int-002",
      operationId: "op-int-001",
      module: "logistics",
      payload: {test: true},
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("GET /events/:eventId returns processing status", async () => {
    const res = await request(app).get("/events/evt-int-001");
    expect(res.status).toBe(200);
    expect(res.body.eventId).toBe("evt-int-001");
  });
});
