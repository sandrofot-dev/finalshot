import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { requireSession } from "@/app/lib/session";

export const runtime = "nodejs";

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "Envie um arquivo no campo 'file'." },
        { status: 400 }
      );
    }

    const f = file as File;

    if (!["image/jpeg", "image/png"].includes(f.type)) {
      return NextResponse.json(
        { success: false, error: "Somente JPG/PNG." },
        { status: 400 }
      );
    }

    const ext = f.type === "image/png" ? "png" : "jpg";

    // Production: Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`uploads/${newId()}.${ext}`, f, {
        access: "public",
        contentType: f.type,
      });
      return NextResponse.json({ success: true, uploadId: blob.url });
    }

    // Development: local disk
    const bytes = await f.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadId = newId();
    const dir = path.join(process.cwd(), ".tmp", "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${uploadId}.${ext}`), buffer);

    return NextResponse.json({ success: true, uploadId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro no upload";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
