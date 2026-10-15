import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzePatientMedia, deletePatientMedia, getMediaFileUrl,
  listModels, listPatientMedia, uploadPatientMedia, explainFindings, getGradCam,
} from "../api/apiClient";
import { exportToPdf } from "../utils/exportPdf";
import { Page, linkCls } from "../components/ui";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.dcm,.dicom";
const THRESHOLD = 0.5;
// Pathologies scored by the chest X-ray models; shown as empty rows before analysis.
const PATHOLOGIES = ["Atelectasis", "Cardiomegaly", "Consolidation", "Edema", "Effusion", "Emphysema", "Fibrosis",
  "Hernia", "Infiltration", "Mass", "Nodule", "Pleural thickening", "Pneumonia", "Pneumothorax"];

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isDicom = (img) => /\.(dcm|dicom)$/i.test(img?.original_name || "");

function PathologyRows({ findings }) {
  const rows = findings
    ? [...findings].sort((a, b) => b.confidence - a.confidence)
    : PATHOLOGIES.map((label) => ({ label, confidence: null }));
  return (
    <div className="flex flex-col">
      <div className="flex justify-between pb-2 border-b border-ink eyebrow"><span>Pathology</span><span>Probability · threshold {THRESHOLD.toFixed(2)}</span></div>
      {rows.map((f, i) => {
        const on = f.confidence != null && f.confidence >= THRESHOLD;
        return (
          <div key={f.label} className={`grid grid-cols-[120px_minmax(0,1fr)_40px] gap-3 items-center py-1.5 border-b border-line text-[13px] ${
            f.confidence == null ? "text-slate-500" : on && i === 0 ? "font-semibold" : ""}`}>
            <span className="truncate">{f.label}</span>
            <div className="relative h-1.5 bg-sunken">
              {f.confidence != null && <div className={`h-full ${on ? "bg-risk-high" : "bg-line-strong"}`} style={{ width: `${f.confidence * 100}%` }} />}
              <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-line-strong" />
            </div>
            <span className="font-mono text-right">{f.confidence == null ? "—" : f.confidence.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ImagingPage() {
  const [patientId, setPatientId]   = useState("");
  const [images, setImages]         = useState([]);
  const [models, setModels]         = useState([]);
  const [selectedModel, setSelectedModel] = useState("densenet121-res224-all");
  const [dragOver, setDragOver]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [error, setError]           = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [explain, setExplain]       = useState({});   // fileId → { text | error | loading }
  const [heatmaps, setHeatmaps]     = useState({});   // fileId → { b64 | error | loading }
  const [loadingList, setLoadingList] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    listModels()
      .then((data) => {
        setModels(data.models ?? []);
        setSelectedModel(data.default ?? "densenet121-res224-all");
      })
      .catch(() => {});
  }, []);

  const effectivePatientId = patientId.trim() || "imaging-session";

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const invalid = files.filter(
      (f) => !f.type.startsWith("image/") && !f.name.toLowerCase().endsWith(".dcm") && !f.name.toLowerCase().endsWith(".dicom")
    );
    if (invalid.length) { setError("Only image files and DICOM (.dcm) files are accepted."); return; }
    setError(null);
    setUploading(true);
    try {
      const results = await Promise.all(files.map((f) => uploadPatientMedia(effectivePatientId, f)));
      setImages((prev) => [...results, ...prev]);
      setSelectedId(results[0]?.gridfs_id ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [effectivePatientId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleAnalyze = useCallback(async (img, modelName) => {
    setAnalyzingIds((prev) => new Set(prev).add(img.gridfs_id));
    setError(null);
    try {
      const analysis = await analyzePatientMedia(img.gridfs_id, modelName);
      setImages((prev) => prev.map((i) => i.gridfs_id === img.gridfs_id ? { ...i, analysis } : i));
    } catch (e) {
      setError(e?.response?.data?.error || "Analysis failed. Make sure the ML engine is running.");
    } finally {
      setAnalyzingIds((prev) => { const n = new Set(prev); n.delete(img.gridfs_id); return n; });
    }
  }, []);

  const handleDelete = useCallback(async (img) => {
    try {
      await deletePatientMedia(img.gridfs_id);
      setImages((prev) => prev.filter((i) => i.gridfs_id !== img.gridfs_id));
    } catch {
      setError("Delete failed");
    }
  }, []);

  const handleLoad = useCallback(async () => {
    const pid = patientId.trim();
    if (!pid) { setError("Enter a Patient ID to load existing images."); return; }
    setError(null);
    setLoadingList(true);
    try {
      const result = await listPatientMedia(pid);
      const imgs = result.filter((f) => f.file_type === "image");
      setImages(imgs);
      setSelectedId(imgs[0]?.gridfs_id ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load images");
    } finally {
      setLoadingList(false);
    }
  }, [patientId]);

  const current = images.find((i) => i.gridfs_id === selectedId) ?? images[0] ?? null;
  const findings = current?.analysis?.findings ?? null;
  const top = findings?.length ? [...findings].sort((a, b) => b.confidence - a.confidence)[0] : null;
  const exp = current ? explain[current.gridfs_id] : null;
  const heat = current ? heatmaps[current.gridfs_id] : null;
  const modelLabel = models.find((m) => (m.id ?? m.name ?? m) === selectedModel)?.label ?? selectedModel;

  const runExplain = async () => {
    const id = current.gridfs_id;
    setExplain((e) => ({ ...e, [id]: { loading: true } }));
    try {
      const data = await explainFindings(id, findings, selectedModel);
      setExplain((e) => ({ ...e, [id]: data.explanation ? { text: data.explanation } : { error: data.error ?? "Explanation unavailable." } }));
    } catch {
      setExplain((e) => ({ ...e, [id]: { error: "AI explanation is temporarily unavailable." } }));
    }
  };

  const runGradCam = async () => {
    const id = current.gridfs_id;
    setHeatmaps((h) => ({ ...h, [id]: { loading: true } }));
    try {
      const data = await getGradCam(id, selectedModel, top.label);
      setHeatmaps((h) => ({ ...h, [id]: data.heatmap_b64 ? { b64: data.heatmap_b64 } : { error: "Heatmap unavailable for this model." } }));
    } catch {
      setHeatmaps((h) => ({ ...h, [id]: { error: "Grad-CAM is temporarily unavailable." } }));
    }
  };

  const fieldCls = "h-8 bg-transparent border-b border-line-strong text-ink focus:outline-none focus:border-ink";

  return (
    <Page
      title="Imaging"
      sub="Upload chest X-rays or DICOM files. Choose a model and run AI pathology analysis per image."
      actions={findings && (
        <button type="button" className="btn-secondary h-9 text-sm"
          onClick={() => exportToPdf("imaging-results", "Imaging Analysis Report", "medicluster-imaging")}>
          Export PDF
        </button>
      )}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 border-b border-line text-[13px]">
        <form className="flex items-center gap-2 text-slate-600" onSubmit={(e) => { e.preventDefault(); handleLoad(); }}>
          Patient
          <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Patient ID"
            aria-label="Patient ID" className={`${fieldCls} w-32 font-mono`} />
          <button type="submit" disabled={loadingList} className={linkCls}>{loadingList ? "Loading…" : "Load"}</button>
        </form>
        <label className="flex items-center gap-2 text-slate-600">
          Model
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={`${fieldCls} max-w-[260px]`}>
            {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
            {models.map((m) => {
              const id = m.id ?? m.name ?? m;
              return <option key={id} value={id}>{m.label ?? id}</option>;
            })}
          </select>
        </label>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={`ml-auto ${linkCls}`}>
          {uploading ? "Uploading…" : "Upload images"}
        </button>
      </div>

      {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}

      <div id="imaging-results" className="flex flex-wrap gap-10 items-start">
        {/* ── Viewer ── */}
        <div className="flex-[3_1_440px] min-w-0 flex flex-col gap-3"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
          <div className="relative aspect-[4/3] bg-[#0e0f11] rounded-sm overflow-hidden flex flex-col items-center justify-center gap-3.5 p-8 text-center">
            {!current ? (
              <>
                <div className={`absolute inset-4 border border-dashed rounded-sm pointer-events-none ${dragOver ? "border-[#e9e6df]" : "border-[#3a3d42]"}`} />
                <span className="absolute top-[26px] left-7 font-mono text-[11px] text-[#8b8e93]">NO STUDY LOADED</span>
                <span className="absolute top-[26px] right-7 font-mono text-[11px] text-[#8b8e93]">{modelLabel}</span>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8b8e93" strokeWidth="1.3" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
                </svg>
                <span className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-[#e9e6df] max-w-[360px]">Drop chest X-rays or DICOM files</span>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="h-9 px-[18px] rounded-[3px] bg-[#e9e6df] text-[#0e0f11] font-medium">
                  {uploading ? "Uploading…" : "Choose files"}
                </button>
                <span className="text-xs text-[#8b8e93]">JPEG · PNG · GIF · WebP · DICOM (.dcm) · Max 50 MB each</span>
              </>
            ) : (
              <>
                {isDicom(current)
                  ? <span className="font-mono text-xs text-[#8b8e93]">DICOM preview unavailable — analysis still runs</span>
                  : <img src={getMediaFileUrl(current.gridfs_id)} alt={current.original_name} className="absolute inset-0 w-full h-full object-contain" />}
                {heat?.b64 && (
                  <img src={`data:image/png;base64,${heat.b64}`} alt={`Grad-CAM for ${top?.label}`}
                    className="absolute inset-0 w-full h-full object-contain mix-blend-screen opacity-70" />
                )}
                <span className="absolute top-3 left-3 font-mono text-[11px] text-[#8b8e93] truncate max-w-[60%]">{current.original_name}</span>
                <span className="absolute top-3 right-3 font-mono text-[11px] text-[#8b8e93]">{formatBytes(current.size)}</span>
                {heat?.b64 && <span className="absolute bottom-3 left-3 font-mono text-[11px] text-[#8b8e93]">Grad-CAM · {top?.label}</span>}
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {images.map((img) => {
              const on = img.gridfs_id === current?.gridfs_id;
              return (
                <button key={img.gridfs_id} type="button" onClick={() => setSelectedId(img.gridfs_id)} aria-pressed={on}
                  className={`relative w-24 h-[72px] bg-[#0e0f11] rounded-sm overflow-hidden ${on ? "outline outline-2 outline-ink outline-offset-1" : ""}`}>
                  {!isDicom(img) && <img src={getMediaFileUrl(img.gridfs_id)} alt="" className="w-full h-full object-cover opacity-80" />}
                  <span className="absolute bottom-1 left-1 right-1 font-mono text-[10px] text-[#c9c6bf] truncate text-left">{img.original_name}</span>
                </button>
              );
            })}
            {Array.from({ length: Math.max(0, 4 - images.length - 1) }, (_, i) => (
              <div key={`slot-${i}`} className="w-24 h-[72px] border border-dashed border-line-strong rounded-sm" aria-hidden="true" />
            ))}
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-24 h-[72px] border border-dashed border-line-strong rounded-sm text-xs text-slate-500 hover:bg-sunken">+ Add</button>
          </div>
          {current && (
            <button type="button" onClick={() => handleDelete(current)} className="self-start text-xs text-red-700 underline underline-offset-2">
              Remove this image
            </button>
          )}
        </div>

        {/* ── Findings ── */}
        <section className="flex-[2_1_300px] min-w-0 flex flex-col gap-[22px]" aria-live="polite">
          <div className="flex flex-col gap-2 pt-4 border-t border-ink">
            {!current ? (
              <>
                <span className="eyebrow">Awaiting image</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em] text-slate-600">No findings yet</span>
                <span className="text-[13px] text-slate-600 leading-normal">
                  Each image is scored for {PATHOLOGIES.length} pathologies. Scores above {THRESHOLD.toFixed(2)} are flagged and can be localized with a Grad-CAM region.
                </span>
              </>
            ) : !findings ? (
              <>
                <span className="eyebrow">Awaiting analysis</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em] text-slate-600">Not analyzed yet</span>
                <button type="button" onClick={() => handleAnalyze(current, selectedModel)} disabled={analyzingIds.has(current.gridfs_id)}
                  className="btn-primary h-10 self-start mt-2">
                  {analyzingIds.has(current.gridfs_id) ? "Analyzing…" : "Run analysis"}
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">{top && top.confidence >= THRESHOLD ? "Likely finding" : "No finding above threshold"}</span>
                <span className="font-serif text-[36px] leading-[1.05] tracking-[-0.02em]">{top?.label ?? "Clear"}</span>
                {exp?.text && <p className="text-[13px] text-slate-600 leading-normal whitespace-pre-line">{exp.text}</p>}
                {exp?.error && <p className="text-[13px] text-red-700">{exp.error}</p>}
                {heat?.error && <p className="text-[13px] text-red-700">{heat.error}</p>}
              </>
            )}
          </div>

          <PathologyRows findings={findings} />

          {findings && (
            <div className="flex gap-2.5 flex-wrap">
              {!exp?.text && (
                <button type="button" onClick={runExplain} disabled={exp?.loading} className="btn-primary h-10">
                  {exp?.loading ? "Explaining…" : "Explain findings"}
                </button>
              )}
              {top && !heat?.b64 && (
                <button type="button" onClick={runGradCam} disabled={heat?.loading} className="btn-secondary h-10">
                  {heat?.loading ? "Localizing…" : "Show Grad-CAM region"}
                </button>
              )}
              <button type="button" onClick={() => handleAnalyze(current, selectedModel)} disabled={analyzingIds.has(current.gridfs_id)}
                className="btn-secondary h-10">
                {analyzingIds.has(current.gridfs_id) ? "Analyzing…" : "Re-run"}
              </button>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
