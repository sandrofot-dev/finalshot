import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const TRAIN_MODEL = "fal-ai/flux-lora-fast-training";
const GEN_MODEL   = "fal-ai/flux-lora";

// Trigger word embedded in prompts — must match what was used in training
const TRIGGER = "TOK";

const PROMPTS: Record<string, string> = {
  // ── Corporativo ──────────────────────────────────────────────────────────
  corporativo:
    `professional corporate headshot of ${TRIGGER}, elegant office with bookshelves in background, soft natural window light, business attire, sharp face, photorealistic, 4k`,
  executivo:
    `executive business portrait of ${TRIGGER}, dark solid background, dramatic professional studio lighting, formal business attire, confident expression, sharp face, photorealistic, 4k`,
  sala_reuniao:
    `professional headshot of ${TRIGGER}, modern conference room with panoramic city-view windows softly blurred in background, business attire, bright natural lighting, sharp face, photorealistic, 4k`,
  lobby:
    `professional headshot of ${TRIGGER}, luxurious corporate lobby with marble floors and warm pendant lights softly blurred in background, premium business attire, sharp face, photorealistic, 4k`,

  // ── Profissional ─────────────────────────────────────────────────────────
  minimalista:
    `professional LinkedIn headshot of ${TRIGGER}, clean white studio background, soft even lighting, centered composition, business casual, sharp face, photorealistic, 4k`,
  cinza:
    `professional studio portrait of ${TRIGGER}, smooth neutral gray seamless backdrop, soft professional studio lighting with subtle rim highlight, business attire, sharp face, photorealistic, 4k`,
  azul:
    `professional headshot of ${TRIGGER}, deep navy blue gradient background, elegant professional studio lighting, business attire, sharp face, photorealistic, 4k`,
  degradê:
    `professional headshot of ${TRIGGER}, premium dark charcoal to warm gray gradient background, dramatic studio lighting, formal business attire, sharp face, photorealistic, 4k`,

  // ── Tech / Startup ───────────────────────────────────────────────────────
  startup:
    `professional headshot of ${TRIGGER}, modern tech office background with glass walls and soft bokeh, business casual attire, bright cinematic lighting, sharp face, photorealistic, 4k`,
  coworking:
    `professional headshot of ${TRIGGER}, contemporary coworking space with exposed brick walls and lush plants softly blurred in background, smart casual attire, natural light, sharp face, photorealistic, 4k`,
  tecnologia:
    `professional headshot of ${TRIGGER}, dark high-tech server room with glowing blue LED ambient lighting in background, business casual, sharp face, cinematic blue-toned lighting, photorealistic, 4k`,

  // ── Empresarial ──────────────────────────────────────────────────────────
  empresa:
    `professional business portrait of ${TRIGGER}, blurred office environment far in background, colleagues out of focus, business attire, sharp face, photorealistic, 4k`,

  // ── Externo ──────────────────────────────────────────────────────────────
  cidade:
    `professional headshot of ${TRIGGER}, blurred urban city skyline at golden hour with bokeh lights in background, business attire, warm cinematic rim lighting, sharp face, photorealistic, 4k`,
  jardim:
    `professional headshot of ${TRIGGER}, lush green garden with blooming flowers softly blurred in background, light business casual attire, soft natural daylight, sharp face, photorealistic, 4k`,
  arquitetura:
    `professional headshot of ${TRIGGER}, modern glass and steel architectural facade softly blurred in background, business attire, bright even daylight, sharp face, photorealistic, 4k`,

  // ── Criativo ─────────────────────────────────────────────────────────────
  biblioteca:
    `professional headshot of ${TRIGGER}, classic library with tall wooden bookshelves of books softly blurred in background, business casual attire, warm library lighting, sharp face, photorealistic, 4k`,
  cafe:
    `professional headshot of ${TRIGGER}, upscale coffee shop with warm bokeh pendant lights in background, smart casual attire, warm ambient lighting, sharp face, photorealistic, 4k`,
  arte:
    `professional headshot of ${TRIGGER}, contemporary art gallery with white walls and colorful paintings softly blurred in background, chic business attire, gallery lighting, sharp face, photorealistic, 4k`,

  // ── Premium ──────────────────────────────────────────────────────────────
  luxo:
    `premium professional headshot of ${TRIGGER}, luxury hotel suite with soft golden tones and elegant decor in background, premium formal attire, soft cinematic lighting, sharp face, photorealistic, 4k`,
  dourado:
    `premium executive headshot of ${TRIGGER}, warm golden hour sunlight from the side, rich golden bokeh background, luxury formal attire, sharp face, photorealistic, 4k`,
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
