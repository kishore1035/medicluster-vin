import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { aiChat } from "../../api/apiClient";
import { usePatient } from "../PatientApp";
import { Eyebrow, ErrorNote } from "../ui";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "te", label: "తెలుగు" },
  { value: "ta", label: "தமிழ்" },
];

/** Split a CliniQ reply into its numbered "**Heading**: body" sections. */
function parseSections(text) {
  const sections = [];
  let intro = "";
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:#+\s*)?\d+\.\s*\*\*(.+?)\*\*:?\s*(.*)$/);
    if (m) sections.push({ title: m[1].replace(/:$/, "").trim(), body: m[2] });
    else if (sections.length) sections.at(-1).body += `\n${line}`;
    else intro += `${line}\n`;
  }
  return { intro: intro.trim(), sections: sections.map((s) => ({ ...s, body: s.body.trim() })) };
}

/** Minimal markdown: paragraphs, "- " bullets and **bold**. */
function RichText({ text, className = "" }) {
  const inline = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    );
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {text.split("\n").filter((l) => l.trim()).map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const clean = line.replace(/^#+\s*/, "");
        return bullet
          ? <p key={i} className="m-0 pl-3 relative before:content-['·'] before:absolute before:left-0">{inline(bullet[1])}</p>
          : <p key={i} className="m-0">{inline(clean)}</p>;
      })}
    </div>
  );
}

function AssistantReply({ text, doctor, onShare }) {
  const { intro, sections } = parseSections(text);
  const [open, setOpen] = useState(null);

  if (sections.length < 2) {
    return <RichText text={text} className="pr-5 text-sm leading-relaxed text-slate-600" />;
  }

  const [headline, ...rest] = sections;
  const [title, ...summary] = headline.body.split(/(?<=[.!?])\s+|\n/);
  return (
    <div className="flex flex-col gap-2.5 pr-5">
      <Eyebrow>LIKELY · AI GUIDANCE</Eyebrow>
      <span className="font-serif text-[26px] leading-[1.1]">{title.replace(/\*\*/g, "")}</span>
      {(summary.length > 0 || intro) && (
        <RichText text={[intro, summary.join(" ")].filter(Boolean).join("\n")} className="text-sm leading-relaxed text-slate-600" />
      )}
      <div className="flex flex-col border-t border-line">
        {rest.map((s, i) => (
          <div key={i} className="border-b border-line">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="w-full flex justify-between items-center min-h-12 text-sm text-left"
            >
              <span>{s.title}</span>
              <span className={`text-slate-500 transition-transform ${open === i ? "rotate-90" : ""}`}>›</span>
            </button>
            {open === i && <RichText text={s.body} className="pb-3 text-sm leading-relaxed text-slate-600" />}
          </div>
        ))}
      </div>
      <button
        onClick={() => onShare(text)}
        className="flex justify-between items-center p-3 border border-ink rounded text-[13px]"
      >
        <span>Share with {doctor || "your doctor"}</span>
        <span className="font-mono">→</span>
      </button>
    </div>
  );
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ url, base64: url.split(",")[1], mediaType: file.type, name: file.name });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function CliniqScreen() {
  const { profile, apiError } = usePatient();
  const [language, setLanguage] = useState("en");
  const [messages, setMessages] = useState([]); // { role, content, image? }
  const [image, setImage] = useState(null);      // image for the whole conversation
  const [pendingImage, setPendingImage] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const location = useRef(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => { location.current = { latitude: p.coords.latitude, longitude: p.coords.longitude }; },
      () => {},
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose a photo.");
    if (file.size > 8 * 1024 * 1024) return setError("That photo is too large (max 8 MB).");
    setError("");
    setPendingImage(await readImage(file));
  };

  const send = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (sending || (!question && !pendingImage)) return;

    const convoImage = pendingImage ?? image;
    const history = messages.map(({ role, content }) => ({ role, content }));
    const userMsg = { role: "user", content: question || "Please look at this photo.", image: pendingImage?.url };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPendingImage(null);
    if (pendingImage) setImage(pendingImage);
    setSending(true);
    setError("");
    try {
      const data = await aiChat(
        convoImage?.base64 ?? null, convoImage?.mediaType, history, userMsg.content, language, location.current
      );
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const share = async (text) => {
    const shareText = `CliniQ guidance (AI, not a diagnosis):\n\n${text}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CliniQ guidance", text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setNotice("Copied — paste it into a message to your doctor.");
    } catch (err) {
      if (err?.name !== "AbortError") setNotice("Couldn't share. Try copying the text instead.");
    }
  };

  return (
    <>
      <div className="shrink-0 flex justify-between items-center px-[22px] py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <Link to="/app" aria-label="Back to Today" className="text-blue-600 text-[15px]">‹</Link>
          <span className="font-serif text-[22px]">CliniQ</span>
        </div>
        <label className="text-[13px] text-slate-600">
          <span className="sr-only">Reply language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-transparent border-0 text-[13px] text-slate-600 focus:ring-0 cursor-pointer"
          >
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[18px] pt-[18px] pb-4 flex flex-col gap-[18px]">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pr-5">
            <Eyebrow>ASK ABOUT A SYMPTOM</Eyebrow>
            <span className="font-serif text-[26px] leading-[1.1]">What’s bothering you?</span>
            <p className="m-0 text-sm leading-relaxed text-slate-600">
              Describe it in your own words, or add a photo of a rash, wound or report.
              CliniQ explains it in plain language and tells you when to see a doctor.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1.5">
              {m.image && <img src={m.image} alt="Your photo" className="w-[150px] aspect-[4/3] object-cover rounded-sm" />}
              <div className="max-w-[84%] px-[13px] py-2.5 bg-ink text-paper rounded text-sm leading-snug whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <AssistantReply key={i} text={m.content} doctor={profile?.nextVisit?.doctor} onShare={share} />
          )
        )}

        {sending && <span className="font-mono text-xs text-slate-500" aria-live="polite">CliniQ is thinking…</span>}
        <ErrorNote>{error}</ErrorNote>
        {notice && <span className="text-xs text-emerald-700" aria-live="polite">{notice}</span>}
        {messages.length > 0 && (
          <p className="m-0 text-[11px] text-slate-500">AI guidance only. Not a diagnosis. In an emergency, call 108.</p>
        )}
      </div>

      <form onSubmit={send} className="shrink-0 px-3.5 pt-2.5 pb-7 border-t border-line bg-surface flex flex-col gap-2">
        {pendingImage && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <img src={pendingImage.url} alt="" className="w-10 h-10 object-cover rounded-sm" />
            <span className="font-mono truncate flex-1">{pendingImage.name}</span>
            <button type="button" onClick={() => setPendingImage(null)} className="text-blue-600">Remove</button>
          </div>
        )}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add a photo"
            className="w-11 h-11 shrink-0 grid place-items-center border border-line-strong rounded text-xl"
          >
            +
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickImage} className="hidden" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={messages.length ? "Ask a follow-up…" : "Describe your symptom…"}
            aria-label="Message"
            className="flex-1 min-w-0 h-11 px-3 border border-line-strong rounded bg-transparent text-sm placeholder:text-slate-500 focus:outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && !pendingImage)}
            aria-label="Send"
            className="w-11 h-11 shrink-0 grid place-items-center bg-ink text-paper rounded font-mono disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </form>
    </>
  );
}
