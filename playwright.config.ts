import { defineConfig, devices } from "@playwright/test";

/**
 * E2E. Por padrão sobe o app em modo produção apontando para E2E_SUPABASE_URL.
 * Cenários autenticados exigem um Supabase com o seed de demonstração (npm run db:local
 * equivalente via `supabase start` + seeds) e E2E_AUTH=1.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        port,
        reuseExistingServer: true,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_KEY ?? "chave-de-teste",
        },
      },
});
