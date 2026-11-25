import { expect, test } from "@playwright/test";

/** Fluxos públicos: não dependem de sessão válida. */
test.describe("acesso sem sessão", () => {
  for (const path of ["/dashboard", "/acoes", "/agenda", "/configuracoes", "/worldskills", "/acompanhamentos", "/inova", "/recursos", "/orcamento", "/riscos", "/relatorios", "/documentos/00000000-0000-0000-0000-000000000000/download"]) {
    test(`redireciona ${path} para o login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    });
  }

  test("ICS não é exportado sem sessão", async ({ request }) => {
    const r = await request.get("/agenda/ics?programa=00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(r.status());
  });

  test("rota de alertas exige segredo", async ({ request }) => {
    const r = await request.get("/api/cron/alertas");
    expect(r.status()).toBe(401);
  });

  test("login valida no cliente com Zod e não revela existência do e-mail", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
    await page.getByLabel("E-mail institucional").fill("alguem@exemplo.invalid");
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha inválidos, ou acesso não liberado.")).toBeVisible();
  });

  test("não há cadastro público e o layout cabe na tela", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/acesso é concedido por convite/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /cadastr/i })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("cabeçalhos de segurança presentes", async ({ request }) => {
    const r = await request.get("/login");
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["x-powered-by"]).toBeUndefined();
  });
});
