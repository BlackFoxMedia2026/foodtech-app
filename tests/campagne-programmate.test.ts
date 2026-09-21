import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { chiudiLeProgrammate } from "@/server/dem/programmate";
import { chiudiCampagnaProgrammata } from "@/server/campaigns";
import { riservaQuota, statoConsumo } from "@/server/dem/consumo";
import { assicuraPiani } from "@/server/dem/piani";
import type { EmailProviderAdapter } from "@/server/marketing/email-provider";

/**
 * Le campagne programmate, e il momento in cui qualcuno le chiude.
 *
 * Era il difetto piu costoso fra quelli rimasti: una campagna affidata al
 * fornitore restava «Programmata · Partira all'ora indicata» **per sempre**.
 * Le email uscivano, e in Tavolo non risultava inviata niente.
 *
 * Il danno vero non e la scritta: e `reservedCount`. Gli invii riservati per
 * quella campagna non venivano ne consumati ne restituiti — spariti dalla
 * quota del mese senza comparire fra quelli usati. Chi programma quattro
 * campagne si trova il piano esaurito con «zero inviate».
 *
 * Quello che questi test difendono:
 *
 * - «l'ora e passata» non e «e partita»: si guarda quanti ne ha mandati il
 *   fornitore;
 * - due giri del cron non consumano gli invii due volte;
 * - una campagna che non e uscita lo **dice**, e restituisce la quota.
 */

const db = new PrismaClient();
const PREFISSO = "test-programmate-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const ADESSO = new Date("2026-09-21T20:00:00.000Z");
/** L'appuntamento: mezz'ora fa, cioè oltre i dieci minuti di attesa. */
const APPUNTAMENTO = new Date("2026-09-21T19:30:00.000Z");

let venueId = "";
let orgId = "";

/** Un fornitore finto: dice quanti ne ha mandati, e nient'altro. */
function fornitore(inviati: number, aperti = 0) {
  const getCampaignStats = vi.fn().mockResolvedValue({ sentCount: inviati, openedCount: aperti });
  return { adapter: { getCampaignStats } as unknown as EmailProviderAdapter, getCampaignStats };
}

async function campagnaProgrammata(opz: { quando?: Date; riservati?: number } = {}) {
  const riservati = opz.riservati ?? 120;
  const riserva = await riservaQuota(venueId, riservati, ADESSO);
  const campagna = await db.campaign.create({
    data: {
      venueId,
      name: `${PREFISSO}campagna`,
      status: "SCHEDULED",
      scheduledAt: opz.quando ?? APPUNTAMENTO,
      providerId: "brevo-1",
      recipientsCount: riservati,
      reservedCount: riservati,
      usagePeriod: riserva.riservata ? riserva.ciclo : null,
      queuedAt: ADESSO,
    },
    select: { id: true },
  });
  return campagna.id;
}

