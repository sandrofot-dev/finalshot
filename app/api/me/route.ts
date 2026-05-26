import { NextResponse } from "next/server";
import { requireSession } from "@/app/lib/session";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { loraUrl: true, loraAt: true },
  });

  return NextResponse.json({
    loraUrl: user?.loraUrl ?? null,
    loraAt:  user?.loraAt  ?? null,
  });
}
