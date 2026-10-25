import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="notice glass">
        <h1>This page doesn't exist</h1>
        <p>The link may be wrong, or the department may have been renamed.</p>
        <Link href="/" className="btn btn-primary">
          Go to overview
        </Link>
      </section>
    </main>
  );
}
