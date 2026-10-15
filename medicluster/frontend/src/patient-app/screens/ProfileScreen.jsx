import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePatient } from "../PatientApp";
import { Body, ListHeader, TopBar, ErrorNote } from "../ui";

const field = "h-11 px-3 border border-line-strong rounded bg-surface text-sm focus:outline-none focus:border-ink w-full";

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/** datetime-local value in local time. */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formFromProfile(profile) {
  const v = profile?.nextVisit ?? {};
  const c = profile?.emergencyContact ?? {};
  return {
    name: profile?.name ?? "",
    visitAt: toLocalInput(v.at),
    doctor: v.doctor ?? "",
    department: v.department ?? "",
    location: v.location ?? "",
    checklist: (v.checklist ?? []).map((i) => i.label).join("\n"),
    contactName: c.name ?? "",
    contactRelation: c.relation ?? "",
    contactPhone: c.phone ?? "",
  };
}

/** Setup (choose patient ID) or edit profile, visit and emergency contact. */
export default function ProfileScreen({ setup = false }) {
  const { patientId, setPatientId, profile, saveProfile, apiError } = usePatient();
  const navigate = useNavigate();
  const [idInput, setIdInput] = useState(patientId);
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setForm(formFromProfile(profile)), [profile]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (setup) {
    const start = (e) => {
      e.preventDefault();
      if (idInput.trim()) setPatientId(idInput.trim());
    };
    return (
      <Body className="px-[22px] pt-16 pb-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-[0.08em] text-slate-500">MEDICLUSTER</span>
          <h1 className="m-0 font-serif text-[34px] leading-[1.1]">Your medicines, readings and care team in one place.</h1>
        </div>
        <form onSubmit={start} className="flex flex-col gap-4">
          <Field label="Patient ID (on your hospital card)">
            <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="e.g. P072" className={field} autoFocus />
          </Field>
          <button disabled={!idInput.trim()} className="h-12 rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-40">
            Continue
          </button>
        </form>
        <Link to="/" className="mt-auto text-[13px] text-blue-600">Clinician? Open MediCluster</Link>
      </Body>
    );
  }

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const previous = new Map((profile?.nextVisit?.checklist ?? []).map((i) => [i.label, i.done]));
    try {
      await saveProfile({
        name: form.name,
        nextVisit: {
          at: form.visitAt ? new Date(form.visitAt).toISOString() : null,
          doctor: form.doctor.trim(),
          department: form.department.trim(),
          location: form.location.trim(),
          checklist: form.checklist.split("\n").map((l) => l.trim()).filter(Boolean)
            .map((label) => ({ label, done: previous.get(label) ?? false })),
        },
        emergencyContact: {
          name: form.contactName.trim(),
          relation: form.contactRelation.trim(),
          phone: form.contactPhone.trim(),
        },
      });
      navigate(-1);
    } catch (err) {
      setError(apiError(err));
      setSaving(false);
    }
  };

  const switchPatient = () => {
    setPatientId("");
    navigate("/app");
  };

  return (
    <>
      <TopBar back="/app" backLabel="Cancel" title="Profile" />
      <Body>
        <form onSubmit={save} className="p-[22px] flex flex-col gap-[22px]">
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-col gap-3">
            <ListHeader title="You" meta={patientId} />
            <Field label="Name"><input value={form.name} onChange={set("name")} className={field} autoComplete="name" /></Field>
          </div>

          <div className="flex flex-col gap-3">
            <ListHeader title="Next visit" />
            <Field label="Date and time"><input type="datetime-local" value={form.visitAt} onChange={set("visitAt")} className={field} /></Field>
            <Field label="Doctor"><input value={form.doctor} onChange={set("doctor")} placeholder="Dr. A. Rao" className={field} /></Field>
            <Field label="Department"><input value={form.department} onChange={set("department")} placeholder="Internal Medicine" className={field} /></Field>
            <Field label="Where"><input value={form.location} onChange={set("location")} placeholder="Hospital, block, room" className={field} /></Field>
            <Field label="Bring to your visit (one per line)">
              <textarea value={form.checklist} onChange={set("checklist")} rows={3} className={`${field} h-auto py-2`} />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            <ListHeader title="Emergency contact" />
            <Field label="Name"><input value={form.contactName} onChange={set("contactName")} className={field} /></Field>
            <Field label="Relation"><input value={form.contactRelation} onChange={set("contactRelation")} placeholder="son, daughter, spouse…" className={field} /></Field>
            <Field label="Phone"><input type="tel" value={form.contactPhone} onChange={set("contactPhone")} className={field} autoComplete="tel" /></Field>
          </div>

          <button disabled={saving} className="h-12 rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <div className="flex justify-between text-[13px]">
            <button type="button" onClick={switchPatient} className="text-blue-600">Switch patient</button>
            <Link to="/" className="text-blue-600">Clinician app</Link>
          </div>
        </form>
      </Body>
    </>
  );
}
