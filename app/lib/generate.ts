import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const TRAIN_MODEL = "fal-ai/flux-lora-fast-training";
const GEN_MODEL   = "fal-ai/flux-lora";

// Trigger word embedded in prompts — must match what was used in training
const TRIGGER = "TOK";

const PROMPTS: Record<string, string> = {
  corporativo:
    `professional corporate headshot of ${TRIGGER}, elegant office with bookshelves in background, soft natural window light, business attire, sharp face, photorealistic, 4k`,
  startup:
    `professional headshot of ${TRIGGER}, modern tech office background with glass walls and soft bokeh, business casual attire, bright cinematic lighting, sharp face, photorealistic, 4k`,
  empresa:
    `professional business portrait of ${TRIGGER}, blurred office environment far in background, colleagues out of focus, business attire, sharp face, photorealistic, 4k`,
  executivo:
    `executive business portrait of ${TRIGGER}, dark solid background, dramatic professional studio lighting, formal business attire, confident expression, sharp face, photorealistic, 4k`,
  minimalista:
    `professional LinkedIn headshot of ${TRIGGER}, clean white studio background, soft even lighting, centered composition, business casual, sharp face, photorealistic, 4k`,
};

const NEGATIVE =
  "ugly, deformed, distorted face, blurry face, bad anatomy, extra limbs, cartoon, anime, painting, watermark, text, artifacts, overexposed, underexposed, low quality, worst quality, nsfw";

// ─────────────────────────────────────────────────────────────────────────────
// TRAINING
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTrainingJob(zipUrl: string): Promise<string> {
  const { request_id } = await fal.queue.submit(TRAIN_MODEL, {
    input: {
      images_data_url: zipUrl,
      trigger_word: TRIGGER,
      create_masks: true,   // face segmentation masks for better identity learning
      steps: 1000,
    },
  });
  return request_id;
}

export type TrainingStatus =
  | { done: false;  progress: number }
  | { done: true;   loraUrl: string  };

export async function checkTrainingJob(requestId: string): Promise<TrainingStatus> {
  const status = await fal.queue.status(TRAIN_MODEL, { requestId, logs: false });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(TRAIN_MODEL, { requestId });
    const data = result.data as { diffusers_lora_file: { url: string } };
    return { done: true, loraUrl: data.diffusers_lora_file.url };
  }

  const queuePos = status.status === "IN_QUEUE" ? (status.queue_position ?? 0) : 0;
  const progress = status.status === "IN_PROGRESS" ? 55 : Math.max(5, 30 - queuePos * 5);
  return { done: false, progress };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION (with trained LoRA)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitGenerationJob(
  loraUrl: string,
  background: string
): Promise<string> {
  const prompt = PROMPTS[background] ?? PROMPTS.executivo;
  const seeds  = [42, 137, 2024, 8888];

  const results = await Promise.all(
    seeds.map((seed) =>
      fal.queue.submit(GEN_MODEL, {
        input: {
          prompt,
          loras: [{ path: loraUrl, scale: 0.85 }],
          num_images: 1,
          image_size: "portrait_4_3",
          num_inference_steps: 28,
          guidance_scale: 3.5,
          seed,
          enable_safety_checker: false,
        },
      })
    )
  );

  return JSON.stringify(results.map((r) => r.request_id));
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION STATUS CHECK
// ─────────────────────────────────────────────────────────────────────────────

type SingleResult =
  | { done: true;  url: string }
  | { done: false; progress: number };

async function checkSingle(requestId: string): Promise<SingleResult> {
  const status = await fal.queue.status(GEN_MODEL, { requestId, logs: false });
  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(GEN_MODEL, { requestId });
    const data = result.data as { images?: Array<{ url: string }> };
    return { done: true, url: data.images?.[0]?.url ?? "" };
  }
  const queuePos = status.status === "IN_QUEUE" ? (status.queue_position ?? 0) : 0;
  const progress = status.status === "IN_PROGRESS" ? 75 : Math.max(55, 70 - queuePos * 5);
  return { done: false, progress };
}

export type GenerationStatus =
  | { status: "queued" | "processing"; progress: number }
  | { status: "done";  progress: 100;  resultUrls: string[] }
  | { status: "error"; progress: 0 };

export async function checkGenerationJob(falRequestId: string): Promise<GenerationStatus> {
  try {
    let ids: string[];
    try { ids = JSON.parse(falRequestId); if (!Array.isArray(ids)) ids = [falRequestId]; }
    catch { ids = [falRequestId]; }

    const checks = await Promise.all(ids.map(checkSingle));
    const doneCount = checks.filter((c) => c.done).length;

    if (doneCount === ids.length) {
      const resultUrls = checks
        .filter((c): c is { done: true; url: string } => c.done)
        .map((c) => c.url)
        .filter(Boolean);
      return { status: "done", progress: 100, resultUrls };
    }

    const avgProgress = Math.round(
      checks.reduce((sum, c) => sum + (c.done ? 100 : c.progress), 0) / ids.length
    );
    return { status: doneCount > 0 ? "processing" : "queued", progress: Math.min(avgProgress, 99) };
  } catch {
    return { status: "error", progress: 0 };
  }
}
