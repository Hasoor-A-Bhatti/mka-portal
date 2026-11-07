import type { Metadata } from "next";
import { CalendarDays, Clock4, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dayRange, type AekUpdate } from "@/lib/delegations";
import { SiteFooter, Watermark } from "@/components/brand";
import { AekForm, type AekView } from "./aek-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your visit",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

export default async function VisitPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = token.length >= 32 ? await supabase.rpc("aek_view", { tok: token }) : { data: null };
  const view = (data ?? null) as (AekView & { update: AekUpdate | null }) | null;

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

      {!view ? (
        <section className="visit-card glass glass-strong">
          <h1>This link isn't working</h1>
          <p className="visit-lead">
            It may have expired after your visit, or been replaced with a new one. Please ask your contact in the MKA
            Delegations team to send you a new link.
          </p>
        </section>
      ) : (
        <>
          <section className="visit-card visit-intro glass glass-strong">
            <span className="eyebrow">Your visit to MKA UK</span>
            <h1>{view.delegation.name}</h1>
            <p className="visit-lead">
              Assalamo Alaikum. Please share your travel details, your group, your plans for each day and the meals you&apos;d
              like us to provide, so we can arrange your welcome, transport, accommodation and food. Fill in what you know now:
              everything you send is kept here, so you can come back to this page and add to it or change it at any time.
            </p>
            {view.delegation.arrival_date && view.delegation.departure_date && (
              <p className="visit-planned">
                <CalendarDays size={16} />
                Planned with us: <strong>{dayRange(view.delegation.arrival_date, view.delegation.departure_date)}</strong>
              </p>
            )}
            {view.update?.submitted_at && (
              <p className="visit-planned is-saved">
                <Clock4 size={16} />
                Last sent{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/London",
                }).format(new Date(view.update.submitted_at))}{" "}
                (UK time)
              </p>
            )}
          </section>

          <AekForm token={token} view={view} />

          <p className="visit-privacy">
            <ShieldCheck size={15} /> This private link only shows your own delegation. Please don't share it outside your
            group.
          </p>
        </>
      )}

      <SiteFooter className="visit-foot" />
      <Watermark />
    </main>
  );
}
