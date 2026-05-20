import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = "fal-ai/photomaker";

// Trigger word "img" tells PhotoMaker which faces are the reference
const PROMPTS: Record<string, string> = {
  corporativo:  "img, professional corporate office background, natural light, high-end business environment, realistic depth of field, sharp focus, 4k",
  startup:      "img, modern startup office, glass walls, creative workspace, cinematic lighting, professional headshot, 4k",
  empresa:      "img, corporate environment with blurred people in background, shallow depth of field, professional headshot, 4k",
  executivo:    "img, dark executive portrait background, dramatic lighting, high-end CEO look, professional headshot, 4k",
  minimalista:  "img, clean white studio background, soft lighting, professional LinkedIn headshot, 4k",
};

const NEGATIVE =
  "distorted, deformed, ugly, blurry, low quality, bad anatomy, extra limbs, cartoon, anime, painting, watermark";

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
      guidance_scale: 5,
      num_inference_steps: 50,
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

  // IN_QUEUE or IN_PROGRESS (FAILED surfaces as a thrown exception from the SDK)
  const queuePos = status.status === "IN_QUEUE" ? (status.queue_position ?? 0) : 0;
  const progress = status.status === "IN_PROGRESS" ? 60 : Math.max(10, 50 - queuePos * 10);

  return {
    status: status.status === "IN_PROGRESS" ? "processing" : "queued",
    progress,
  };
}
