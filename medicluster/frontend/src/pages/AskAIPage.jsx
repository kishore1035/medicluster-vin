import { useCallback, useRef, useState, useEffect } from "react";
import { aiChat } from "../api/apiClient";
import { Page, linkCls } from "../components/ui";
import { PromptInput } from "../components/ui/ai-chat-input";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

// Starter prompts shown before the first message.
const CATEGORIES = [
  { tag: "SKIN",  title: "Skin & rashes",  text: "I have an itchy red rash on my forearm" },
  { tag: "X-RAY", title: "X-ray findings", text: "What does this X-ray finding mean?" },
  { tag: "WOUND", title: "Wounds",         text: "My wound is swollen and warm — is it infected?" },
  { tag: "EYE",   title: "Eyes",           text: "Red, watery eye for two days" },
];

const LANGUAGES = [
  { code: "en",  label: "English" },
  { code: "hi",  label: "हिंदी" },
  { code: "kn",  label: "ಕನ್ನಡ" },
  { code: "te",  label: "తెలుగు" },
  { code: "ta",  label: "தமிழ்" },
];

function parseInline(text) {
  if (!text) return null;
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        return (
          <a
            key={idx}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline font-medium break-all"
          >
            {match[1]}
          </a>
        );
      }
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
    ) {
      return (
        <em key={idx} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={idx} className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[13px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Headings (###, ##, #)
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-[15px] font-bold text-slate-900 mt-4 mb-1.5 tracking-tight border-b border-slate-100 pb-1">
          {parseInline(trimmed.replace(/^###\s+/, ""))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-[16px] font-bold text-slate-900 mt-5 mb-2 tracking-tight border-b border-slate-200 pb-1">
          {parseInline(trimmed.replace(/^##\s+/, ""))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-[18px] font-bold text-slate-900 mt-5 mb-2 tracking-tight">
          {parseInline(trimmed.replace(/^#\s+/, ""))}
        </h1>
      );
      continue;
    }

    // Bullet lists (*, -, +, •)
    if (/^[\*\-\+\•]\s+/.test(trimmed)) {
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2.5 my-1 pl-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 mt-2 shrink-0" aria-hidden="true" />
          <div className="flex-1 text-[14px] text-slate-700 leading-relaxed">
            {parseInline(trimmed.replace(/^[\*\-\+\•]\s+/, ""))}
          </div>
        </div>
      );
      continue;
    }

    // Numbered lists (1., 2., etc.)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2.5 my-1 pl-1">
          <span className="font-semibold text-slate-800 text-[13px] shrink-0 min-w-[1.2rem]">
            {numMatch[1]}.
          </span>
          <div className="flex-1 text-[14px] text-slate-700 leading-relaxed">
            {parseInline(numMatch[2])}
          </div>
        </div>
      );
      continue;
    }

    // Regular paragraphs
    elements.push(
      <p key={`p-${i}`} className="my-1.5 text-[14px] text-slate-700 leading-relaxed">
        {parseInline(rawLine)}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export default function AskAIPage() {
  const [messages, setMessages]         = useState([]);      // [{role, content, images?}]
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [language, setLanguage]         = useState("en");
  const [userLocation, setUserLocation] = useState(null);
  const bottomRef                       = useRef();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (err) => {
          console.error("Error getting geolocation:", err.message);
        }
      );
    }
  }, []);

  const scrollBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);

  const handleChatSubmit = useCallback(async (question = "", attachedFiles = []) => {
    if (!question?.trim() && (!attachedFiles || attachedFiles.length === 0)) return;
    setLoading(true);
    setError(null);

    let convertedImages = [];
    if (attachedFiles && attachedFiles.length > 0) {
      convertedImages = await Promise.all(
        attachedFiles.map((file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataUrl = e.target.result;
              const base64 = dataUrl.split(",")[1];
              resolve({
                preview: dataUrl,
                base64,
                mediaType: file.type || "image/jpeg",
                name: file.name
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );
    }

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages];
    if (question?.trim() || convertedImages.length > 0) {
      next.push({
        role: "user",
        content: question?.trim() || "",
        images: convertedImages.length > 0 ? convertedImages : undefined
      });
    }
    setMessages(next);
    scrollBottom();

    try {
      const primaryImage = convertedImages[0];
      const data = await aiChat(
        primaryImage?.base64,
        primaryImage?.mediaType,
        history,
        (question || "").trim(),
        language,
        userLocation,
        convertedImages
      );
      setMessages([...next, { role: "assistant", content: data.reply }]);
      scrollBottom();
    } catch {
      setError("AI Assistant temporarily unavailable. Please try again.");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [messages, language, userLocation]);

  const reset = () => {
    setMessages([]);
    setError(null);
    setLanguage("en");
  };

  const count = messages.length;

  return (
    <Page
      title="CliniQ"
      sub="Chat about symptoms or share a medical image — get condition, prevention, treatment & medications."
    >
      <div className="max-w-[820px] w-full border-t border-ink">
        <div className="flex justify-between items-center gap-3 py-2.5 border-b border-line text-xs text-slate-500">
          <span className="font-mono tracking-[0.04em] uppercase">
            {count ? `Conversation · ${count} message${count === 1 ? "" : "s"}` : "New conversation"}
          </span>
          <div className="flex gap-4 items-center">
            <label className="flex items-center gap-1">Reply in
              <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Reply language"
                className="bg-transparent text-ink focus:outline-none">
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            {count > 0 && <button type="button" onClick={reset} className={linkCls}>New chat</button>}
          </div>
        </div>

        <div className="flex flex-col gap-7 py-7" role="log" aria-live="polite">
          {count === 0 && (
            <div className="flex flex-col gap-6 pt-4 pb-2">
              <p className="font-serif text-[28px] leading-[1.25] tracking-[-0.01em] max-w-[600px]">
                Describe a symptom or attach photos. CliniQ will suggest the likely condition, prevention, treatment and medications.
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-4">
                {CATEGORIES.map((c) => (
                  <button key={c.tag} type="button" onClick={() => handleChatSubmit(c.text, [])} disabled={loading}
                    className="flex flex-col gap-2 text-left hover:opacity-80">
                    <div className="w-full aspect-[4/3] rounded-sm flex items-end p-2 bg-[repeating-linear-gradient(135deg,#e9e6df_0_10px,#dcd8cf_10px_20px)]">
                      <span className="font-mono text-[11px] tracking-[0.06em] text-slate-600">{c.tag}</span>
                    </div>
                    <span className="text-[13.5px] font-medium">{c.title}</span>
                    <span className="text-[12.5px] text-slate-600 leading-snug">“{c.text}” →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => msg.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-2 pl-[20%]">
              {msg.images && msg.images.length > 0 && (
                <div className={`grid gap-2 ${msg.images.length === 1 ? "grid-cols-1 max-w-[240px]" : "grid-cols-2 sm:grid-cols-3 max-w-[420px]"}`}>
                  {msg.images.map((img, idx) => (
                    <figure key={idx} className="rounded overflow-hidden border border-line bg-surface shadow-xs">
                      <img src={img.preview} alt={img.name} className="w-full aspect-[4/3] object-cover" />
                      <figcaption className="font-mono text-[10px] text-slate-500 px-1.5 py-0.5 truncate text-center bg-slate-50">
                        {img.name}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {msg.content && (
                <div className="bg-ink text-paper px-3.5 py-2.5 text-[14px] leading-normal rounded-sm whitespace-pre-wrap">
                  {msg.content}
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 pr-[4%]">
              <span className="w-7 h-7 grid place-items-center border border-ink font-mono text-[11px] rounded-sm bg-slate-50 text-slate-900 font-bold" aria-hidden="true">Q</span>
              <div className="text-[14px] text-slate-700 leading-relaxed bg-white/70 p-3.5 rounded-sm border border-slate-200/60 shadow-xs">
                {renderMarkdown(msg.content)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 items-center">
              <span className="w-7 h-7 grid place-items-center border border-ink rounded-sm"><span className="spinner w-3.5 h-3.5" /></span>
              <span className="eyebrow">
                Thinking…
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" className="text-[13px] text-red-700 pb-3">{error}</p>}

        <div className="w-full flex justify-center pt-2">
          <PromptInput
            className="w-full"
            fullWidth={true}
            showModelSelect={false}
            showEffort={false}
            placeholder={count ? "Ask a follow-up, or describe a symptom…" : "Describe a symptom or attach photos…"}
            disabled={loading}
            onSubmit={(text, meta) => handleChatSubmit(text, meta.attachments)}
          />
        </div>
        <p className="pt-4 text-xs text-slate-500 text-center">AI guidance only. Not a diagnosis — consult a clinician before starting treatment.</p>
      </div>
    </Page>
  );
}
