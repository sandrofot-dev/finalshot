"use client";

import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import Link from "next/link";
import JSZip from "jszip";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "photos" | "styles" | "generating" | "done";
type JobStatus  = "queued" | "processing" | "done" | "error";

type Job = {
  id: string;
  status: JobStatus;
  progress: number;
  background: string;
  jobPhase?: string;
  resultUrls?: string[];
  loraUrl?: string;
};

// ─── Background catalogue (20 styles) ────────────────────────────────────────

const BACKGROUNDS = [
  // Corporativo
  { key: "executivo",    title: "Executivo",        subtitle: "Fundo escuro premium",       gradient: "from-gray-900 to-gray-700",        category: "Corporativo", popular: true  },
  { key: "corporativo",  title: "Corporativo",      subtitle: "Escritório elegante",        gradient: "from-blue-950 to-blue-800",        category: "Corporativo"                },
  { key: "sala_reuniao", title: "Sala de Reunião",  subtitle: "Vista panorâmica da cidade", gradient: "from-slate-800 to-slate-600",      category: "Corporativo"                },
  { key: "lobby",        title: "Lobby Luxo",       subtitle: "Hotel ou sede corporativa",  gradient: "from-stone-800 to-amber-950",      category: "Corporativo"                },

  // Profissional
  { key: "minimalista",  title: "Minimalista",      subtitle: "Fundo branco clean",         gradient: "from-gray-200 to-white",           category: "Profissional", popular: true, light: true },
  { key: "cinza",        title: "Studio Cinza",     subtitle: "Fundo neutro profissional",  gradient: "from-gray-600 to-gray-400",        category: "Profissional"               },
  { key: "azul",         title: "Azul Profissional",subtitle: "Fundo azul escuro",          gradient: "from-blue-900 to-blue-600",        category: "Profissional"               },
  { key: "degradê",      title: "Gradiente Chumbo", subtitle: "Fundo elegante neutro",      gradient: "from-gray-800 to-gray-500",        category: "Profissional"               },

  // Tech
  { key: "startup",      title: "Startup",          subtitle: "Escritório tech moderno",    gradient: "from-cyan-950 to-cyan-800",        category: "Tech"                       },
  { key: "coworking",    title: "Coworking",        subtitle: "Espaço colaborativo",        gradient: "from-orange-950 to-orange-800",    category: "Tech"                       },
  { key: "tecnologia",   title: "Tecnologia",       subtitle: "Ambiente high-tech",         gradient: "from-indigo-950 to-blue-900",      category: "Tech"                       },

  // Business
  { key: "empresa",      title: "Empresa",          subtitle: "Colegas ao fundo",           gradient: "from-teal-950 to-teal-700",        category: "Business"                   },

  // Externo
  { key: "cidade",       title: "Cidade",           subtitle: "Skyline ao entardecer",      gradient: "from-orange-900 to-amber-700",     category: "Externo"                    },
  { key: "jardim",       title: "Jardim",           subtitle: "Natureza ao fundo",          gradient: "from-green-900 to-emerald-700",    category: "Externo"                    },
  { key: "arquitetura",  title: "Arquitetura",      subtitle: "Prédio moderno",             gradient: "from-sky-900 to-sky-700",          category: "Externo"                    },

  // Criativo
  { key: "biblioteca",   title: "Biblioteca",       subtitle: "Ambiente intelectual",       gradient: "from-yellow-950 to-amber-900",     category: "Criativo"                   },
  { key: "cafe",         title: "Café",             subtitle: "Ambiente acolhedor",         gradient: "from-amber-900 to-amber-700",      category: "Criativo"                   },
  { key: "arte",         title: "Galeria de Arte",  subtitle: "Ambiente criativo",          gradient: "from-purple-950 to-purple-800",    category: "Criativo"                   },

  // Premium
  { key: "luxo",         title: "Luxo",             subtitle: "Hotel de alto padrão",       gradient: "from-yellow-900 to-amber-800",     category: "Premium"                    },
  { key: "dourado",      title: "Dourado Premium",  subtitle: "Tom dourado exclusivo",      gradient: "from-yellow-600 to-amber-500",     category: "Premium"                    },
] as const;

