import Image from "next/image";
import Link from "next/link";
import { requireSession } from "@/app/lib/session";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

const BG_NAMES: Record<string, string> = {
  corporativo: "Escritório Corporativo",
  startup: "Startup Moderna",
  empresa: "Empresa com Pessoas Desfocadas",
  executivo: "Executivo Fundo Escuro",
  minimalista: "Minimalista Branco",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  processing: "Processando",
  done: "Concluído",
  error: "Erro",
};

export default async function AccountPage() {
  const session = await requireSession();
  if (!session) redirect("/");

  const { name, email, image } = session.user ?? {};

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold">Minha conta</h1>

        <div className="mt-8 flex items-center gap-4">
          {image && (
            <Image
              src={image}
              alt={name ?? "Avatar"}
              width={64}
              height={64}
              className="rounded-full"
            />
          )}
          <div>
            {name && <div className="text-lg font-semibold">{name}</div>}
            <div className="text-sm text-gray-400">{email}</div>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Meus headshots</h2>
            <Link
              href="/upload"
              className="rounded-lg bg-green-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-green-400 transition"
            >
              + Criar novo
            </Link>
          </div>

          {jobs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-gray-800 bg-white/5 p-8 text-center text-sm text-gray-400">
              Você ainda não gerou nenhum headshot.{" "}
              <Link href="/upload" className="text-green-400 hover:text-green-300 transition">
                Criar agora
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {jobs.map((job) => {
                const urls: string[] = job.resultUrls ? JSON.parse(job.resultUrls) : [];
                const thumb = urls[0];

                return (
                  <li
                    key={job.id}
                    className="flex items-center gap-4 rounded-2xl border border-gray-800 bg-white/5 p-4"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-black/40">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="resultado" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">—</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{BG_NAMES[job.background] ?? job.background}</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {new Date(job.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        job.status === "done"
                          ? "bg-green-600/20 text-green-400"
                          : job.status === "error"
                          ? "bg-red-600/20 text-red-400"
                          : "bg-yellow-600/20 text-yellow-400"
                      }`}
                    >
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
