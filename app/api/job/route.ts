import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireSession } from "@/app/lib/session";
import { submitHeadshotJob, checkHeadshotJob } from "@/app/lib/generate";

type JobStatus = "queued" | "processing" | "done" | "error";

const MOCKS: Record<string, string[]> = {
  corporativo:  ["/mock/corporativo-1.png", "/mock/corporativo-2.jpg", "/mock/corporativo-3.jpg", "/mock/corporativo-4.jpg"],
  startup:      ["/mock/startup-1.jpg",     "/mock/startup-2.jpg",     "/mock/startup-3.jpg",     "/mock/startup-4.jpg"],
  empresa:      ["/mock/empresa-1.jpg",     "/mock/empresa-2.jpg",     "/mock/empresa-3.jpg",     "/mock/empresa-4.jpg"],
  executivo:    ["/mock/executivo-1.jpg",   "/mock/executivo-2.jpg",   "/mock/executivo-3.jpg",   "/mock/executivo-4.jpg"],
  minimalista:  ["/mock/minimalista-1.jpg", "/mock/minimalista-2.jpg", "/mock/minimalista-3.jpg", "/mock/minimalista-4.jpg"],
};

function normalizeBg(bg: string): string {
  const b = (bg || "").toLowerCase().trim();
  return MOCKS[b] ? b : "empresa";
}

function calcMockProgress(createdAt: Date): { status: JobStatus; progress: number } {
  const ageMs = Date.now() - createdAt.getTime();
  if (ageMs < 1000) return { status: "queued",      progress: 5  };
  if (ageMs < 7000) return { status: "processing",  progress: Math.min(10 + Math.floor(((ageMs - 1000) / 6000) * 75), 85) };
  if (ageMs < 10000) return { status: "processing", progress: Math.min(85 + Math.floor(((ageMs - 7000) / 3000) * 14), 99) };
  return { status: "done", progress: 100 };
}

function formatJob(job: {
  id: string; status: string; progress: number; background: string;
  createdAt: Date; uploadId: string | null; resultUrls: string | null;
}, overrideUrls?: string[]) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    background: job.background,
    createdAt: job.createdAt.getTime(),
    uploadId: job.uploadId,
    resultUrls: overrideUrls ?? (job.resultUrls ? JSON.parse(job.resultUrls) : undefined),
  };
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const background = normalizeBg(String(body?.background || "empresa"));
    const uploadId: string | undefined = body?.uploadId ? String(body.uploadId) : undefined;

    const job = await prisma.job.create({
      data: { userId: session.user.id, status: "queued", progress: 5, background, uploadId },
    });

    // Use real AI when upload is a public blob URL and FAL_KEY is configured
    const useAI = uploadId?.startsWith("https://") && !!process.env.FAL_KEY;

    if (useAI) {
      try {
        const falRequestId = await submitHeadshotJob(uploadId!, background);
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "processing", progress: 10, falRequestId },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao iniciar geração";
        await prisma.job.update({ where: { id: job.id }, data: { status: "error" } });
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar job";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json({ success: false, error: "Informe ?id=JOB_ID" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ success: false, error: "Job não encontrado" }, { status: 404 });
    }

    // Terminal state — return what's in the DB
    if (job.status === "done" || job.status === "error") {
      return NextResponse.json({ success: true, job: formatJob(job) });
    }

    // Real AI job — check FAL.ai status
    if (job.falRequestId && process.env.FAL_KEY) {
      try {
        const ai = await checkHeadshotJob(job.falRequestId);

        if (ai.status === "done" || ai.status === "error") {
          const resultUrls = ai.status === "done" ? ai.resultUrls : undefined;
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: ai.status,
              progress: ai.progress,
              resultUrls: resultUrls ? JSON.stringify(resultUrls) : null,
            },
          });
          return NextResponse.json({
            success: true,
            job: { ...formatJob(job), status: ai.status, progress: ai.progress, resultUrls },
          });
        }

        return NextResponse.json({
          success: true,
          job: { ...formatJob(job), status: ai.status, progress: ai.progress },
        });
      } catch {
        // FAL.ai unreachable — return last known state without crashing
        return NextResponse.json({ success: true, job: formatJob(job) });
      }
    }

    // Mock simulation (dev without FAL_KEY or local upload)
    const { status, progress } = calcMockProgress(job.createdAt);
    let resultUrls: string[] | undefined;

    if (status === "done") {
      resultUrls = MOCKS[normalizeBg(job.background)];
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "done", progress: 100, resultUrls: JSON.stringify(resultUrls) },
      });
    }

    return NextResponse.json({
      success: true,
      job: { ...formatJob(job), status, progress, resultUrls },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar job";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
