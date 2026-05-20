"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-gray-800 bg-black">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-bold text-white hover:text-gray-200 transition">
          Headshot BR
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/upload" className="text-gray-300 hover:text-white transition">
            Criar
          </Link>
          <Link href="/results" className="text-gray-300 hover:text-white transition">
            Exemplos
          </Link>

          {status !== "loading" && (
            session ? (
              <>
                <Link href="/account" className="text-gray-300 hover:text-white transition">
                  {session.user?.name ?? session.user?.email}
                </Link>
                <button
                  onClick={() => signOut()}
                  className="rounded-lg border border-gray-700 px-3 py-1 text-gray-300 hover:border-gray-500 hover:text-white transition"
                >
                  Sair
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="rounded-lg bg-green-500 px-3 py-1 font-semibold text-black hover:bg-green-400 transition"
              >
                Entrar
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
