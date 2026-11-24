import { expect, test, type Page } from "@playwright/test";

/**
 * Critério de aceite da Etapa 1 pela interface: usuários de escopos diferentes
 * não acessam dados cruzados; filtros e cadastros persistem.
 * Requer Supabase com supabase/seed/references.sql + demo.sql e E2E_AUTH=1.
 */
test.skip(!process.env.E2E_AUTH, "Defina E2E_AUTH=1 com um Supabase local semeado (veja README).");

const PASSWORD = "Demo-Compete-2026";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail institucional").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("supervisão da Unidade A não vê ações da Unidade B", async ({ page }) => {
  await login(page, "supervisao.a@demo.compete.local");
  await page.goto("/acoes");
  await expect(page.getByText("[DEMO] Revisar plano da semana")).toBeVisible();
  await expect(page.getByText("[DEMO] Ação da Unidade B")).toHaveCount(0);
});

test("supervisão da Unidade B não abre ação da Unidade A por URL", async ({ page, browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await login(a, "supervisao.a@demo.compete.local");
  await a.goto("/acoes");
  await a.getByText("[DEMO] Revisar plano da semana").click();
  const url = a.url();
  await ctxA.close();

  await login(page, "supervisao.b@demo.compete.local");
  await page.goto(url);
  await expect(page.getByText("Registro não encontrado")).toBeVisible();
});

test("competidor vê apenas a própria equipe e não tem formulário de criação", async ({ page }) => {
  await login(page, "competidor@demo.compete.local");
  await page.goto("/acoes");
  await expect(page.getByText("[DEMO] Revisar plano da semana")).toBeVisible();
  await expect(page.getByText("[DEMO] Levantar insumos do posto de treino")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nova ação" })).toHaveCount(0);
});

test("administração não vê dados operacionais sem vínculo", async ({ page }) => {
  await login(page, "admin@demo.compete.local");
  await expect(page.getByText("Sem vínculo operacional vigente")).toBeVisible();
  await page.goto("/configuracoes?aba=usuarios");
  await expect(page.getByText("supervisao.a@demo.compete.local")).toBeVisible();
});

test("cadastro e filtro persistem", async ({ page }) => {
  await login(page, "supervisao.a@demo.compete.local");
  await page.goto("/acoes");
  const title = `[DEMO] Ação E2E ${Date.now()}`;
  await page.getByLabel("Título").fill(title);
  await page.getByRole("button", { name: "Criar ação" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.goto(`/acoes?q=${encodeURIComponent("Ação E2E")}`);
  await expect(page.getByText(title)).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});