type BgKey = typeof BACKGROUNDS[number]["key"];

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...c: Array<string | false | undefined | null>) {
  return c.filter(Boolean).join(" ");
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
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("Falha ao comprimir")), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function buildAndUploadZip(files: File[]): Promise<string> {
  const zip = new JSZip();
  for (let i = 0; i < files.length; i++) {
    const compressed = await compressImage(files[i]);
    zip.file(`photo_${String(i + 1).padStart(2, "0")}.jpg`, compressed);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const form = new FormData();
  form.append("file", zipBlob, "training.zip");
  const res  = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error(data?.error || "Falha no upload.");
  return String(data.uploadId);
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  photos:     "Fotos",
  styles:     "Estilo",
  generating: "Processando",
  done:       "Pronto!",
};

function StepDots({ current }: { current: WizardStep }) {
  const steps: WizardStep[] = ["photos", "styles", "generating", "done"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const idx     = steps.indexOf(current);
        const past    = i < idx;
        const active  = s === current;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div className={cn("h-px w-8 transition-colors", past ? "bg-green-500" : "bg-gray-700")} />}
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition",
                active ? "border-green-500 bg-green-500 text-black"
                  : past ? "border-green-700 bg-green-900/40 text-green-400"
                  : "border-gray-700 bg-black/30 text-gray-500",
              )}>
                {past ? "✓" : i + 1}
              </div>
              <span className={cn("text-[10px] hidden sm:block", active ? "text-green-400" : "text-gray-600")}>
                {STEP_LABELS[s]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UploadPage() {
  const { data: session } = useSession();

  // Wizard
  const [step, setStep] = useState<WizardStep>("photos");

  // Photos
  const [files, setFiles]       = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Training
  const [trainingJobId, setTrainingJobId]   = useState<string | null>(null);
  const [trainingProgress, setTrainingProgress] = useState(5);
  const [trainingDone, setTrainingDone]     = useState(false);
  const [trainingError, setTrainingError]   = useState<string | null>(null);
  const trainingPollRef = useRef<number | null>(null);

  // Style
  const [selectedBg, setSelectedBg] = useState<BgKey>("executivo");

  // Generation
  const [generationJob, setGenerationJob] = useState<Job | null>(null);
  const generationPollRef = useRef<number | null>(null);

  // User / LoRA reuse
  const [userHasLoRA, setUserHasLoRA]     = useState(false);
  const [isReusingLoRA, setIsReusingLoRA] = useState(false);

  // UI
  const [error, setError]       = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // Refs to avoid stale closures in polling callbacks
  const pendingGenerateRef = useRef(false);
  const selectedBgRef      = useRef<BgKey>(selectedBg);
  useEffect(() => { selectedBgRef.current = selectedBg; }, [selectedBg]);

  // ── Load user LoRA status ──────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    fetch("/api/me").then(r => r.json()).then(d => {
      if (d?.loraUrl) setUserHasLoRA(true);
    }).catch(() => {});
  }, [session]);

  // ── Preview URLs ──────────────────────────────────────────────────────────
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => {
    if (trainingPollRef.current)    clearInterval(trainingPollRef.current);
    if (generationPollRef.current)  clearInterval(generationPollRef.current);
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────
  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming)
      .filter(f => ["image/jpeg", "image/png"].includes(f.type))
      .slice(0, 20);
    if (!valid.length) { setError("Selecione apenas arquivos JPG ou PNG."); return; }
    setFiles(prev => [...prev, ...valid].slice(0, 20));
    setError(null);
  }, []);

  // ── Training polling ──────────────────────────────────────────────────────
  function startTrainingPoll(jobId: string) {
    if (trainingPollRef.current) clearInterval(trainingPollRef.current);
    trainingPollRef.current = window.setInterval(() => pollTraining(jobId), 2000);
  }

  async function pollTraining(jobId: string) {
    try {
      const res  = await fetch(`/api/job?id=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!data?.success) return;
      const j: Job = data.job;
      setTrainingProgress(j.progress);

      if (j.status === "done") {
        clearInterval(trainingPollRef.current!);
        trainingPollRef.current = null;
        setTrainingDone(true);
        setUserHasLoRA(true);
        // If user already clicked "Gerar", start generation now
        if (pendingGenerateRef.current) {
          await startGeneration(selectedBgRef.current);
        }
      } else if (j.status === "error") {
        clearInterval(trainingPollRef.current!);
        trainingPollRef.current = null;
        setTrainingError("Erro no treinamento. Por favor, tente novamente.");
        setStep("photos");
      }
    } catch { /* silently retry */ }
  }

  // ── Generation ────────────────────────────────────────────────────────────
  async function startGeneration(background: BgKey) {
    pendingGenerateRef.current = false;
    try {
      const res  = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuseLoRA: true, background }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Falha ao iniciar geração.");

      const jobId = String(data.jobId);
      if (generationPollRef.current) clearInterval(generationPollRef.current);
      generationPollRef.current = window.setInterval(() => pollGeneration(jobId), 1500);
      await pollGeneration(jobId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar geração.");
    }
  }

  async function pollGeneration(jobId: string) {
    try {
      const res  = await fetch(`/api/job?id=${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!data?.success) return;
      const j: Job = data.job;
      setGenerationJob(j);

      if (j.status === "done") {
        clearInterval(generationPollRef.current!);
        generationPollRef.current = null;
        setStep("done");
      } else if (j.status === "error") {
        clearInterval(generationPollRef.current!);
        generationPollRef.current = null;
        setError("Erro na geração de imagens. Tente outro estilo.");
      }
    } catch { /* silently retry */ }
  }

  // ── Step: Photos → Styles ─────────────────────────────────────────────────
  async function handlePhotosConfirm() {
    if (files.length < 3) {
      setError("Envie pelo menos 3 fotos para a IA aprender seu rosto.");
      return;
    }
    setError(null);
    setIsWorking(true);

    try {
      const zipUrl = await buildAndUploadZip(files);

      const res  = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: "__training_only__", zipUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Falha ao iniciar treinamento.");

      const jobId = String(data.jobId);
      setTrainingJobId(jobId);
      setTrainingProgress(10);
      startTrainingPoll(jobId);
      setStep("styles");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar treinamento.");
    } finally {
      setIsWorking(false);
    }
  }

  // ── Step: Styles → Generating ─────────────────────────────────────────────
  async function handleGenerate() {
    setError(null);
    setStep("generating");

    if (trainingDone || isReusingLoRA) {
      await startGeneration(selectedBg);
    } else {
      // Training still running — flag so pollTraining auto-generates when done
      pendingGenerateRef.current = true;
    }
  }

  // ── LoRA reuse ────────────────────────────────────────────────────────────
  function handleReuseLoRA() {
    setIsReusingLoRA(true);
    setTrainingDone(true);
    setStep("styles");
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetWizard() {
    if (trainingPollRef.current)   clearInterval(trainingPollRef.current);
    if (generationPollRef.current) clearInterval(generationPollRef.current);
    trainingPollRef.current = generationPollRef.current = null;

    setStep("photos");
    setFiles([]); setPreviews([]);
    setTrainingJobId(null); setTrainingProgress(5);
    setTrainingDone(false); setTrainingError(null);
    setGenerationJob(null); setIsReusingLoRA(false);
    setError(null); setIsWorking(false);
    pendingGenerateRef.current = false;
  }

  // ── "Gerar outro estilo" (from done step) ─────────────────────────────────
  function handleNewStyle() {
    if (generationPollRef.current) clearInterval(generationPollRef.current);
    generationPollRef.current = null;
    setGenerationJob(null);
    setError(null);
    // Keep training job / LoRA state, go back to styles
    setStep("styles");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const selectedBgObj = BACKGROUNDS.find(b => b.key === selectedBg)!;
  const genProgress   = generationJob?.progress ?? 0;
  const genPhase      = generationJob?.jobPhase;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Criar headshot profissional</h1>
            <p className="mt-1 text-sm text-gray-400">
              IA aprende o seu rosto e gera fotos profissionais em minutos.
            </p>
          </div>
          <Link href="/" className="shrink-0 rounded-xl border border-gray-700 bg-black/30 px-4 py-2 text-sm hover:border-gray-500 transition">
            ← Início
          </Link>
        </div>

        {/* Step dots */}
        <div className="flex justify-center mb-8">
          <StepDots current={step} />
        </div>

        {/* ── STEP: PHOTOS ─────────────────────────────────────────────────── */}
        {step === "photos" && (
          <div className="space-y-5">

            {/* LoRA reuse banner */}
            {userHasLoRA && (
              <div className="rounded-2xl border border-green-800 bg-green-900/15 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-green-400">✓ Seu modelo pessoal já está treinado</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Pule direto para a seleção de estilo — sem precisar enviar fotos novamente.
                  </p>
                </div>
                <button
                  onClick={handleReuseLoRA}
                  className="shrink-0 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition"
                >
                  Usar modelo salvo →
                </button>
              </div>
            )}

            {/* Upload zone */}
            <div className="rounded-2xl border border-gray-800 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Suas fotos</h2>
                  <p className="text-xs text-gray-500 mt-0.5">3 a 20 fotos · JPG ou PNG</p>
                </div>
                {files.length > 0 && (
                  <span className={cn(
                    "text-sm font-medium px-3 py-1 rounded-full border",
                    files.length >= 3
                      ? "text-green-400 border-green-800 bg-green-900/20"
                      : "text-yellow-400 border-yellow-800 bg-yellow-900/20"
                  )}>
                    {files.length} / 20
                  </span>
                )}
              </div>

              {/* Drop zone */}
              <label
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 transition",
                  isDragging ? "border-green-500 bg-green-500/10" : "border-gray-700 bg-black/20 hover:border-gray-500"
                )}
              >
                <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div className="text-center">
                  <p className="font-medium text-gray-300">Arraste ou clique para selecionar</p>
                  <p className="mt-1 text-xs text-gray-500">Fotos com rosto bem iluminado e centralizado</p>
                </div>
                <input className="hidden" type="file" accept="image/png,image/jpeg" multiple
                  onChange={e => addFiles(e.target.files)} />
              </label>

              {/* Thumbnails grid */}
              {previews.length > 0 && (
                <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-gray-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white text-[10px] hover:bg-red-600"
                      >×</button>
                    </div>
                  ))}
                  {files.length < 20 && (
                    <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-700 hover:border-gray-500 transition">
                      <span className="text-lg text-gray-600">+</span>
                      <input className="hidden" type="file" accept="image/png,image/jpeg" multiple
                        onChange={e => addFiles(e.target.files)} />
                    </label>
                  )}
                </div>
              )}

              {/* Tips */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
                <div className="rounded-lg bg-white/5 px-3 py-2.5">
                  <p className="font-medium text-gray-300 mb-1">✓ Boas fotos</p>
                  <p>Rosto centralizado · Boa iluminação natural · Ângulos variados · Expressões diferentes</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2.5">
                  <p className="font-medium text-gray-300 mb-1">✗ Evite</p>
                  <p>Óculos escuros · Chapéu · Filtros pesados · Fotos desfocadas · Grupo de pessoas</p>
                </div>
              </div>

              {files.length >= 3 && (
                <p className="mt-3 text-xs text-gray-500 text-center">
                  💡 Mais fotos = resultado mais fiel. Ideal: 10 fotos de ângulos variados.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {trainingError && (
              <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {trainingError}
              </div>
            )}

            <button
              type="button"
              onClick={handlePhotosConfirm}
              disabled={files.length < 3 || isWorking}
              className={cn(
                "w-full rounded-2xl py-4 font-semibold text-sm transition",
                files.length >= 3 && !isWorking
                  ? "bg-green-500 text-black hover:bg-green-400"
                  : "bg-gray-800 text-gray-500 cursor-not-allowed"
              )}
            >
              {isWorking
                ? "Preparando fotos…"
                : files.length < 3
                  ? `Selecione pelo menos 3 fotos (${files.length}/3)`
                  : `Continuar com ${files.length} foto${files.length > 1 ? "s" : ""} →`
              }
            </button>
          </div>
        )}

        {/* ── STEP: STYLES ─────────────────────────────────────────────────── */}
        {step === "styles" && (
          <div className="space-y-5">

            {/* Training progress banner */}
            {!trainingDone && trainingJobId && (
              <div className="rounded-2xl border border-blue-900 bg-blue-900/15 px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <span className="text-sm font-medium text-blue-300">
                      IA aprendendo seu rosto…
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{trainingProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-700"
                    style={{ width: `${trainingProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Aproveite para escolher o estilo — a IA trabalha em segundo plano (~15 min).
                </p>
              </div>
            )}

            {trainingDone && !isReusingLoRA && (
              <div className="rounded-2xl border border-green-800 bg-green-900/15 px-5 py-3 flex items-center gap-3">
                <span className="text-green-400 text-lg">✓</span>
                <div>
                  <p className="text-sm font-semibold text-green-400">IA treinada com sucesso!</p>
                  <p className="text-xs text-gray-400">Clique em &ldquo;Gerar headshots&rdquo; para criar suas fotos.</p>
                </div>
              </div>
            )}

            {isReusingLoRA && (
              <div className="rounded-2xl border border-green-800 bg-green-900/15 px-5 py-3 flex items-center gap-3">
                <span className="text-green-400 text-lg">✓</span>
                <div>
                  <p className="text-sm font-semibold text-green-400">Usando modelo salvo</p>
                  <p className="text-xs text-gray-400">Geração imediata com seu modelo existente.</p>
                </div>
              </div>
            )}

            {/* Style grid */}
            <div className="rounded-2xl border border-gray-800 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold mb-1">Escolha o estilo</h2>
              <p className="text-xs text-gray-500 mb-5">Selecione o ambiente ideal para o seu headshot</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {BACKGROUNDS.map(bg => {
                  const active = bg.key === selectedBg;
                  return (
                    <button
                      key={bg.key}
                      type="button"
                      onClick={() => setSelectedBg(bg.key as BgKey)}
                      className={cn(
                        "group relative rounded-xl border overflow-hidden text-left transition-all",
                        active
                          ? "border-green-500 ring-1 ring-green-500/40"
                          : "border-gray-800 hover:border-gray-600"
                      )}
                    >
                      {/* Gradient thumbnail */}
                      <div className={cn(
                        "h-16 w-full bg-gradient-to-br",
                        bg.gradient,
                        "flex items-center justify-center"
                      )}>
                        <span className={cn("text-2xl opacity-70", "light" in bg && bg.light ? "" : "filter drop-shadow-lg")}>
                          {getCategoryEmoji(bg.category)}
                        </span>
                      </div>

                      {/* Info */}
                      <div className={cn(
                        "px-2.5 py-2",
                        active ? "bg-green-900/20" : "bg-black/40"
                      )}>
                        <div className="flex items-center justify-between gap-1">
                          <p className={cn("text-xs font-semibold truncate", active ? "text-green-300" : "text-gray-200")}>
                            {bg.title}
                          </p>
                          {active && <span className="text-green-400 text-xs shrink-0">✓</span>}
                        </div>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{bg.subtitle}</p>
                        {"popular" in bg && bg.popular && (
                          <span className="mt-1 inline-block text-[9px] font-semibold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                            Popular
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("photos")}
                className="rounded-2xl border border-gray-700 bg-black/30 px-5 py-3.5 text-sm text-gray-300 hover:border-gray-500 transition"
              >
                ← Fotos
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex-1 rounded-2xl bg-green-500 py-3.5 font-semibold text-sm text-black hover:bg-green-400 transition"
              >
                ✨ Gerar headshots com &ldquo;{selectedBgObj.title}&rdquo;
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: GENERATING ─────────────────────────────────────────────── */}
        {step === "generating" && (
          <div className="rounded-2xl border border-gray-800 bg-white/[0.03] p-8 text-center space-y-6">

            {/* Animated orb */}
            <div className="flex justify-center">
              <div className="relative h-20 w-20">
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-green-500/30 animate-pulse" />
                <div className="absolute inset-4 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-black font-bold text-lg">✦</span>
                </div>
              </div>
            </div>

            {/* Phase label */}
            {pendingGenerateRef.current || (!generationJob && !trainingDone) ? (
              /* Still waiting for training */
              <div>
                <h2 className="text-xl font-semibold">IA aprendendo seu rosto…</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Aguardando o treinamento concluir para iniciar a geração.
                </p>
                <div className="mt-5 mx-auto max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                    <span>Treinamento</span>
                    <span>{trainingProgress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-700"
                      style={{ width: `${trainingProgress}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Isso pode levar ~15 minutos. Não feche esta aba.
                  </p>
                </div>
              </div>
            ) : (
              /* Generation in progress */
              <div>
                <h2 className="text-xl font-semibold">
                  {genPhase === "training" ? "Treinando IA no seu rosto…" : "Gerando seus headshots…"}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {genPhase === "training"
                    ? "A IA está personalizando o modelo com o seu rosto."
                    : <>Criando 4 versões com o estilo &ldquo;{selectedBgObj.title}&rdquo;.</>}
                </p>
                <div className="mt-5 mx-auto max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                    <span>{genPhase === "generating" ? "Geração" : "Progresso"}</span>
                    <span>{genProgress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-700"
                      style={{ width: `${genProgress}%` }}
                    />
                  </div>
                  {genPhase === "training" && (
                    <p className="mt-3 text-xs text-gray-500">
                      Isso pode levar ~15 minutos. Deixe esta aba aberta.
                    </p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {error}
                <br />
                <button onClick={resetWizard} className="mt-2 underline text-xs text-red-400">
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP: DONE ───────────────────────────────────────────────────── */}
        {step === "done" && generationJob && (
          <div className="space-y-5">
            <div className="text-center py-4">
              <div className="text-4xl mb-2">🎉</div>
              <h2 className="text-2xl font-bold">Seus headshots estão prontos!</h2>
              <p className="text-gray-400 text-sm mt-1">
                {generationJob.resultUrls?.length ?? 4} fotos geradas · estilo &ldquo;{selectedBgObj.title}&rdquo;
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(generationJob.resultUrls || []).map((url, idx) => (
                <div key={`${url}-${idx}`} className="overflow-hidden rounded-2xl border border-gray-800 bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Resultado ${idx + 1}`} className="w-full aspect-[3/4] object-cover" />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                    <span className="text-xs text-gray-500">#{idx + 1}</span>
                    <div className="flex gap-1.5">
                      <a href={url} target="_blank" rel="noreferrer"
                        className="rounded-lg border border-gray-700 bg-black/30 px-2 py-1 text-[10px] text-gray-300 hover:border-gray-500">
                        Abrir
                      </a>
                      <a href={url} download
                        className="rounded-lg bg-green-600/80 px-2 py-1 text-[10px] text-white hover:bg-green-500">
                        ↓
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleNewStyle}
                className="flex-1 rounded-2xl bg-green-500 py-3.5 font-semibold text-sm text-black hover:bg-green-400 transition"
              >
                ✨ Gerar outro estilo
              </button>
              <button
                onClick={resetWizard}
                className="flex-1 rounded-2xl border border-gray-700 py-3.5 text-sm text-gray-300 hover:border-gray-500 transition"
              >
                Começar do zero
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

// ── Emoji per category ─────────────────────────────────────────────────────────
function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    Corporativo: "🏢",
    Profissional: "👔",
    Tech: "💻",
    Business: "👥",
    Externo: "🌆",
    Criativo: "🎨",
    Premium: "⭐",
  };
  return map[category] ?? "✦";
}
