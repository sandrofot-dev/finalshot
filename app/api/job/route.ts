import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireSession } from "@/app/lib/session";
import {
  submitTrainingJob,
  checkTrainingJob,
  submitGenerationJob,
  checkGenerationJob,
} from "@/app/lib/generate";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/job  — create a new job (training or direct generation)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const background: string = body?.background || "executivo";
    const zipUrl:     string | undefined = body?.zipUrl;
    const reuseLoRA:  boolean = body?.reuseLoRA === true;

    // Check if user already has a trained LoRA
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const existingLoraUrl = user?.loraUrl ?? null;

    if (reuseLoRA && existingLoraUrl) {
      // ── Fast path: skip training, generate directly ──────────────────────
      const job = await prisma.job.create({
        data: {
          userId: session.user.id,
          status: "queued",
          progress: 55,
          background,
          uploadId: zipUrl,
          jobPhase: "generating",
          loraUrl: existingLoraUrl,
        },
      });

      const genRequestIds = await submitGenerationJob(existingLoraUrl, background);
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "processing", falRequestId: genRequestIds },
      });

      return NextResponse.json({ success: true, jobId: job.id });
    }

    // ── Training path ────────────────────────────────────────────────────────
    if (!zipUrl) {
      return NextResponse.json({ success: false, error: "Envie um zipUrl com as fotos." }, { status: 400 });
    }

    const job = await prisma.job.create({
      data: {
        userId: session.user.id,
        status: "queued",
        progress: 5,
        background,
        uploadId: zipUrl,
        jobPhase: "training",
      },
    });

    const trainingReqId = await submitTrainingJob(zipUrl);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "processing", progress: 10, trainingReqId },
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar job";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/job?id=  — poll job status
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const jobId = new URL(req.url).searchParams.get("id");
    if (!jobId) return NextResponse.json({ success: false, error: "Informe ?id=" }, { status: 400 });

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ success: false, error: "Job não encontrado" }, { status: 404 });

    // Terminal states
    if (job.status === "done" || job.status === "error") {
      return NextResponse.json({ success: true, job: formatJob(job) });
    }

    // ── TRAINING PHASE ───────────────────────────────────────────────────────
    if (job.jobPhase === "training" && job.trainingReqId) {
      try {
        const result = await checkTrainingJob(job.trainingReqId);

        if (result.done) {
          // Training complete → always save LoRA to user
          await prisma.user.update({
            where: { id: job.userId },
            data: { loraUrl: result.loraUrl, loraAt: new Date() },
          });

          // Training-only mode: don't auto-generate, let the frontend pick style and trigger generation
          if (job.background === "__training_only__") {
            await prisma.job.update({
              where: { id: jobId },
              data: { status: "done", progress: 100, loraUrl: result.loraUrl },
            });
            return NextResponse.json({
              success: true,
              job: { ...formatJob(job), status: "done", progress: 100, loraUrl: result.loraUrl },
            });
          }

          // Normal mode: auto-start generation
          const genRequestIds = await submitGenerationJob(result.loraUrl, job.background);

          await prisma.job.update({
            where: { id: jobId },
            data: {
              jobPhase: "generating",
              loraUrl: result.loraUrl,
              falRequestId: genRequestIds,
              status: "processing",
              progress: 60,
            },
          });

          return NextResponse.json({
            success: true,
            job: { ...formatJob(job), jobPhase: "generating", progress: 60, status: "processing" },
          });
        }

        // Still training
        await prisma.job.update({ where: { id: jobId }, data: { progress: result.progress } });
        return NextResponse.json({
          success: true,
          job: { ...formatJob(job), progress: result.progress },
        });
      } catch {
        return NextResponse.json({ success: true, job: formatJob(job) });
      }
    }

    // ── GENERATION PHASE ─────────────────────────────────────────────────────
    if (job.falRequestId) {
      try {
        const result = await checkGenerationJob(job.falRequestId);

        if (result.status === "done" || result.status === "error") {
          const resultUrls = result.status === "done" ? result.resultUrls : undefined;
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: result.status,
              progress: result.progress,
              resultUrls: resultUrls ? JSON.stringify(resultUrls) : null,
            },
          });
          return NextResponse.json({
            success: true,
            job: { ...formatJob(job), status: result.status, progress: result.progress, resultUrls },
          });
        }

        return NextResponse.json({
          success: true,
          job: { ...formatJob(job), status: result.status, progress: result.progress },
        });
      } catch {
        return NextResponse.json({ success: true, job: formatJob(job) });
      }
    }

    return NextResponse.json({ success: true, job: formatJob(job) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar job";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

function formatJob(job: {
  id: string; status: string; progress: number; background: string;
  jobPhase: string | null; createdAt: Date; uploadId: string | null;
  resultUrls: string | null; loraUrl?: string | null;
}) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    background: job.background,
    jobPhase: job.jobPhase,
    createdAt: job.createdAt.getTime(),
    uploadId: job.uploadId,
    resultUrls: job.resultUrls ? JSON.parse(job.resultUrls) : undefined,
    loraUrl: job.loraUrl ?? undefined,
  };
}
