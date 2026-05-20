const groups = [
  { title: "Corporativo", keys: ["corporativo-1", "corporativo-2", "corporativo-3", "corporativo-4"] },
  { title: "Startup", keys: ["startup-1", "startup-2", "startup-3", "startup-4"] },
  { title: "Empresa (pessoas desfocadas)", keys: ["empresa-1", "empresa-2", "empresa-3", "empresa-4"] },
  { title: "Executivo (fundo escuro)", keys: ["executivo-1", "executivo-2", "executivo-3", "executivo-4"] },
  { title: "Minimalista (branco)", keys: ["minimalista-1", "minimalista-2", "minimalista-3", "minimalista-4"] },
];

export default function ResultsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Exemplos</h1>
            <p className="mt-2 text-gray-300 text-sm">
              Veja como ficam os headshots em cada estilo disponível.
            </p>
          </div>

          <a
            href="/upload"
            className="rounded-xl bg-green-500 px-5 py-2 font-semibold text-black hover:bg-green-400 transition"
          >
            Testar agora
          </a>
        </div>

        <div className="mt-10 space-y-10">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className="text-lg font-semibold">{g.title}</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {g.keys.map((k) => (
                  <a
                    key={k}
                    href={`/mock/${k}.jpg`}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-gray-800 bg-white/5 hover:border-gray-600 transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/mock/${k}.jpg`}
                      alt={k}
                      className="h-56 w-full object-cover"
                    />
                    <div className="px-3 py-2 text-xs text-gray-300">{k}</div>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
