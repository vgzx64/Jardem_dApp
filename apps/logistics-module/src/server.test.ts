import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {PrismaClient} from "@prisma/client";
import app from "./server";
import {Status} from "@emergency/shared-types";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/home/dev2/Code/SmartShvydkoJardem/apps/logistics-module/prisma/dev.sqlite";
}

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
    const res = await fetch("http://localhost:3002/assignments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-log-001",
        operationId: "op-log-001",
        crewId: "crew-1",
        vehicleId: "vehicle-1",
        payload: {location: "downtown"},
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.eventId).toBe("evt-log-001");
    expect(body.status).toBe(Status.DISPATCHED);
  });

  it("POST /assignments rejects duplicate eventId", async () => {
    const res = await fetch("http://localhost:3002/assignments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-log-001",
        operationId: "op-log-002",
        payload: {},
      }),
    });
    expect(res.status).toBe(409);
  });

  it("GET /assignments/:eventId returns the record", async () => {
    const res = await fetch("http://localhost:3002/assignments/evt-log-001");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventId).toBe("evt-log-001");
  });

  it("GET /outbox/pending returns the pending outbox event", async () => {
    const res = await fetch("http://localhost:3002/outbox/pending");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].eventId).toBe("evt-log-001");
  });
});