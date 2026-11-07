"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Link2, Mail, MapPinned, MessageCircle, RefreshCw, UserRound, XCircle } from "lucide-react";
import { AEK_TITLE, SHARE_KINDS, dayRange, type ShareKind, type ShareState } from "@/lib/delegations";
import { formatDate, formatDateTime } from "@/lib/format";
import { createShareLink, revokeShareLink } from "@/app/(portal)/[dept]/[id]/actions";
import { FormError, Sheet, useRun } from "@/components/fleet/ui";
import { useCanEdit } from "@/components/edit-access";

/** What a link panel needs to know about the delegation. */
export type ShareDelegation = {
  id: string;
  name: string;
  head_of_delegation: string | null;
  head_contact: string | null;
  arrival_date: string | null;
  departure_date: string | null;
};

const ICONS = { aek: UserRound, region: MapPinned };

const COPY: Record<ShareKind, { about: string; waiting: string; create: string }> = {
  aek: {
    about: `A private page for the ${AEK_TITLE} to send travel times, their khuddam, daily activities, meal needs and itinerary. No sign-in needed.`,
    waiting: "Waiting for the AeK · nothing sent yet",
    create: "Create AeK link",
  },
  region: {
    about:
      "A private brief for the local operator: arrival, contacts, accommodation, food and transport on one page. They add the airport pickup and drop-off drivers. No sign-in needed.",
    waiting: "Waiting for the region · no drivers yet",
    create: "Create Region Guidance link",
  },
};

function shareMessage(kind: ShareKind, d: ShareDelegation, url: string) {
  const dates = d.arrival_date && d.departure_date ? ` (${dayRange(d.arrival_date, d.departure_date)})` : "";
  if (kind === "aek") {
    const greeting = d.head_of_delegation ? `Assalamo Alaikum ${d.head_of_delegation},` : "Assalamo Alaikum,";
    return `${greeting}\n\nPlease share your travel details, the khuddam in your group, your daily plans and meal needs for your visit to MKA UK (${d.name}) using this private link:\n${url}\n\nEverything you send is saved, so you can come back and update it at any time. JazakAllah.`;
  }
  return `Assalamo Alaikum,\n\nHere is the Region Guidance for ${d.name}${dates}: arrival, accommodation, food and transport on one page.\n\nPlease add the drivers for the airport pickup (and the drop-off, if you know them yet) here:\n${url}\n\nYou can add to it over the next few days. JazakAllah.`;
}

/**
 * Make, share and switch off a private link. Used on the Info tab (as a panel)
 * and from the delegations list (inside a pop-up).
 */
export function ShareLinkPanel({
  kind,
  delegation: d,
  state,
  bare = false,
}: {
  kind: ShareKind;
  delegation: ShareDelegation;
  state: ShareState;
  bare?: boolean;
}) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [copied, setCopied] = useState(false);
  const meta = SHARE_KINDS[kind];
  const text = COPY[kind];
  const Icon = ICONS[kind];
  const link = state.link;

  const message = link ? shareMessage(kind, d, link.url) : "";
  const phone = kind === "aek" ? (d.head_contact ?? "").replace(/[^\d]/g, "") : "";
  const whatsapp = `https://wa.me/${phone.length >= 8 ? phone : ""}?text=${encodeURIComponent(message)}`;
  const subject = kind === "aek" ? `Your visit to MKA UK: ${d.name}` : `Region Guidance: ${d.name}`;
  const email = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the link:", link.url);
    }
  };

  const body = (
    <>
      {!state.ready ? (
        <p className="muted-note">
          {meta.label} links aren&apos;t set up yet: run supabase/migrations/{meta.migration} in Supabase.
        </p>
      ) : link ? (
        <>
          <div className="aek-status">
            <span className={`aek-dot ${state.received ? "is-done" : ""}`} aria-hidden />
            <span>{state.received ? <strong>{state.received}</strong> : text.waiting}</span>
          </div>

          {canEdit && (
            <>
              <div className="aek-url">
                <input className="input" readOnly value={link.url} aria-label={`${meta.label} link`} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-icon" onClick={copy} title="Copy link">
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  <span className="sr-only">{copied ? "Copied" : "Copy link"}</span>
                </button>
              </div>
              <div className="aek-share">
                <a className="btn btn-sm aek-whatsapp" href={whatsapp} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> WhatsApp
                </a>
                <a className="btn btn-sm" href={email}>
                  <Mail size={15} /> Email
                </a>
                <button type="button" className="btn btn-sm" onClick={copy}>
                  <Copy size={15} /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </>
          )}

          <p className="muted-note aek-expiry">
            Works until {formatDate(link.expires)}. Made {formatDateTime(link.createdAt)}.
          </p>

          {canEdit && (
            <div className="aek-manage">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Make a new link? The current link will stop working straight away.")) {
                    run(() => createShareLink(d.id, kind), () => router.refresh());
                  }
                }}
              >
                <RefreshCw size={14} /> New link
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Switch the link off? It won't open any more.")) {
                    run(() => revokeShareLink(d.id, kind, link.id), () => router.refresh());
                  }
                }}
              >
                <XCircle size={14} /> Switch off
              </button>
            </div>
          )}
        </>
      ) : canEdit ? (
        <button
          type="button"
          className="btn btn-primary aek-create"
          disabled={pending}
          onClick={() => run(() => createShareLink(d.id, kind), () => router.refresh())}
        >
          <Link2 size={16} /> {pending ? "Creating…" : text.create}
        </button>
      ) : (
        <p className="muted-note">No {meta.label} link has been made yet.</p>
      )}
      <FormError error={error} />
    </>
  );

  if (bare) {
    return (
      <div className="share-bare">
        <p className="muted-note">{text.about}</p>
        {body}
      </div>
    );
  }

  return (
    <section className={`panel glass aek-panel is-${kind}`}>
      <div className="panel-head">
        <div>
          <h2 className="aek-title">
            <Icon size={18} /> {meta.label}
          </h2>
          <p className="muted-note">{text.about}</p>
        </div>
      </div>
      {body}
    </section>
  );
}

/** The two link buttons on each delegation in the list. */
export function ShareLinkButtons({
  delegation,
  aek,
  region,
}: {
  delegation: ShareDelegation;
  aek: ShareState;
  region: ShareState;
}) {
  const [open, setOpen] = useState<ShareKind | null>(null);
  const states = { aek, region };

  return (
    // Clicks here mustn't open the delegation behind it.
    <div className="share-buttons" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {(["aek", "region"] as const).map((kind) => {
        const s = states[kind];
        const Icon = ICONS[kind];
        const tone = s.received ? "is-done" : s.link ? "is-live" : "";
        const label = `${SHARE_KINDS[kind].label}: ${s.received ?? (s.link ? "sent, waiting" : "not made yet")}`;
        return (
          <button key={kind} type="button" className={`share-btn ${tone}`} onClick={() => setOpen(kind)} title={label} aria-label={label}>
            <Icon size={14} />
            {SHARE_KINDS[kind].short}
            <i aria-hidden />
          </button>
        );
      })}
      {open && (
        <Sheet title={`${SHARE_KINDS[open].label}: ${delegation.name}`} onClose={() => setOpen(null)}>
          <div className="sheet-body share-sheet">
            <ShareLinkPanel kind={open} delegation={delegation} state={states[open]} bare />
          </div>
        </Sheet>
      )}
    </div>
  );
}
