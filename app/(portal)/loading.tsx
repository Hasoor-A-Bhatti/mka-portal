export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <span className="sr-only">Loading…</span>
      <div className="skeleton" style={{ height: 180, borderRadius: "var(--radius-xl)" }} />
      <div className="skeleton-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 210, borderRadius: "var(--radius-xl)" }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 260, borderRadius: "var(--radius-xl)" }} />
    </div>
  );
}
