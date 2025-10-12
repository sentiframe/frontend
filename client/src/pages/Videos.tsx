import { useEffect, useState } from "react";
import { getAllVideos, type VideoMetadata } from "@/lib/firebase";

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllVideos();
      console.info("[/videos] getAllVideos ->", res.length);
      setVideos(res);
    } catch (e: any) {
      console.error("[/videos] Error fetching videos:", e);
      setError(e?.message || "Failed to load videos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Firebase Videos</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>
        Listing documents in collection <code>videos</code>
      </p>
      <div style={{ marginBottom: 12 }}>
        <a href="/" style={{ marginRight: 12 }}>← Back</a>
        <button onClick={load} style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 6 }}>Reload</button>
      </div>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "#ef4444" }}>Error: {error}</div>}
      {videos && (
        <>
          <div style={{ margin: "12px 0" }}>Found {videos.length} video(s)</div>
          <ul style={{ lineHeight: 1.8 }}>
            {videos.map((v) => (
              <li key={v.id}>
                <strong>{v.id}</strong>
                {v.name && v.name !== v.id ? ` — ${v.name}` : ""}
                {typeof v.frameCount === "number" ? ` — frames: ${v.frameCount}` : ""}
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: 16, fontWeight: 600 }}>Raw JSON</h3>
          <pre style={{ background: "#f8fafc", padding: 12, borderRadius: 8, overflowX: "auto" }}>
{JSON.stringify(videos, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

