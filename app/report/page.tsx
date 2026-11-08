import type { Metadata } from "next";
import { Flame, Phone, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ARTICLES, FAQ } from "@/lib/jaidat-guide";
import { SiteFooter, Watermark } from "@/components/brand";
import { ReportForm, type Place } from "./report-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report an issue",
  description: "Report a repair, safety concern or other problem at an MKA UK property.",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ p?: string; room?: string }> };

export default async function ReportPage({ searchParams }: Props) {
  const { p, room } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("jaidat_report_places");
  const places = (Array.isArray(data) ? data : []) as Place[];

  return (
    <main className="visit">
      <header className="visit-brand">
        <span className="seal" aria-hidden>
          <span className="seal-art" />
        </span>
        <span className="brand-org">
          <b>Majlis</b>
          <b>Khuddamul Ahmadiyya</b>
          <small>United Kingdom</small>
        </span>
      </header>

      <section className="visit-card visit-intro glass glass-strong">
        <span className="eyebrow">MKA Jaidad Team UK</span>
        <h1>Report an issue</h1>
        <p className="visit-lead">
          Seen something that needs fixing at an MKA property? A leak, a broken light, damp, a safety worry? Tell us here. No login needed. You&apos;ll get a reference
          number straight away.
        </p>
      </section>

      <section className="jd-emergency" role="note">
        <Flame size={22} />
        <div>
          <strong>Emergency? Don&apos;t use this form.</strong>
          <span>
            If anyone is in danger, call <a href="tel:999">999</a>. If you smell gas, leave the area and call the National Gas Emergency line on{" "}
            <a href="tel:08001119999">
              <Phone size={13} /> 0800 111 999
            </a>
            .
          </span>
        </div>
      </section>

      {error ? (
        <section className="visit-card glass glass-strong">
          <h2>The form isn&apos;t available right now</h2>
          <p className="visit-lead">Please email your report to jaidad@khuddam.co.uk.</p>
        </section>
      ) : (
        <ReportForm places={places} place={p} room={room?.slice(0, 60)} />
      )}

      <section className="visit-card glass glass-strong">
        <h2>Questions</h2>
        <div className="jd-kb">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="visit-card glass glass-strong">
        <h2>Helpful guides</h2>
        <div className="jd-kb">
          {ARTICLES.filter((a) => a.topic === "Reporting" || a.topic === "Safety" || a.topic === "Data").map((a) => (
            <details key={a.title}>
              <summary>{a.title}</summary>
              <ul>
                {a.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <p className="visit-privacy">
        <ShieldCheck size={15} /> Your details are only used to deal with your report.
      </p>
      <SiteFooter className="visit-foot" />
      <Watermark />
    </main>
  );
}
