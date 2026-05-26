import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = "fal-ai/photomaker";

// "img" is the PhotoMaker trigger word — must be in the prompt
// Prompts are optimized for face consistency and realism
const PROMPTS: Record<string, string> = {
  corporativo:
    "a photo of img person, professional corporate headshot, elegant office background with bookshelves, soft natural window light, sharp face, studio quality, 4k, photorealistic",
  startup:
    "a photo of img person, professional headshot, modern tech office background with glass walls, soft bokeh, contemporary lighting, sharp face, studio quality, 4k, photorealistic",
  empresa:
    "a photo of img person, professional business portrait, office environment background with out-of-focus colleagues far behind, deep depth of field on face, sharp face, studio quality, 4k, photorealistic",
  executivo:
    "a photo of img person, executive business portrait, dark solid background, dramatic professional lighting, confident CEO look, sharp face, studio quality, 4k, photorealistic",
  minimalista:
    "a photo of img person, professional LinkedIn headshot, clean white studio background, soft even lighting, centered composition, sharp face, studio quality, 4k, photorealistic",
};

// Strong negative prompt to prevent the most common PhotoMaker artifacts
const NEGATIVE =
  "duplicate person, duplicate face, same person twice, person in background, ugly, deformed, distorted face, blurry face, bad anatomy, extra limbs, cartoon, anime, painting, watermark, text, artifacts, glitch, noise, overexposed, underexposed, bad proportions, disfigured, mutated, low quality, worst quality, jpeg artifacts";

export async function submitHeadshotJob(
  uploadUrl: string,
  background: string
): Promise<string> {
  const prompt = PROMPTS[background] ?? PROMPTS.empresa;

  const { request_id } = await fal.queue.submit(MODEL, {
    input: {
      image_archive_url: uploadUrl,
      prompt,
      negative_prompt: NEGATIVE,
      style: "Photographic",
      num_images: 4,
      guidance_scale: 7.5,       // higher = more prompt-accurate, better face control
      num_inference_steps: 50,
      style_strength_ratio: 35,  // lower = more identity preservation (default is 20, max 50)
    },
  });

  return request_id;
}

type FalStatus =
  | { status: "queued"; progress: number }
  | { status: "processing"; progress: number }
  | { status: "done"; progress: 100; resultUrls: string[] }
  | { status: "error"; progress: 0 };

export async function checkHeadshotJob(requestId: string): Promise<FalStatus> {
  const status = await fal.queue.status(MODEL, { requestId, logs: false });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(MODEL, { requestId });
    const data = result.data as unknown as { images: Array<{ url: string }> };
    const resultUrls = data.images.map((img) => img.url);
    return { status: "done", progress: 100, resultUrls };
  }

  const queuePos = status.status === "IN_QUEUE" ? (status.queue_position ?? 0) : 0;
  const progress = status.status === "IN_PROGRESS" ? 60 : Math.max(10, 50 - queuePos * 10);

  return {
    status: status.status === "IN_PROGRESS" ? "processing" : "queued",
    progress,
  };
}