async function pulisci() {
  await db.campaign.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.demUsagePeriod.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.demSubscription.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.notification.deleteMany({ where: { Venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  await assicuraPiani();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  orgId = (await db.organization.create({ data: { name: `${PREFISSO}org`, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `v-${unico}`, timezone: "Europe/Rome" },
    })
  ).id;
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

describe("chiudere una campagna che il fornitore ha mandato", () => {
  it("diventa inviata, con il numero del fornitore e l'ora dell'appuntamento", async () => {
    const id = await campagnaProgrammata();
    const { adapter, getCampaignStats } = fornitore(118, 40);

    const esito = await chiudiLeProgrammate(ADESSO, adapter);
    expect(esito).toEqual({ guardate: 1, inviate: 1, nonRiuscite: 0 });
    expect(getCampaignStats).toHaveBeenCalledWith("brevo-1");

    const c = await db.campaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("SENT");
    expect(c.sentCount).toBe(118);
    expect(c.openedCount).toBe(40);
    /* L'ora dell'invio e quella dell'appuntamento: scrivere quella del cron
       farebbe sembrare partita alle 3 di notte una campagna uscita alle nove. */
    expect(c.sentAt?.toISOString()).toBe(APPUNTAMENTO.toISOString());
  });

  it("gli invii impegnati diventano usati, e non spariscono", async () => {
    /* E il danno che si paga: fuori dai disponibili e fuori dagli usati. */
    await campagnaProgrammata({ riservati: 120 });
    const prima = await statoConsumo(venueId, ADESSO);
    expect(prima.riservati).toBe(120);
    expect(prima.usati).toBe(0);

    await chiudiLeProgrammate(ADESSO, fornitore(120).adapter);

    const dopo = await statoConsumo(venueId, ADESSO);
    expect(dopo.riservati).toBe(0);
    expect(dopo.usati).toBe(120);
    expect(dopo.disponibili).toBe(prima.disponibili);
  });

  it("non tocca una campagna il cui appuntamento e appena passato", async () => {
    /* Il fornitore non manda al secondo: leggere zero un minuto dopo e
       dichiarare non riuscita una campagna che sta uscendo. */
    const id = await campagnaProgrammata({
      quando: new Date(ADESSO.getTime() - 60_000),
    });
    const { adapter, getCampaignStats } = fornitore(0);

    expect(await chiudiLeProgrammate(ADESSO, adapter)).toEqual({
      guardate: 0,
      inviate: 0,
      nonRiuscite: 0,
    });
    expect(getCampaignStats).not.toHaveBeenCalled();
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED");
  });

  it("non tocca una campagna che aspetta ancora il suo momento", async () => {
    const id = await campagnaProgrammata({ quando: new Date(ADESSO.getTime() + 86_400_000) });
    await chiudiLeProgrammate(ADESSO, fornitore(0).adapter);
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED");
  });
});

describe("una campagna che non e uscita", () => {
  it("dopo qualche ora si dichiara non riuscita, e restituisce la quota", async () => {
    const id = await campagnaProgrammata({
      quando: new Date(ADESSO.getTime() - 7 * 3_600_000),
      riservati: 80,
    });

    const esito = await chiudiLeProgrammate(ADESSO, fornitore(0).adapter);
    expect(esito).toMatchObject({ inviate: 0, nonRiuscite: 1 });

    const c = await db.campaign.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe("FAILED");
    expect(c.reservedCount).toBe(0);

    /* Gli invii tornano **disponibili**: non sono stati usati. */
    const dopo = await statoConsumo(venueId, ADESSO);
    expect(dopo.usati).toBe(0);
    expect(dopo.riservati).toBe(0);

    /* E lo deve sapere qualcuno: una campagna che non parte e non lo dice a
       nessuno e peggio di una non riuscita, perche nessuno la rifa. */
    const avviso = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "AUTOMATION_FAILED" },
    });
    expect(avviso.title).toContain("non inviata");
    expect(avviso.body).toMatch(/riprogrammala/);
  });

  it("aspetta prima di darla per persa: fra dieci minuti e sei ore non decide", async () => {
    const id = await campagnaProgrammata({ quando: new Date(ADESSO.getTime() - 3_600_000) });
    const esito = await chiudiLeProgrammate(ADESSO, fornitore(0).adapter);
    expect(esito).toEqual({ guardate: 1, inviate: 0, nonRiuscite: 0 });
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED");
  });

  it("un fornitore che non risponde non fa perdere la campagna", async () => {
    /* Un errore di rete non e «non l'ha mandata»: la campagna resta
       programmata e la si riguarda al giro dopo. */
    const id = await campagnaProgrammata();
    const adapter = {
      getCampaignStats: vi.fn().mockRejectedValue(new Error("rete")),
    } as unknown as EmailProviderAdapter;

    expect(await chiudiLeProgrammate(ADESSO, adapter)).toMatchObject({ inviate: 0, nonRiuscite: 0 });
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED");
  });
});

describe("la chiusura, chiamata da sola", () => {
  it("chiusa due volte, consuma gli invii una volta sola", async () => {
    /*
      Il lucchetto e il **passaggio di stato dentro la scrittura**: solo chi lo
      cambia davvero va avanti a toccare la quota. Un controllo prima dello
      `update` lascerebbe passare due chiamate — due giri di cron che si
      sovrappongono, un tentativo ripetuto dopo un errore di rete — e il
      cliente si vedrebbe scalare il doppio di quello che ha mandato.

      La prova sta qui e non sul giro del cron: quello filtra gia per stato, e
      alla seconda passata la campagna non la trova nemmeno. Passerebbe anche
      senza lucchetto, cioe sarebbe un verde che non puo diventare rosso.
    */
    const id = await campagnaProgrammata({ riservati: 60 });
    expect(await chiudiCampagnaProgrammata(id, { inviati: 60, quando: APPUNTAMENTO })).toBe(true);

    /* Si rimettono gli invii impegnati: senza questo, la seconda chiamata si
       fermerebbe perche `reservedCount` e zero — un secondo motivo che
       coprirebbe l'assenza del primo. */
    await db.campaign.update({ where: { id }, data: { reservedCount: 60 } });
    expect(await chiudiCampagnaProgrammata(id, { inviati: 999, quando: ADESSO })).toBe(false);

    const c = await db.campaign.findUniqueOrThrow({ where: { id } });
    expect(c.sentCount).toBe(60);
    expect((await statoConsumo(venueId, ADESSO)).usati).toBe(60);
  });

  it("non dichiara non riuscita una campagna che risulta inviata", async () => {
    const id = await campagnaProgrammata();
    await chiudiCampagnaProgrammata(id, { inviati: 10, quando: APPUNTAMENTO });
    expect(await chiudiCampagnaProgrammata(id, { nonRiuscita: "boh" })).toBe(false);
    expect((await db.campaign.findUniqueOrThrow({ where: { id } })).status).toBe("SENT");
  });
});
