import { useCallback, useRef, useState, useEffect } from "react";
import { aiChat } from "../api/apiClient";
import { Page, linkCls } from "../components/ui";

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

function renderMarkdown(text) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    return (
      <span key={i}>
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
            const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (match) {
              return (
                <a 
                  key={j} 
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
          return part;
        })}
        <br />
      </span>
    );
  });
}

export default function AskAIPage() {
  const [image, setImage]           = useState(null);   // { preview, base64, mediaType, name }
  const [messages, setMessages]     = useState([]);      // [{role, content, isImage?}]
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [error, setError]           = useState(null);
  const [language, setLanguage]     = useState("en");
  const [userLocation, setUserLocation] = useState(null);
  const inputRef                    = useRef();
  const fileInputRef                = useRef();
  const bottomRef                   = useRef();

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

  const loadImage = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload a valid image file (JPEG, PNG, GIF, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      setImage({ preview: dataUrl, base64, mediaType: file.type, name: file.name });
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
  }, [loadImage]);

  const send = useCallback(async (question = "") => {
    if (!image && !question.trim()) return;
    setLoading(true);
    setError(null);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages];
    if (question) next.push({ role: "user", content: question });
    setMessages(next);
    scrollBottom();

    try {
      const data = await aiChat(image?.base64, image?.mediaType, history, question, language, userLocation);
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setInput("");
      scrollBottom();
    } catch {
      setError("AI Assistant temporarily unavailable. Please try again.");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [image, messages, language, userLocation]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !loading) {
      e.preventDefault();
      if (messages.length === 0) {
        send(input.trim() || "");
      } else if (input.trim()) {
        send(input.trim());
      }
    }
  };

  const reset = () => {
    setImage(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLanguage("en");
  };

  const submit = () => {
    if (loading) return;
    if (input.trim() || (image && messages.length === 0)) send(input.trim());
  };
  const count = messages.length + (image ? 1 : 0);

  return (
    <Page
      title="CliniQ"
      sub="Chat about symptoms or share a medical image — get condition, prevention, treatment & medications."
    >
      <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => { if (e.target.files[0]) loadImage(e.target.files[0]); e.target.value = ""; }} />

      <div className="max-w-[820px] w-full border-t border-ink"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
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

        <div className={`flex flex-col gap-7 py-7 ${dragOver ? "bg-sunken" : ""}`} role="log" aria-live="polite">
          {count === 0 && (
            <div className="flex flex-col gap-6 pt-4 pb-2">
              <p className="font-serif text-[28px] leading-[1.25] tracking-[-0.01em] max-w-[600px]">
                Describe a symptom or attach a photo. CliniQ will suggest the likely condition, prevention, treatment and medications.
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-4">
                {CATEGORIES.map((c) => (
                  <button key={c.tag} type="button" onClick={() => send(c.text)} disabled={loading}
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

          {image && (
            <div className="flex flex-col items-end gap-2 pl-[20%]">
              <figure className="w-[200px]">
                <img src={image.preview} alt={image.name} className="w-full aspect-[4/3] object-cover rounded-sm" />
                <figcaption className="font-mono text-[11px] text-slate-500 mt-1 truncate">{image.name}</figcaption>
              </figure>
            </div>
          )}

          {messages.map((msg, i) => msg.role === "user" ? (
            <div key={i} className="flex justify-end pl-[20%]">
              <div className="bg-ink text-paper px-3.5 py-2.5 text-[14px] leading-normal rounded-sm">{msg.content}</div>
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 pr-[8%]">
              <span className="w-7 h-7 grid place-items-center border border-ink font-mono text-[11px] rounded-sm" aria-hidden="true">Q</span>
              <div className="text-[14px] text-slate-600 leading-relaxed">{renderMarkdown(msg.content)}</div>
            </div>
          ))}

          {loading && (
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 items-center">
              <span className="w-7 h-7 grid place-items-center border border-ink rounded-sm"><span className="spinner w-3.5 h-3.5" /></span>
              <span className="eyebrow">{image ? "Analyzing image…" : "Thinking…"}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" className="text-[13px] text-red-700 pb-3">{error}</p>}

        <div className="border border-ink rounded-[3px] bg-surface">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={count ? "Ask a follow-up, or describe a symptom…" : "Describe a symptom…"} disabled={loading} rows={2}
            aria-label="Message" className="w-full resize-none bg-transparent px-3 pt-3 text-[14px] focus:outline-none disabled:opacity-50" />
          <div className="flex items-center gap-3 px-3 pb-3 text-xs">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-slate-600 hover:text-ink">
              {image ? "Change image" : "+ Attach image"}
            </button>
            <span className="font-mono text-slate-500">JPEG · PNG · GIF · WebP</span>
            <button type="button" onClick={submit} disabled={loading || (!input.trim() && !(image && messages.length === 0))}
              className="btn-primary h-8 px-3.5 text-[13px] ml-auto">
              {image && messages.length === 0 && !input.trim() ? "Analyze" : "Send"}
            </button>
          </div>
        </div>
        <p className="pt-6 text-xs text-slate-500">AI guidance only. Not a diagnosis — consult a clinician before starting treatment.</p>
      </div>
    </Page>
  );
}
