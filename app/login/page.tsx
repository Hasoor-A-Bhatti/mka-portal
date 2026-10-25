import type { Metadata } from "next";
import { DEPARTMENTS } from "@/lib/departments";
import { LoginForm } from "./login-form";
import { vars } from "@/lib/css";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="login">
      <div className="login-light" aria-hidden />
      <div className="login-ring" aria-hidden />

      <section className="login-brand rise">
        <div className="login-mark">
          <div className="emblem" role="img" aria-label="MKA emblem">
            <span className="emblem-orbit" aria-hidden />
            <span className="emblem-art" aria-hidden />
          </div>
          <h1 className="wordmark" aria-label="MKA Portal">
            MKA
            <span className="wordmark-sub">Portal</span>
          </h1>
        </div>
        <div className="login-depts" aria-hidden>
          {DEPARTMENTS.map((d) => (
            <span
              key={d.slug}
              className="status"
              style={vars({ "--tone": d.accent })}
            >
              {d.short}
            </span>
          ))}
        </div>
      </section>

      <section className="login-card glass glass-strong spotlight rise" style={vars({ "--i": "2" })}>
        <h1>Sign in</h1>
        <p className="sub">Use the account your department admin gave you.</p>
        <LoginForm next={next ?? "/"} />
        <p className="login-foot">Forgotten your password? Ask your admin to reset it.</p>
      </section>
    </main>
  );
}
