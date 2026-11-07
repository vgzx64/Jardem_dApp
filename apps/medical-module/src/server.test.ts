import {describe, it, expect, beforeAll, afterAll} from "vitest";
import {PrismaClient} from "@prisma/client";
import app from "./server";
import {Status} from "@emergency/shared-types";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:/home/dev2/Code/SmartShvydkoJardem/apps/medical-module/prisma/dev.sqlite";
}

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
    const res = await fetch("http://localhost:3001/calls", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-med-001",
        operationId: "op-med-001",
        priority: "CRITICAL",
        patientId: "patient-1",
        payload: {symptoms: ["chest pain"]},
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.eventId).toBe("evt-med-001");
    expect(body.status).toBe(Status.DISPATCHED);
  });

  it("POST /calls rejects duplicate eventId", async () => {
    const res = await fetch("http://localhost:3001/calls", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        eventId: "evt-med-001",
        operationId: "op-med-002",
        payload: {},
      }),
    });
    expect(res.status).toBe(409);
  });

  it("GET /calls/:eventId returns the record", async () => {
    const res = await fetch("http://localhost:3001/calls/evt-med-001");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventId).toBe("evt-med-001");
  });

  it("GET /outbox/pending returns the pending outbox event", async () => {
    const res = await fetch("http://localhost:3001/outbox/pending");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].eventId).toBe("evt-med-001");
    expect(body[0].status).toBe("PENDING");
  });
});