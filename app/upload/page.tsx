"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

type BgKey = "corporativo" | "startup" | "empresa" | "executivo" | "minimalista";
type JobStatus = "queued" | "processing" | "done" | "error";

type Job = {
  id: string;
  status: JobStatus;
  progress: number;
  background: string;
  createdAt: number;
  uploadId?: string;
  resultUrls?: string[];
};

const BACKGROUNDS: Array<{ key: BgKey; title: string; desc: string; thumb: string }> = [
  { key: "corporativo", title: "Escritório Corporativo", desc: "Ambiente profissional com escritório elegante ao fundo", thumb: "/mock/corporativo-1.png" },
  { key: "startup",     title: "Startup Moderna",        desc: "Ambiente moderno com design clean",                  thumb: "/mock/startup-1.jpg" },
  { key: "empresa",     title: "Empresa com Pessoas",    desc: "Clima empresarial com pessoas ao fundo desfocadas",   thumb: "/mock/empresa-1.jpg" },
  { key: "executivo",   title: "Executivo Fundo Escuro", desc: "Fundo escuro premium estilo CEO",                    thumb: "/mock/executivo-1.jpg" },
  { key: "minimalista", title: "Minimalista Branco",     desc: "Fundo branco clean estilo LinkedIn",                 thumb: "/mock/minimalista-1.jpg" },
];

function cn(...c: Array<string | false | undefined | null>) { return c.filter(Boolean).join(" "); }

function statusLabel(s?: JobStatus) {
  if (s === "queued")     return "Na fila…";
  if (s === "processing") return "Processando…";
  if (s === "done")       return "Concluído";
  if (s === "error")      return "Erro";
  return "—";
}

async function compressImage(file: File, maxPx = 1024, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error("Falha ao comprimir imagem")),
        "image/jpeg", quality
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadFile(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append("file", compressed, "photo.jpg");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Falha no upload.");
  return String(data.uploadId);
}

