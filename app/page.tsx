export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-5xl font-bold leading-tight">
          Seu headshot corporativo com IA, em minutos
        </h1>

        <p className="mt-4 max-w-2xl text-lg text-gray-300">
          Envie suas selfies, escolha o estilo (escritório, startup, executivo, minimalista)
          e gere variações prontas para LinkedIn e currículo.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="/upload"
            className="rounded-xl bg-green-500 px-7 py-3 font-semibold text-black hover:bg-green-400"
          >
            Começar agora
          </a>

          <a
            href="/results"
            className="rounded-xl border border-gray-700 px-7 py-3 font-semibold text-white hover:bg-white/5"
          >
            Ver exemplos
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-white/5 p-5">
            <div className="text-sm text-gray-400">1) Upload</div>
            <div className="mt-2 font-semibold">Envie uma selfie</div>
            <div className="mt-1 text-sm text-gray-300">
              Boa luz e rosto centralizado.
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-white/5 p-5">
            <div className="text-sm text-gray-400">2) Fundo</div>
            <div className="mt-2 font-semibold">Escolha um estilo</div>
            <div className="mt-1 text-sm text-gray-300">
              Escritório, startup, executivo, minimalista.
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-white/5 p-5">
            <div className="text-sm text-gray-400">3) Gerar</div>
            <div className="mt-2 font-semibold">Gere 4 variações</div>
            <div className="mt-1 text-sm text-gray-300">
              Resultado pronto em minutos.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
