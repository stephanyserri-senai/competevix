import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "COMPETE VIX", template: "%s · COMPETE VIX" },
  description: "Portal de gestão integrada das competições — SENAI Vitória (Beira-Mar e Porto).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a2244" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
