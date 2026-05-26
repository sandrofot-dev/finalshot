import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = "fal-ai/instantid";

// InstantID does NOT need a trigger word — just describe the scene
const PROMPTS: Record<string, string> = {
  corporativo:
    "professional corporate headshot, elegant office with bookshelves in background, soft natural window light, business attire, sharp focus on face, photorealistic, 4k",
  startup:
    "professional headshot, modern tech office background with glass walls and soft bokeh, business casual attire, bright cinematic lighting, sharp focus on face, photorealistic, 4k",
  empresa:
    "professional business portrait, blurred office environment far in background, colleagues out of focus behind, business attire, sharp focus on face, photorealistic, 4k",
  executivo:
    "executive business portrait, dark solid background, dramatic professional studio lighting, formal business attire, confident expression, sharp focus on face, photorealistic, 4k",
  minimalista:
    "professional LinkedIn headshot, clean white studio background, soft even lighting, centered composition, business casual, sharp focus on face, photorealistic, 4k",
};

const NEGATIVE =
  "ugly, deformed, distorted face, blurry face, bad anatomy, extra limbs, cartoon, anime, painting, watermark, text, artifacts, glitch, overexposed, underexposed, bad proportions, disfigured, mutated, low quality, worst quality, nsfw";

// Submit 4 parallel InstantID requests with different seeds → better variety + identity
export async function submitHeadshotJob(
  uploadUrl: string,
  background: string
): Promise<string> {
  const prompt = PROMPTS[background] ?? PROMPTS.empresa;

  const seeds = [42, 137, 2024, 8888];

  const results = await Promise.all(
    seeds.map((seed) =>
      fal.queue.submit(MODEL, {
        input: {
          face_image_url: uploadUrl,
          prompt,
          negative_prompt: NEGATIVE,
          style: "Headshot",
          num_inference_steps: 30,
          guidance_scale: 7,
          ip_adapter_scale: 0.8,
          identity_controlnet_conditioning_scale: 0.85,
          enhance_face_region: true,
          enable_lcm: false,
          seed,
        },
      })
    )
  );

  // Store all 4 request IDs as JSON array
  return JSON.stringify(results.map((r) => r.request_id));
}

type FalStatus =
  | { status: "queued"; progress: number }
  | { status: "processing"; progress: number }
  | { status: "done"; progress: 100; resultUrls: string[] }
  | { status: "error"; progress: 0 };

type SingleResult =
  | { done: true; url: string }
  | { done: false; progress: number };

async function checkSingle(requestId: string): Promise<SingleResult> {
  const status = await fal.queue.status(MODEL, { requestId, logs: false });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(MODEL, { requestId });
    const data = result.data as unknown as { image?: { url: string }; images?: Array<{ url: string }> };
    const url = data.image?.url ?? data.images?.[0]?.url ?? "";
    return { done: true, url };
  }

  const queuePos = status.status === "IN_QUEUE" ? (status.queue_position ?? 0) : 0;
  const progress = status.status === "IN_PROGRESS" ? 60 : Math.max(5, 50 - queuePos * 10);
  return { done: false, progress };
}

export async function checkHeadshotJob(falRequestId: string): Promise<FalStatus> {
  try {
    // Support both old (single string) and new (JSON array) formats
    let ids: string[];
    try {
      ids = JSON.parse(falRequestId);
      if (!Array.isArray(ids)) ids = [falRequestId];
    } catch {
      ids = [falRequestId];
    }

    const checks = await Promise.all(ids.map(checkSingle));

    const doneCount = checks.filter((c) => c.done).length;
    const allDone = doneCount === ids.length;

    if (allDone) {
      const resultUrls = checks
        .filter((c): c is { done: true; url: string } => c.done)
        .map((c) => c.url)
        .filter(Boolean);
      return { status: "done", progress: 100, resultUrls };
    }

    const avgProgress = Math.round(
      checks.reduce((sum, c) => sum + (c.done ? 100 : c.progress), 0) / ids.length
    );

    return {
      status: doneCount > 0 ? "processing" : "queued",
      progress: Math.min(avgProgress, 99),
    };
  } catch {
    return { status: "error", progress: 0 };
  }
}
