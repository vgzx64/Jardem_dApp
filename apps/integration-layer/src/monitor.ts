import Database from "better-sqlite3";
import Redis from "ioredis";

const MEDICAL_DB = new Database(process.env.MEDICAL_DB_PATH || "./apps/medical-module/dev.sqlite", {readonly: true});
const LOGISTICS_DB = new Database(process.env.LOGISTICS_DB_PATH || "./apps/logistics-module/dev.sqlite", {readonly: true});
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// Threshold: 2 minutes in milliseconds
const MISMATCH_THRESHOLD_MS = 2 * 60 * 1000;

interface MedicalRecord {
  eventId: string;
  status: string;
  createdAt: string;
}

interface LogisticsRecord {
  eventId: string;
  status: string;
}

function checkMismatch() {
  const now = Date.now();

  // Find medical records that are DISPATCHED and older than threshold
  const medical = MEDICAL_DB.prepare(
    `SELECT eventId, status, createdAt FROM CallRecord WHERE status = 'DISPATCHED'`
  ).all() as MedicalRecord[];

  for (const med of medical) {
    const medTime = new Date(med.createdAt).getTime();
    if (now - medTime < MISMATCH_THRESHOLD_MS) continue; // not old enough yet

    // Check corresponding logistics record
    const log = LOGISTICS_DB.prepare(
      `SELECT eventId, status FROM CrewAssignment WHERE eventId = ?`
    ).get(med.eventId) as LogisticsRecord | undefined;

    if (!log || log.status === "UNASSIGNED") {
      const alertKey = `alert:mismatch:${med.eventId}`;
      const alreadyAlerted = redis.get(alertKey);
      if (!alreadyAlerted) {
        const msg = `[ANOMALY ALERT] Medical event ${med.eventId} is DISPATCHED but Logistics is ${log ? log.status : "MISSING"} for over 2 minutes`;
        console.error(msg);
        // Store alert for 1 hour to avoid spam
        redis.setex(alertKey, 60 * 60, "1");
      }
    }
  }
}

async function poll() {
  while (true) {
    try {
      checkMismatch();
    } catch (err) {
      console.error("Monitor error:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000)); // check every 10s
  }
}

if (require.main === module) {
  console.log("Monitoring daemon started (checking every 10s)...");
  poll().catch(console.error);
}

export {checkMismatch};