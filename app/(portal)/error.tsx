"use client";

export default function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="notice glass">
      <h1>This page didn't load</h1>
      <p>{error.message || "Something went wrong while fetching data."}</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
