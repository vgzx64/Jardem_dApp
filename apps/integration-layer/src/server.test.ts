import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {PrismaClient} from "@prisma/client";
import app from "./server";
import Redis from "ioredis";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/home/dev2/Code/SmartShvydkoJardem/apps/integration-layer/prisma/dev.sqlite";
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
}

const prisma = new PrismaClient();
const redis = new Redis("redis://localhost:6379");

describe("Integration Layer API", () => {
  beforeAll(async () => {
    await prisma.processedEvent.deleteMany();
    await redis.flushall();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  it("POST /events accepts a new event", async () => {
    const res = await fetch("http://localhost:3003/events", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-int-001",
        operationId: "op-int-001",
        module: "medical",
        payload: {test: true},
      }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.eventId).toBe("evt-int-001");
  });

  it("POST /events rejects duplicate eventId (idempotency)", async () => {
    const res = await fetch("http://localhost:3003/events", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-int-001",
        operationId: "op-int-002",
        module: "medical",
        payload: {test: true},
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("duplicate");
  });

  it("POST /events rejects duplicate operationId (idempotency)", async () => {
    const res = await fetch("http://localhost:3003/events", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-int-002",
        operationId: "op-int-001",
        module: "logistics",
        payload: {test: true},
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("duplicate");
  });

  it("GET /events/:eventId returns processing status", async () => {
    const res = await fetch("http://localhost:3003/events/evt-int-001");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventId).toBe("evt-int-001");
  });
});