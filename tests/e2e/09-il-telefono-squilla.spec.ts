import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * Il telefono squilla e chi risponde sa chi è.
 *
 * È la prova che nessun test di unità può dare: il centralino chiama Tavolo da
 * fuori, e la persona che sta in sala deve vedere il nome comparire sul suo
 * schermo senza toccare niente. In mezzo ci sono tre cose che possono cedere
 * separatamente — la licenza, il token, e la sonda che accorge la schermata —
 * e solo insieme fanno il prodotto.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("il centralino annuncia una chiamata e il nome compare in sala", async ({ page, request }) => {
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });

  /* Il telefono si accende con una licenza firmata, come per un cliente vero:
     non c'è una scorciatoia «in prova» — se ci fosse, questa prova non
     verificherebbe la strada che percorrono i clienti. */
  await db.venue.update({
    where: { id: locale.id },
    data: {
      phoneLicenseKey: licenzaDiProva(locale.id, "Locale di prova"),
      phoneLicenseActivatedAt: new Date(),
    },
  });

  const nome = unico("Chiamante");
  const numero = "3478812233";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "Aspetta",
      phone: numero,
      allergies: "Arachidi",
      noShowCount: 2,
    },
  });

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (percorso)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });

  try {
    /* --- 1. La sala è aperta e non squilla niente ----------------------- */
    await page.goto("/service");
    await expect(page.getByText(/In sala|IN ARRIVO/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(nome)).toHaveCount(0);

    /* --- 2. Il centralino dice che sta squillando ----------------------- */
    const chiamata = unico("call");
    const risposta = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: chiamata, phone: `+39${numero}`, stato: "RINGING" },
    });
    expect(risposta.ok()).toBe(true);
    // Il centralino riceve subito chi è: gli serve per il suo cruscotto, e non
    // deve fare una seconda domanda mentre il telefono squilla.
    expect((await risposta.json()).chi?.firstName).toBe(nome);

    /* --- 3. In sala compare, da sé -------------------------------------- */
    /* Nessun ricaricamento: la schermata chiede al server ogni cinque secondi
       «è cambiato qualcosa?». Se le chiamate non fossero in quel segnale, il
       riquadro comparirebbe solo quando si muove qualcos'altro in sala — cioè,
       in un locale tranquillo, mai. */
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sta chiamando/)).toBeVisible();

    // E le due cose per cui il riquadro esiste.
    await expect(page.getByText(/Allergie: Arachidi/)).toBeVisible();
    await expect(page.getByText(/2 volte non si è presentato/)).toBeVisible();

    /* --- 4. La chiamata finisce e il riquadro va via -------------------- */
    const fine = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: chiamata, stato: "ENDED" },
    });
    expect(fine.ok()).toBe(true);

    /* Il riquadro non deve restare: un telefono che sembra squillare mentre il
       locale è silenzioso è peggio di nessun riquadro. */
    await expect(page.getByText(/sta chiamando/)).toBeHidden({ timeout: 30_000 });
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
