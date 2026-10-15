import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getMlHealth } from "../api/apiClient";
import { NAV_GROUPS, NAV_ITEMS, isActive } from "../navigation";
import Logo from "./Logo";

const ML_POLL_MS = 30_000;

function NavItem({ item, active }) {
  const cls = `flex items-center gap-2 w-full h-[30px] px-2 rounded-sm text-[13.5px] text-left ${
    active ? "bg-ink text-paper font-medium" : "text-ink hover:bg-sunken"
  }`;
  const body = (
    <>
      <span className={`w-[18px] font-mono text-[11px] ${active ? "text-paper/70" : "text-slate-500"}`}>{item.num}</span>
      {item.label}
    </>
  );
  return item.href
    ? <a href={item.href} className={cls}>{body}</a>
    : <Link to={item.to} className={cls} aria-current={active ? "page" : undefined}>{body}</Link>;
}

function MlStatus() {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let alive = true;
    const check = () => getMlHealth()
      .then((r) => alive && setOnline(r.online))
      .catch(() => alive && setOnline(false));
    check();
    const id = setInterval(check, ML_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const color = online == null ? "bg-slate-300" : online ? "bg-risk-low" : "bg-risk-critical";
  const label = online == null ? "checking" : online ? "online" : "offline";
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600">
      <span className={`w-1.5 h-1.5 ${color}`} aria-hidden="true" />ML engine · {label}
    </div>
  );
}

// Enter on a page name opens that page; anything else is treated as a patient ID.
function Search() {
  const navigate = useNavigate();
  const ref = useRef();
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const page = NAV_ITEMS.find((i) => i.label.toLowerCase().startsWith(term.toLowerCase()));
    if (page?.href) window.location.href = page.href;
    else navigate(page ? page.to : `/patient/${encodeURIComponent(term)}`);
    setQ("");
    ref.current?.blur();
  };

  return (
    <form role="search" onSubmit={submit}
      className="flex items-center gap-2 flex-[0_1_260px] min-w-0 h-[30px] px-2.5 border border-line rounded-[3px] bg-surface text-slate-500 text-[13px] focus-within:border-ink">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" />
      </svg>
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patient ID or page"
        placeholder="Patient ID or page" className="flex-1 min-w-0 bg-transparent outline-none text-ink placeholder:text-slate-500" />
      <kbd className="hidden sm:inline font-mono text-[11px]">⌘K</kbd>
    </form>
  );
}

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen grid min-[860px]:grid-cols-[216px_minmax(0,1fr)] bg-paper text-ink">
      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-black/35 min-[860px]:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-[260px] transition-transform duration-200 ${menuOpen ? "translate-x-0" : "-translate-x-full"}
          min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen min-[860px]:w-auto min-[860px]:translate-x-0 min-[860px]:transition-none
          flex flex-col gap-7 px-3.5 pt-[22px] pb-[18px] border-r border-line bg-paper overflow-auto`}
      >
        <Link to="/" className="flex items-center gap-[9px] px-2 text-ink">
          <Logo className="w-[18px] h-[18px]" />
          <span className="font-serif text-[21px] tracking-[-0.01em]">MediCluster</span>
        </Link>

        <nav className="flex flex-col gap-5" aria-label="Main">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="flex flex-col gap-px">
              <div className="px-2 pb-1.5 font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500">{g.label}</div>
              {NAV_ITEMS.filter((i) => i.group === g.label).map((item) => (
                <NavItem key={item.label} item={item} active={!!item.to && isActive(item.to, pathname)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5 px-2 pt-3.5 border-t border-line">
          <MlStatus />
          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col leading-snug min-w-0">
              <span className="font-medium text-[13px] truncate" title={user?.email}>{user?.name}</span>
              <span className="text-xs text-slate-500 truncate">{user?.department}</span>
            </div>
            <button type="button" onClick={logout} className="text-xs text-slate-500 hover:text-ink shrink-0">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <div className="sticky top-0 z-20 h-14 flex items-center gap-2.5 px-4 min-[860px]:px-10 border-b border-line bg-paper">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="app-sidebar"
            className="min-[860px]:hidden h-10 min-w-11 px-2.5 border border-line-strong rounded-[3px] text-[13px]">
            {menuOpen ? "Close" : "Menu"}
          </button>
          <div className="flex-1 flex justify-end items-center gap-2.5 min-w-0">
            <Search />
            <Link to="/app"
              className="h-[30px] px-2.5 flex items-center border border-line-strong rounded-[3px] font-mono text-[11px] tracking-[0.04em] uppercase whitespace-nowrap hover:bg-sunken">
              Patient app
            </Link>
          </div>
        </div>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
