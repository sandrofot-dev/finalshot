import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const TRAIN_MODEL = "fal-ai/flux-lora-fast-training";
const GEN_MODEL   = "fal-ai/flux-lora";

// Trigger word embedded in prompts — must match what was used in training
const TRIGGER = "TOK";

// Quality suffix appended to every prompt — controls sharpness and realism
const Q = "highly detailed face, sharp focus, crisp skin texture, detailed eyes, professional photography, 8k uhd, photorealistic";

const PROMPTS: Record<string, string> = {
  // ── Corporativo ──────────────────────────────────────────────────────────
  corporativo:
    `professional corporate headshot of ${TRIGGER}, elegant office with bookshelves softly blurred in background, natural window light, navy blue business suit, white dress shirt, ${Q}`,
  executivo:
    `executive business portrait of ${TRIGGER}, pure dark charcoal seamless background, dramatic professional studio lighting with subtle rim light, navy blue suit, white dress shirt, ${Q}`,
  sala_reuniao:
    `professional headshot of ${TRIGGER}, modern conference room with panoramic city windows softly blurred in background, bright natural lighting, business suit, ${Q}`,
  lobby:
    `professional headshot of ${TRIGGER}, luxurious corporate lobby marble floors warm lighting softly blurred in background, premium business suit, ${Q}`,

  // ── Profissional ─────────────────────────────────────────────────────────
  minimalista:
    `professional LinkedIn headshot of ${TRIGGER}, clean bright white studio seamless background, soft even frontal lighting, business casual attire, ${Q}`,
  cinza:
    `professional studio portrait of ${TRIGGER}, smooth neutral mid-gray seamless backdrop, three-point professional studio lighting subtle rim highlight, business suit, ${Q}`,
  azul:
    `professional headshot of ${TRIGGER}, deep navy blue gradient seamless background, elegant professional studio lighting, business suit, ${Q}`,
  degradê:
    `professional headshot of ${TRIGGER}, premium dark charcoal to warm gray gradient seamless background, dramatic studio lighting, formal business suit, ${Q}`,

  // ── Tech / Startup ───────────────────────────────────────────────────────
  startup:
    `professional headshot of ${TRIGGER}, modern tech office glass walls and open plan softly blurred in background, business casual smart attire, bright cinematic lighting, ${Q}`,
  coworking:
    `professional headshot of ${TRIGGER}, contemporary coworking space exposed brick walls lush green plants softly blurred in background, smart casual attire, natural daylight, ${Q}`,
  tecnologia:
    `professional headshot of ${TRIGGER}, dark high-tech environment with glowing blue LED ambient lighting blurred background, business casual, cinematic blue rim lighting, ${Q}`,

  // ── Empresarial ──────────────────────────────────────────────────────────
  empresa:
    `professional business portrait of ${TRIGGER}, busy modern office environment with colleagues softly blurred far in background, business suit, ${Q}`,

  // ── Externo ──────────────────────────────────────────────────────────────
  cidade:
    `professional outdoor headshot of ${TRIGGER}, urban city skyline at golden hour with bokeh lights softly blurred in background, business suit, warm cinematic rim light, ${Q}`,
  jardim:
    `professional outdoor headshot of ${TRIGGER}, lush green garden with flowers and foliage softly blurred in background, smart business casual attire, soft natural daylight, ${Q}`,
  arquitetura:
    `professional headshot of ${TRIGGER}, modern glass and steel architectural facade softly blurred in background, business suit, crisp even daylight, ${Q}`,

  // ── Criativo ─────────────────────────────────────────────────────────────
  biblioteca:
    `professional headshot of ${TRIGGER}, classic library with towering wooden bookshelves softly blurred in background, business casual attire, warm ambient library lighting, ${Q}`,
  cafe:
    `professional headshot of ${TRIGGER}, upscale cafe warm bokeh pendant lights and wooden decor softly blurred in background, smart casual attire, warm ambient lighting, ${Q}`,
  arte:
    `professional headshot of ${TRIGGER}, contemporary art gallery white walls and colorful artworks softly blurred in background, chic business attire, gallery lighting, ${Q}`,

  // ── Premium ──────────────────────────────────────────────────────────────
  luxo:
    `premium professional headshot of ${TRIGGER}, luxury hotel suite with chandeliers and golden tones softly blurred in background, premium formal business suit, cinematic lighting, ${Q}`,
  dourado:
    `premium executive headshot of ${TRIGGER}, warm golden hour side light, rich golden bokeh background, luxury formal suit, ${Q}`,
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
      steps: 1500,          // was 1000 — more steps = sharper face recall
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

  // 6 seeds → 6 diverse variations to maximise the chance of a great shot
  const seeds = [42, 137, 2024, 8888, 512, 7777];

  const results = await Promise.all(
    seeds.map((seed) =>
      fal.queue.submit(GEN_MODEL, {
        input: {
          prompt,
          loras: [{ path: loraUrl, scale: 1.0 }],   // 1.0 = max face fidelity
          num_images: 1,
          image_size: "portrait_4_3",                // 768×1024 portrait
          num_inference_steps: 40,                   // was 28 — more detail
          guidance_scale: 7.0,                       // was 3.5 — THIS fixes the blur
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
