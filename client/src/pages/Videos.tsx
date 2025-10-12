import { useEffect, useState } from "react";
import { listSessionsFromApi } from "@/lib/sessions";
import type { Session } from "@shared/schema";

export default function VideosPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSessionsFromApi();
        setSessions(result);
      } catch (err: any) {
        console.error("/sessions", err);
        setError(err?.message || "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Remote Sessions</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Raw data returned from <code>/sessions</code>
      </p>
      <div style={{ marginBottom: 12 }}>
        <a href="/" style={{ marginRight: 12 }}>⟵ Back</a>
      </div>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "#ef4444" }}>Error: {error}</div>}
      {!loading && !error && (
        <>
          <div style={{ margin: "12px 0" }}>Found {sessions.length} session(s)</div>
          <ul style={{ lineHeight: 1.8 }}>
            {sessions.map((session) => (
              <li key={session.id}>
                <strong>{session.id}</strong> — {session.name} ({session.date} • {session.time})
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: 16, fontWeight: 600 }}>Raw JSON</h3>
          <pre style={{ background: "#f8fafc", padding: 12, borderRadius: 8, overflowX: "auto" }}>
{JSON.stringify(sessions, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

