export const Status = {
  PENDING: "PENDING",
  DISPATCHED: "DISPATCHED",
  UNASSIGNED: "UNASSIGNED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CONFIRMED: "CONFIRMED",
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export interface EventPayload {
  eventId: string;
  operationId: string;
  module: "medical" | "logistics";
  status: Status;
  payloadHash: string;
  timestamp: number;
}

export interface OutboxEventRow {
  id: string;
  eventId: string;
  operationId: string;
  payload: string;
  status: string;
  txHash: string | null;
}