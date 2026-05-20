"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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
  error?: string;
};

const BACKGROUNDS: Array<{
  key: BgKey;
  title: string;
  desc: string;
  thumb: string;
}> = [
  { key: "corporativo", title: "Escritório Corporativo", desc: "Ambiente profissional com escritório elegante ao fundo", thumb: "/mock/corporativo-1.png" },
  { key: "startup", title: "Startup Moderna", desc: "Ambiente moderno com design clean", thumb: "/mock/startup-1.jpg" },
  { key: "empresa", title: "Empresa com Pessoas Desfocadas", desc: "Clima empresarial com pessoas ao fundo desfocadas", thumb: "/mock/empresa-1.jpg" },
  { key: "executivo", title: "Executivo Fundo Escuro", desc: "Fundo escuro premium estilo CEO", thumb: "/mock/executivo-1.jpg" },
  { key: "minimalista", title: "Minimalista Branco", desc: "Fundo branco clean estilo LinkedIn", thumb: "/mock/minimalista-1.jpg" },
];

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function statusLabel(s?: JobStatus) {
  if (!s) return "—";
  if (s === "queued") return "Na fila";
  if (s === "processing") return "Processando";
  if (s === "done") return "Concluído";
  if (s === "error") return "Erro";
  return s;
}

export default function UploadPage() {
  const [selectedBg, setSelectedBg] = useState<BgKey>("empresa");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uploadId, setUploadId] = useState<string | null>(null);

  const [isWorking, setIsWorking] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const selectedBgObj = useMemo(
    () => BACKGROUNDS.find((b) => b.key === selectedBg)!,
    [selectedBg]
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setUploadId(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function doUploadIfNeeded(): Promise<string> {
    if (!file) throw new Error("Selecione uma foto antes.");
    if (uploadId) return uploadId;

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "Falha no upload.");
    }

    const id = String(data.uploadId);
    setUploadId(id);
    return id;
  }

  async function createJob() {
    setError(null);

    if (!file) {
      setError("Selecione uma foto (JPG/PNG) antes de gerar.");
      return;
    }

    setIsWorking(true);

    try {
      // 1) upload real
      const upId = await doUploadIfNeeded();

      // 2) criar job
      const res = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: selectedBg, uploadId: upId }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Falha ao criar job.");
      }

      const id = String(data.jobId);
      setJobId(id);

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => fetchJob(id), 700);

      await fetchJob(id);
    } catch (e: any) {
      setError(e?.message || "Erro inesperado.");
    } finally {
      setIsWorking(false);
    }
  }

  async function fetchJob(id: string) {
    try {
      const res = await fetch(`/api/job?id=${encodeURIComponent(id)}`);
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível buscar status do job.");
      }

      const j: Job = data.job;
      setJob(j);

      if (j.status === "done" || j.status === "error") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (e: any) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      setError(e?.message || "Erro ao atualizar status.");
    }
  }

  function resetAll() {
    setFile(null);
    setPreviewUrl(null);
    setUploadId(null);
    setJobId(null);
    setJob(null);
    setError(null);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  const progress = job?.progress ?? 0;
  const isBusy = isWorking || job?.status === "processing" || job?.status === "queued";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Envie suas selfies</h1>
            <p className="mt-2 text-gray-300 text-sm">
              Faça upload de uma foto, escolha o estilo e gere 4 variações profissionais.
            </p>
          </div>
          <a
            href="/"
            className="rounded-xl border border-gray-700 bg-black/30 px-5 py-2 text-sm hover:border-gray-500 transition"
          >
            Voltar
          </a>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Upload */}
          <section className="rounded-2xl border border-gray-800 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">1) Upload</h2>

            <label className="mt-4 block cursor-pointer rounded-xl border border-gray-700 bg-black/40 px-4 py-4 hover:border-gray-500">
              <div className="text-sm text-gray-200">
                Clique para escolher uma foto (JPG/PNG)
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Boa luz + rosto centralizado
              </div>
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setError(null);
                }}
              />
            </label>

            <div className="mt-6">
              <div className="text-sm text-gray-300">Preview</div>
              <div className="mt-2 aspect-video w-full overflow-hidden rounded-xl border border-gray-800 bg-black/40">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    Nenhuma foto selecionada
                  </div>
                )}
              </div>
            </div>

            {file && (
              <div className="mt-3 text-xs text-gray-400">
                Arquivo: <span className="text-gray-200">{file.name}</span>
              </div>
            )}

            {uploadId && (
              <div className="mt-2 text-xs text-gray-500">
                UploadId: <span className="text-gray-200">{uploadId}</span>
              </div>
            )}
          </section>

          {/* Fundos */}
          <section className="rounded-2xl border border-gray-800 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">2) Escolha o fundo</h2>

            <div className="mt-4 space-y-3">
              {BACKGROUNDS.map((bg) => {
                const active = bg.key === selectedBg;
                return (
                  <button
                    key={bg.key}
                    type="button"
                    onClick={() => setSelectedBg(bg.key)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition",
                      active
                        ? "border-green-600 bg-green-600/20"
                        : "border-gray-800 bg-black/30 hover:border-gray-600"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">{bg.title}</div>
                        <div className="text-sm text-gray-300">{bg.desc}</div>
                        </div>

                      <div className="h-16 w-24 overflow-hidden rounded-lg border border-gray-800 bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={bg.thumb}
                          alt={bg.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Gerar */}
        <section className="mt-6 rounded-2xl border border-gray-800 bg-white/5 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">3) Gerar</h2>
            <p className="text-sm text-gray-300">
              Clique para iniciar a geração das suas fotos profissionais.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-600/40 bg-red-600/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={createJob}
              disabled={isBusy}
              className={cn(
                "rounded-xl px-6 py-3 font-semibold transition",
                isBusy
                  ? "cursor-not-allowed bg-gray-700 text-gray-300"
                  : "bg-green-500 text-black hover:bg-green-400"
              )}
            >
              {isWorking
                ? "Trabalhando..."
                : job?.status === "queued"
                ? "Na fila..."
                : job?.status === "processing"
                ? "Processando..."
                : "Gerar 4 variações"}
            </button>

            <button
              type="button"
              onClick={resetAll}
              className="rounded-xl border border-gray-700 bg-black/30 px-6 py-3 text-sm text-gray-200 hover:border-gray-500"
            >
              Resetar
            </button>

            {jobId && (
              <span className="text-xs text-gray-400">
                Job: <span className="text-gray-200">{jobId}</span>
              </span>
            )}
          </div>

          {/* Progresso */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Status: {statusLabel(job?.status)}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full border border-gray-800 bg-black/40">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Resultados */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-200">Resultados</h3>

            {job?.status !== "done" ? (
              <div className="mt-2 rounded-xl border border-gray-800 bg-black/30 p-4 text-sm text-gray-400">
                Quando finalizar, você verá 4 imagens aqui.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(job.resultUrls || []).map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className="overflow-hidden rounded-xl border border-gray-800 bg-black/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Resultado ${idx + 1}`}
                      className="h-48 w-full object-cover"
                    />

                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="text-xs text-gray-400">
                        Resultado {idx + 1}
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-200 hover:border-gray-500"
                        >
                          Abrir
                        </a>
                        <a
                          href={url}
                          download
                          className="rounded-md border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-200 hover:border-gray-500"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Fundo selecionado: <span className="text-gray-200">{selectedBgObj.title}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
