"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MapPin, MessageSquareWarning, UserRound } from "lucide-react";
import { sendReport } from "./actions";

export type Place = { id: string; name: string; rooms: string[] };

const CATEGORIES = ["Repair", "Defect", "Safety", "Damp or mould", "Security or access", "Pests", "Cleaning", "Grounds", "Other"];

export function ReportForm({ places, place, room }: { places: Place[]; place?: string; room?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState(place && places.some((p) => p.id === place) ? place : "");
  const rooms = places.find((p) => p.id === propertyId)?.rooms ?? [];

  if (ref) {
    return (
      <section className="visit-card glass glass-strong jd-report-done" role="status">
        <CheckCircle2 size={40} />
        <h2>Thank you. Your reference is {ref}.</h2>
        <p className="visit-lead">
          The Jaidad team will look at it and arrange what&apos;s needed. Please keep the reference, and quote it if you email jaidad@khuddam.co.uk, for example to send photos.
        </p>
        <button type="button" className="btn" onClick={() => setRef(null)}>
          Report something else
        </button>
      </section>
    );
  }

  return (
    <form
      className="visit-card glass glass-strong visit-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await sendReport(fd);
          if (r.error) setError(r.error);
          else if (r.ref) {
            setRef(r.ref);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
      }}
    >
      <fieldset className="visit-group">
        <legend>
          <MapPin size={18} /> Where
        </legend>
        <div className="visit-grid">
          <div className="field">
            <label htmlFor="rp-prop">Property</label>
            <select id="rp-prop" name="property_id" className="select" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Not sure</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-loc">Room or area</label>
            <input id="rp-loc" name="location" className="input" list="rp-rooms" maxLength={200} defaultValue={room ?? ""} placeholder="e.g. Ground floor shower room" />
            <datalist id="rp-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>
      </fieldset>

      <fieldset className="visit-group">
        <legend>
          <MessageSquareWarning size={18} /> What&apos;s wrong
        </legend>
        <div className="visit-grid">
          <div className="field">
            <label htmlFor="rp-cat">Type of problem</label>
            <select id="rp-cat" name="category" className="select" defaultValue="Repair">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp-urg">How urgent is it?</label>
            <select id="rp-urg" name="urgency" className="select" defaultValue="normal">
              <option value="normal">Not urgent</option>
              <option value="week">Needs attention this week</option>
              <option value="urgent">Urgent (but not an emergency)</option>
            </select>
          </div>
          <div className="field jd-span2">
            <label htmlFor="rp-title">In a few words</label>
            <input id="rp-title" name="title" className="input" maxLength={120} placeholder="e.g. Shower leaking" />
          </div>
          <div className="field jd-span2">
            <label htmlFor="rp-desc">
              What happened<span className="req">*</span>
            </label>
            <textarea id="rp-desc" name="description" className="textarea" required maxLength={4000} placeholder="What you saw, when you saw it, and anything you've already done" />
          </div>
        </div>
      </fieldset>

      <fieldset className="visit-group">
        <legend>
          <UserRound size={18} /> Your details
        </legend>
        <div className="visit-grid">
          <div className="field">
            <label htmlFor="rp-name">
              Your name<span className="req">*</span>
            </label>
            <input id="rp-name" name="name" className="input" required maxLength={120} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="rp-contact">
              Email or phone<span className="req">*</span>
            </label>
            <input id="rp-contact" name="contact" className="input" required maxLength={160} autoComplete="email" />
          </div>
        </div>
        {/* Hidden from people; only bots fill it in. */}
        <input name="website" tabIndex={-1} autoComplete="off" className="jd-hp" aria-hidden />
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" name="consent" required />
          <span>
            <strong>Jaidad may use these details to deal with this report.</strong>
            <small>Only the Jaidad team and the people they ask to help will see them.</small>
          </span>
        </label>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="visit-submit">
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
