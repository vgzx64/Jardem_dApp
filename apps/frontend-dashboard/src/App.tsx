import React, {useEffect, useState} from "react";

const MEDICAL_API = "http://localhost:3001";
const LOGISTICS_API = "http://localhost:3002";
const INTEGRATION_API = "http://localhost:3003";

type Record = {
  eventId: string;
  status: string;
  priority?: string;
  crewId?: string;
  payload: string;
  createdAt: string;
};

function App() {
  const [medical, setMedical] = useState<Record[]>([]);
  const [logistics, setLogistics] = useState<Record[]>([]);
  const [integration, setIntegration] = useState<{eventId: string; status: string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const interval = setInterval(fetchAll, 5000);
    fetchAll();
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [mRes, lRes, iRes] = await Promise.all([
        fetch(`${MEDICAL_API}/calls/evt-med-001`),
        fetch(`${LOGISTICS_API}/assignments/evt-log-001`),
        fetch(`${INTEGRATION_API}/events/evt-int-001`),
      ]);
      if (mRes.ok) setMedical((prev) => [...prev.filter((r) => r.eventId !== "evt-med-001"), await mRes.json()]);
      if (lRes.ok) setLogistics((prev) => [...prev.filter((r) => r.eventId !== "evt-log-001"), await lRes.json()]);
      if (iRes.ok) setIntegration((prev) => [...prev.filter((r) => r.eventId !== "evt-int-001"), await iRes.json()]);
    } catch {
      // polling failure is non-fatal
    } finally {
      setLoading(false);
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "DISPATCHED":
        return "bg-blue-100 text-blue-800";
      case "CONFIRMED":
        return "bg-green-100 text-green-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "UNASSIGNED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 font-sans max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Emergency Response Coordination</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border p-4 rounded-lg">
          <h2 className="font-semibold mb-2">Medical Module</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul className="space-y-2">
              {medical.map((r) => (
                <li key={r.eventId} className="flex justify-between text-sm">
                  <span>{r.eventId}</span>
                  <span className={`px-2 py-1 rounded ${statusColor(r.status)}`}>{r.status}</span>
                </li>
              ))}
              {medical.length === 0 && <p className="text-gray-500 text-sm">No records</p>}
            </ul>
          )}
        </div>

        <div className="border p-4 rounded-lg">
          <h2 className="font-semibold mb-2">Logistics Module</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul className="space-y-2">
              {logistics.map((r) => (
                <li key={r.eventId} className="flex justify-between text-sm">
                  <span>{r.eventId}</span>
                  <span className={`px-2 py-1 rounded ${statusColor(r.status)}`}>{r.status}</span>
                </li>
              ))}
              {logistics.length === 0 && <p className="text-gray-500 text-sm">No records</p>}
            </ul>
          )}
        </div>

        <div className="border p-4 rounded-lg">
          <h2 className="font-semibold mb-2">Integration Layer (On-chain)</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ul className="space-y-2">
              {integration.map((r) => (
                <li key={r.eventId} className="flex justify-between text-sm">
                  <span>{r.eventId}</span>
                  <span className={`px-2 py-1 rounded ${statusColor(r.status)}`}>{r.status}</span>
                </li>
              ))}
              {integration.length === 0 && <p className="text-gray-500 text-sm">No records</p>}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Polls backend APIs every 5s. Status: Pending (yellow), Dispatched (blue), Confirmed (green).
      </p>
    </div>
  );
}

export default App;