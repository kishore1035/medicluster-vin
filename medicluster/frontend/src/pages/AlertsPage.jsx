import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ackAlerts, listAlerts } from "../api/apiClient";
import { KV, Page, Segmented, Tag, linkCls } from "../components/ui";

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

function dayGroup(iso) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : "Earlier";
}

function Row({ alert, selected, onSelect }) {
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className={`w-full grid grid-cols-[52px_12px_minmax(0,1fr)_auto] gap-3 items-center px-2 py-3 border-b border-line text-left ${
          selected ? "bg-ink text-paper" : "hover:bg-sunken"}`}>
        <span className={`font-mono text-xs ${selected ? "text-paper/70" : "text-slate-500"}`}>{time(alert.at)}</span>
        <span aria-label={alert.read ? "Read" : "Unread"}
          className={`w-1.5 h-1.5 rounded-full ${alert.read ? "" : selected ? "bg-paper" : "bg-blue-600"}`} />
        <span className="flex flex-col min-w-0">
          <span className={`text-[13.5px] truncate ${alert.read ? "" : "font-semibold"}`}>{alert.title}</span>
          <span className={`font-mono text-[11px] ${selected ? "text-paper/70" : "text-slate-500"}`}>{alert.patientId} · {alert.source}</span>
        </span>
        <Tag tone={alert.severity} className={selected ? "!border-paper !text-paper" : ""} />
      </button>
    </li>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let alive = true;
    listAlerts()
      .then((a) => { if (alive) { setAlerts(a); setSelectedId(a[0]?.id ?? null); } })
      .catch((err) => alive && setError(err?.response?.data?.error || "Couldn't load alerts."));
    return () => { alive = false; };
  }, []);

  const markRead = async (ids) => {
    const unread = ids.filter((id) => alerts.find((a) => a.id === id && !a.read));
    if (!unread.length) return;
    try {
      await ackAlerts(unread);
      setAlerts((prev) => prev.map((a) => (unread.includes(a.id) ? { ...a, read: true } : a)));
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't update alerts.");
    }
  };

  const list = alerts ?? [];
  const counts = {
    all: list.length,
    unread: list.filter((a) => !a.read).length,
    critical: list.filter((a) => a.severity === "CRITICAL").length,
  };
  const shown = useMemo(() => list.filter((a) =>
    filter === "unread" ? !a.read : filter === "critical" ? a.severity === "CRITICAL" : true), [list, filter]);
  const groups = ["Today", "Yesterday", "Earlier"]
    .map((g) => [g, shown.filter((a) => dayGroup(a.at) === g)])
    .filter(([, items]) => items.length);
  const current = list.find((a) => a.id === selectedId);

  return (
    <Page title="Alerts" sub="Everything that needs a clinician’s attention, from every module.">
      <div className="flex flex-wrap justify-between items-center gap-3 pb-4 border-b border-line">
        <Segmented mono label="Filter alerts" value={filter} onChange={setFilter} options={[
          { value: "all", label: `All ${counts.all}` },
          { value: "unread", label: `Unread ${counts.unread}` },
          { value: "critical", label: `Critical ${counts.critical}` },
        ]} />
        {counts.unread > 0 && (
          <button type="button" onClick={() => markRead(list.map((a) => a.id))} className={`text-[13px] ${linkCls}`}>
            Mark all as read
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
      {!alerts && !error && <p className="text-[13px] text-slate-500" aria-busy="true">Loading alerts…</p>}
      {alerts && list.length === 0 && (
        <p className="text-[13px] text-slate-500">Nothing needs attention. New critical patients, missed doses and imaging findings show up here.</p>
      )}

      {list.length > 0 && (
        <div className="grid gap-10 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="flex flex-col gap-6 min-w-0">
            {groups.length === 0 && <p className="text-[13px] text-slate-500">Nothing in this view.</p>}
            {groups.map(([label, items]) => (
              <section key={label}>
                <h2 className="font-sans eyebrow pb-2 border-b border-ink">{label}</h2>
                <ul>
                  {items.map((a) => (
                    <Row key={a.id} alert={a} selected={a.id === selectedId} onSelect={() => setSelectedId(a.id)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {current && (
            <article className="flex flex-col gap-4 border-t border-ink pt-4 lg:sticky lg:top-20" aria-live="polite">
              <div className="flex items-center gap-2.5 font-mono text-xs text-slate-500">
                <Tag tone={current.severity} />{current.source} · {time(current.at)}
              </div>
              <h2 className="font-serif text-[32px] leading-[1.1] tracking-[-0.01em]">{current.title}</h2>
              <p className="text-[15px] leading-relaxed text-slate-600">{current.body}</p>
              <div>{current.facts.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>
              <div className="flex gap-2.5 flex-wrap pt-2">
                {!current.read
                  ? <button type="button" onClick={() => markRead([current.id])} className="btn-primary h-10">Acknowledge</button>
                  : <span className="eyebrow self-center">Acknowledged</span>}
                <Link to={current.link} className="btn-secondary h-10">
                  {current.source === "Reminders" ? "Open reminders" : "Open patient chart"}
                </Link>
              </div>
            </article>
          )}
        </div>
      )}
    </Page>
  );
}