export default function UploadPage() {
  const [selectedBg, setSelectedBg]   = useState<BgKey>("empresa");
  const [files, setFiles]             = useState<File[]>([]);
  const [previews, setPreviews]       = useState<string[]>([]);
  const [primaryIdx, setPrimaryIdx]   = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging]   = useState(false);

  const [isWorking, setIsWorking] = useState(false);
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<Job | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const selectedBgObj = useMemo(() => BACKGROUNDS.find((b) => b.key === selectedBg)!, [selectedBg]);

  // Build / revoke preview URLs whenever files change
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    setUploadedUrl(null);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming)
      .filter((f) => ["image/jpeg", "image/png"].includes(f.type))
      .slice(0, 5);
    if (!valid.length) { setError("Selecione apenas JPG ou PNG."); return; }
    setFiles((prev) => {
      const merged = [...prev, ...valid].slice(0, 5);
      if (prev.length === 0) setPrimaryIdx(0);
      return merged;
    });
    setError(null);
  }, []);

  async function createJob() {
    if (!files.length) { setError("Selecione pelo menos uma foto."); return; }
    setError(null);
    setIsWorking(true);
    try {
      // Upload primary photo (or use cached URL)
      const url = uploadedUrl ?? await (async () => {
        const u = await uploadFile(files[primaryIdx] ?? files[0]);
        setUploadedUrl(u);
        return u;
      })();

      const res  = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: selectedBg, uploadId: url }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Falha ao criar job.");

      const id = String(data.jobId);
      setJobId(id);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => fetchJob(id), 700);
      await fetchJob(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setIsWorking(false);
    }
  }

  async function fetchJob(id: string) {
    try {
      const res  = await fetch(`/api/job?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Erro ao buscar status.");
      const j: Job = data.job;
      setJob(j);
      if (j.status === "done" || j.status === "error") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (e: unknown) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      setError(e instanceof Error ? e.message : "Erro ao atualizar status.");
    }
  }

  function resetAll() {
    setFiles([]); setPreviews([]); setPrimaryIdx(0);
    setUploadedUrl(null); setJobId(null); setJob(null); setError(null);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  const progress = job?.progress ?? 0;
  const isBusy   = isWorking || job?.status === "processing" || job?.status === "queued";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Criar headshot profissional</h1>
            <p className="mt-2 text-gray-400 text-sm">
              Envie até 5 fotos com boa iluminação — a IA escolhe a melhor referência para o seu rosto.
            </p>
          </div>
          <a href="/" className="rounded-xl border border-gray-700 bg-black/30 px-5 py-2 text-sm hover:border-gray-500 transition">
            Voltar
          </a>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* ── STEP 1: Upload ── */}
          <section className="rounded-2xl border border-gray-800 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">1) Suas fotos</h2>
              {files.length > 0 && (
                <span className="text-xs text-gray-400">{files.length}/5 fotos</span>
              )}
            </div>

            {/* Drop zone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
              className={cn(
                "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition",
                isDragging ? "border-green-500 bg-green-500/10" : "border-gray-700 bg-black/30 hover:border-gray-500"
              )}
            >
              <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <div className="text-center">
                <p className="text-sm text-gray-200 font-medium">Arraste ou clique para selecionar</p>
                <p className="mt-1 text-xs text-gray-400">JPG/PNG · até 5 fotos · rosto centralizado e boa luz</p>
              </div>
              <input className="hidden" type="file" accept="image/png,image/jpeg" multiple
                onChange={(e) => addFiles(e.target.files)} />
            </label>

            {/* Photo thumbnails */}
            {previews.length > 0 && (
              <div className="mt-5">
                <p className="text-xs text-gray-400 mb-2">
                  Clique numa foto para definir como <span className="text-green-400">principal</span> (usada como referência)
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {previews.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setPrimaryIdx(i); setUploadedUrl(null); }}
                      className={cn(
                        "relative overflow-hidden rounded-lg border-2 transition aspect-square",
                        i === primaryIdx ? "border-green-500" : "border-gray-700 hover:border-gray-500"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                      {i === primaryIdx && (
                        <div className="absolute bottom-0 left-0 right-0 bg-green-500/80 text-center text-[10px] font-bold text-black py-0.5">
                          Principal
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, j) => j !== i));
                          setPrimaryIdx((prev) => Math.max(0, prev > i ? prev - 1 : prev));
                          setUploadedUrl(null);
                        }}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white text-[10px] hover:bg-red-600"
                      >
                        ×
                      </button>
                    </button>
                  ))}
                  {files.length < 5 && (
                    <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-500 transition">
                      <span className="text-2xl text-gray-600">+</span>
                      <input className="hidden" type="file" accept="image/png,image/jpeg" multiple
                        onChange={(e) => addFiles(e.target.files)} />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="mt-5 rounded-xl bg-white/5 px-4 py-3 text-xs text-gray-400 space-y-1">
              <p className="font-medium text-gray-300">Dicas para melhores resultados:</p>
              <p>✓ Rosto centralizado e bem iluminado</p>
              <p>✓ Fundo simples (parede, cortina)</p>
              <p>✓ Sem óculos escuros ou chapéu</p>
              <p>✓ Múltiplas fotos = mais consistência</p>
            </div>
          </section>

          {/* ── STEP 2: Background ── */}
          <section className="rounded-2xl border border-gray-800 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">2) Escolha o estilo</h2>
            <div className="mt-4 space-y-2">
              {BACKGROUNDS.map((bg) => {
                const active = bg.key === selectedBg;
                return (
                  <button
                    key={bg.key}
                    type="button"
                    onClick={() => setSelectedBg(bg.key)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition",
                      active ? "border-green-600 bg-green-600/20" : "border-gray-800 bg-black/30 hover:border-gray-600"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bg.thumb} alt={bg.title} className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{bg.title}</div>
                        <div className="text-xs text-gray-400">{bg.desc}</div>
                      </div>
                      {active && <div className="ml-auto h-3 w-3 rounded-full bg-green-500 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── STEP 3: Generate ── */}
        <section className="mt-6 rounded-2xl border border-gray-800 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">3) Gerar</h2>

          {error && (
            <div className="mt-4 rounded-xl border border-red-600/40 bg-red-600/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={createJob}
              disabled={isBusy}
              className={cn(
                "rounded-xl px-7 py-3 font-semibold transition text-sm",
                isBusy ? "cursor-not-allowed bg-gray-700 text-gray-400" : "bg-green-500 text-black hover:bg-green-400"
              )}
            >
              {isWorking           ? "Enviando…"
                : job?.status === "queued"     ? "Na fila…"
                : job?.status === "processing" ? "Gerando…"
                : "✨ Gerar 4 variações"}
            </button>

            <button
              type="button"
              onClick={resetAll}
              className="rounded-xl border border-gray-700 bg-black/30 px-6 py-3 text-sm text-gray-300 hover:border-gray-500 transition"
            >
              Resetar
            </button>

            <span className="text-xs text-gray-500">
              Estilo: <span className="text-gray-300">{selectedBgObj.title}</span>
              {files.length > 0 && <> · {files.length} foto{files.length > 1 ? "s" : ""}</>}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
              <span>{statusLabel(job?.status)}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Results */}
          <div className="mt-6">
            {job?.status !== "done" ? (
              <div className="rounded-xl border border-gray-800 bg-black/20 p-6 text-center text-sm text-gray-500">
                As 4 variações aparecerão aqui quando a geração terminar.
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-200 mb-3">Resultados</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(job.resultUrls || []).map((url, idx) => (
                    <div key={`${url}-${idx}`} className="overflow-hidden rounded-xl border border-gray-800 bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Resultado ${idx + 1}`} className="h-56 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-xs text-gray-400">#{idx + 1}</span>
                        <div className="flex gap-2">
                          <a href={url} target="_blank" rel="noreferrer"
                            className="rounded-md border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-200 hover:border-gray-500">
                            Abrir
                          </a>
                          <a href={url} download
                            className="rounded-md bg-green-600/80 px-2 py-1 text-xs text-white hover:bg-green-500">
                            ↓ Baixar
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={resetAll}
                    className="rounded-xl bg-green-500 px-6 py-2 text-sm font-semibold text-black hover:bg-green-400 transition"
                  >
                    + Gerar novo headshot
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
