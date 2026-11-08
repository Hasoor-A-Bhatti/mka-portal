"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Megaphone } from "lucide-react";

/** The public "Report an issue" page: open it, or copy the link to share. */
export function ReportLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy the link:", url);
    }
  };
  return (
    <section className="panel glass jd-report-link">
      <div className="panel-head">
        <h2>
          <Megaphone size={18} /> Report an issue page
        </h2>
      </div>
      <p className="muted-note">
        Anyone can report a problem here without signing in: guests, tenants, volunteers. Reports arrive as new tickets. Each room also has its own link on the property&apos;s
        Inspections tab, for QR stickers.
      </p>
      <div className="aek-url">
        <input className="input" readOnly value={url} aria-label="Report page link" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-icon" onClick={copy} title="Copy link">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span className="sr-only">{copied ? "Copied" : "Copy link"}</span>
        </button>
        <a className="btn btn-icon" href={url} target="_blank" rel="noreferrer" title="Open">
          <ExternalLink size={16} />
          <span className="sr-only">Open the report page</span>
        </a>
      </div>
    </section>
  );
}
