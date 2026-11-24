export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="conteudo" className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <span aria-hidden className="mx-auto mb-3 grid size-12 place-items-center rounded-lg bg-accent-500 text-lg font-black">CV</span>
          <p className="text-2xl font-extrabold tracking-wide">COMPETE VIX</p>
          <p className="text-sm text-brand-200">Gestão integrada das competições · SENAI Vitória</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-xl">{children}</div>
        <p className="mt-6 text-center text-xs text-brand-200">Acesso restrito por convite. Uso institucional.</p>
      </div>
    </main>
  );
}
