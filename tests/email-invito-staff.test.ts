import { describe, expect, it } from "vitest";
import { corpoEmailInvito, inviaEmailInvitoStaff } from "@/server/email-invito-staff";

describe("l'email di invito a un nuovo assunto", () => {
  const base = {
    nome: "Marco",
    locale: "Aurora Bistrot",
    ruolo: "Cameriere",
    link: "https://app.esempio.it/invito/abc123",
    scadeIl: new Date("2026-11-24T10:00:00Z"),
  };

  it("ha il pulsante «Configura password» che porta al link dell'invito", () => {
    const html = corpoEmailInvito(base);
    expect(html).toContain("Configura password");
    expect(html).toContain('href="https://app.esempio.it/invito/abc123"');
    expect(html).toContain("Aurora Bistrot");
    expect(html).toContain("24 novembre");
  });

  it("non lascia passare HTML nei nomi scritti a mano", () => {
    const html = corpoEmailInvito({ ...base, nome: "<b>x</b>", locale: 'Bar "da Gino" & co' });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&quot;da Gino&quot; &amp; co");
  });

  it("senza posta configurata non prova a inviare, e lo dice", async () => {
    const prima = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    await expect(inviaEmailInvitoStaff({ ...base, email: "marco@esempio.it" })).resolves.toBe("posta_non_configurata");
    if (prima !== undefined) process.env.BREVO_API_KEY = prima;
  });
});
