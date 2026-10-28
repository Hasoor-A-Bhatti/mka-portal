"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Camera, MapPin, Pencil, Siren, Trash2, User, Users } from "lucide-react";
import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  SEVERITIES,
  londonParts,
  todayISO,
  type FleetFile,
  type Incident,
} from "@/lib/fleet";
import { formatDateTime } from "@/lib/format";
import { deleteIncident, saveIncident } from "@/app/(portal)/fleet/actions";
import { Pill } from "./bits";
import { FileList, FormError, Sheet, UploadButton, uploadFleetFile, useRun } from "./ui";

export function IncidentsPanel({
  vehicleId,
  registration,
  incidents,
  photos,
  driverNames,
  canManage,
}: {
  vehicleId: string;
  registration: string;
  incidents: Incident[];
  photos: FleetFile[];
  driverNames: string[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ incident: Incident | null } | null>(null);
  const open = incidents.filter((i) => i.status !== "Resolved");

  return (
    <>
      <section className="report-banner glass">
        <span className="report-icon">
          <Siren size={22} />
        </span>
        <div>
          <h2>Something happened with {registration}?</h2>
          <p>Report accidents, damage, breakdowns, theft or fines straight away, with photos if you have them.</p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setEditing({ incident: null })}>
          <AlertTriangle size={18} />
          Report incident
        </button>
      </section>

      <section className="panel glass">
        <div className="panel-head">
          <h2>
            Incidents{" "}
            {open.length > 0 && <span className="count-badge">{open.length} open</span>}
          </h2>
        </div>

        {incidents.length === 0 ? (
          <div className="empty">
            <strong>No incidents reported</strong>
            Anything reported for this vehicle will be kept here.
          </div>
        ) : (
          <ul className="incident-list">
            {incidents.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                vehicleId={vehicleId}
                photos={photos.filter((p) => p.incident_id === i.id)}
                canManage={canManage}
                onEdit={() => setEditing({ incident: i })}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <IncidentDialog
          vehicleId={vehicleId}
          incident={editing.incident}
          driverNames={driverNames}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function IncidentCard({
  incident: i,
  vehicleId,
  photos,
  canManage,
  onEdit,
}: {
  incident: Incident;
  vehicleId: string;
  photos: FleetFile[];
  canManage: boolean;
  onEdit: () => void;
}) {
  const { pending, error, run } = useRun();
  const remove = () => {
    if (!window.confirm("Remove this incident report and its photos? This can't be undone.")) return;
    run(() => deleteIncident(vehicleId, i.id));
  };

  return (
    <li className={`incident sev-${i.severity.toLowerCase()}`}>
      <div className="incident-head">
        <div>
          <strong>{i.incident_type}</strong>
          <span className="incident-when">{formatDateTime(i.occurred_at)}</span>
        </div>
        <div className="incident-pills">
          <Pill value={i.severity} />
          <Pill value={i.status} />
        </div>
      </div>

      <p className="incident-desc">{i.description}</p>

      <div className="incident-facts">
        {i.driver_name && (
          <span>
            <User size={14} /> {i.driver_name}
          </span>
        )}
        {i.location && (
          <span>
            <MapPin size={14} /> {i.location}
          </span>
        )}
        {i.not_drivable && (
          <span className="flag">
            <Ban size={14} /> Not drivable
          </span>
        )}
        {i.third_party && (
          <span className="flag">
            <Users size={14} /> Third party involved
          </span>
        )}
      </div>

      {(i.third_party_details || i.police_reference || i.claim_reference) && (
        <dl className="kv compact">
          {i.third_party_details && (
            <>
              <dt>Third party</dt>
              <dd>{i.third_party_details}</dd>
            </>
          )}
          {i.police_reference && (
            <>
              <dt>Police ref.</dt>
              <dd>{i.police_reference}</dd>
            </>
          )}
          {i.claim_reference && (
            <>
              <dt>Claim ref.</dt>
              <dd>{i.claim_reference}</dd>
            </>
          )}
        </dl>
      )}

      {i.resolution && (
        <div className="incident-outcome">
          <span className="label">Outcome</span>
          <p>{i.resolution}</p>
        </div>
      )}

      <FileList files={photos} vehicleId={vehicleId} canDelete={canManage} thumbs />

      <div className="incident-foot">
        <small>
          Reported by {i.creator?.full_name ?? "unknown"} on {formatDateTime(i.created_at)}
        </small>
        <div className="toolbar">
          <UploadButton vehicleId={vehicleId} kind="incident" incidentId={i.id} multiple small label="Add photos" />
          {canManage && (
            <>
              <button type="button" className="icon-link" title="Update report" onClick={onEdit}>
                <Pencil size={16} />
                <span className="sr-only">Update report</span>
              </button>
              <button type="button" className="icon-link danger" title="Remove report" onClick={remove} disabled={pending}>
                <Trash2 size={16} />
                <span className="sr-only">Remove report</span>
              </button>
            </>
          )}
        </div>
      </div>
      <FormError error={error} />
    </li>
  );
}

function IncidentDialog({
  vehicleId,
  incident,
  driverNames,
  canManage,
  onClose,
}: {
  vehicleId: string;
  incident: Incident | null;
  driverNames: string[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { pending, error, setError, run } = useRun();
  const [thirdParty, setThirdParty] = useState(incident?.third_party ?? false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saved, setSaved] = useState(false);
  const when = incident ? londonParts(incident.occurred_at) : null;

  if (saved) {
    return (
      <Sheet title="Report saved" onClose={onClose}>
        <div className="sheet-body">
          <FormError error={error} />
          <p className="wide">You can add the remaining photos from the report with "Add photos".</p>
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={incident ? "Update incident" : "Report an incident"}
      subtitle={incident ? undefined : canManage ? "Ticking “not drivable” also marks the vehicle as Damaged." : "A Fleet department admin will be able to see this straight away."}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(async () => {
            const res = await saveIncident(vehicleId, incident?.id ?? null, fd);
            if (res.error || !res.id) return res;
            for (const file of photos) {
              const err = await uploadFleetFile({ vehicleId, kind: "incident", file, incidentId: res.id });
              if (err) {
                setSaved(true);
                router.refresh();
                return { error: `The report was saved, but a photo didn't upload. ${err}` };
              }
            }
            router.refresh();
          }, onClose);
        }}
      >
        <div className="sheet-body">
          <div className="field">
            <label htmlFor="i-type">
              What happened<span className="req">*</span>
            </label>
            <select id="i-type" name="incident_type" className="select" required defaultValue={incident?.incident_type ?? ""}>
              <option value="" disabled>
                Choose a type
              </option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-sev">Severity</label>
            <select id="i-sev" name="severity" className="select" defaultValue={incident?.severity ?? "Minor"}>
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-day">
              Date<span className="req">*</span>
            </label>
            <input id="i-day" name="occurred_on" type="date" className="input" required max={todayISO()} defaultValue={when?.day ?? todayISO()} />
          </div>
          <div className="field">
            <label htmlFor="i-time">Time (roughly)</label>
            <input id="i-time" name="occurred_time" type="time" className="input" defaultValue={when?.time ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-driver">Who was driving</label>
            <input id="i-driver" name="driver_name" className="input" list="i-drivers" defaultValue={incident?.driver_name ?? ""} placeholder="Name" />
            <datalist id="i-drivers">
              {driverNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="i-loc">Where</label>
            <input id="i-loc" name="location" className="input" defaultValue={incident?.location ?? ""} placeholder="Road, town or postcode" />
          </div>
          <div className="field wide">
            <label htmlFor="i-desc">
              Describe what happened<span className="req">*</span>
            </label>
            <textarea id="i-desc" name="description" className="textarea" required defaultValue={incident?.description ?? ""} placeholder="What happened, any damage, and anything the next driver should know" />
          </div>

          <label className="check wide">
            <input type="checkbox" name="not_drivable" defaultChecked={incident?.not_drivable} />
            <span>
              <strong>The vehicle isn't safe to drive</strong>
              <small>Flags it on the Fleet dashboard straight away</small>
            </span>
          </label>
          <label className="check wide">
            <input type="checkbox" name="third_party" checked={thirdParty} onChange={(e) => setThirdParty(e.target.checked)} />
            <span>
              <strong>Another vehicle or person was involved</strong>
            </span>
          </label>
          {thirdParty && (
            <div className="field wide">
              <label htmlFor="i-tp">Their details</label>
              <textarea id="i-tp" name="third_party_details" className="textarea" defaultValue={incident?.third_party_details ?? ""} placeholder="Name, phone, registration, insurer" />
            </div>
          )}
          <div className="field">
            <label htmlFor="i-police">Police reference</label>
            <input id="i-police" name="police_reference" className="input" defaultValue={incident?.police_reference ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="i-claim">Insurance claim reference</label>
            <input id="i-claim" name="claim_reference" className="input" defaultValue={incident?.claim_reference ?? ""} />
          </div>

          {incident && (
            <>
              <div className="field">
                <label htmlFor="i-status">Status</label>
                <select id="i-status" name="status" className="select" defaultValue={incident.status}>
                  {INCIDENT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field wide">
                <label htmlFor="i-res">Outcome</label>
                <textarea id="i-res" name="resolution" className="textarea" defaultValue={incident.resolution ?? ""} placeholder="Repairs done, claim settled, fine paid…" />
              </div>
            </>
          )}

          {!incident && (
            <div className="field wide">
              <label htmlFor="i-photos">Photos or documents</label>
              <label className="dropzone" htmlFor="i-photos">
                <Camera size={20} />
                <span>{photos.length ? `${photos.length} file${photos.length === 1 ? "" : "s"} chosen` : "Take or choose photos (PDF or image, up to 10 MB each)"}</span>
              </label>
              <input
                id="i-photos"
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  setError(null);
                  setPhotos(Array.from(e.target.files ?? []));
                }}
              />
            </div>
          )}
          <FormError error={error} />
        </div>
        <div className="sheet-foot">
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : incident ? "Save changes" : "Submit report"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
