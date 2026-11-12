import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveTemplateSelection } from "../src/lib/campaign-start";

/**
 * Le campagne della vetrina, con tutti i dati che il report sa mostrare
 * (11 novembre 2026).
 *
 * `sistemaCampagnaDemo` scriveva solo i `MessageLog`: il report leggeva
 * contatori e righe destinatario che nella demo non c'erano, e mezza pagina
 * restava vuota («esiti di consegna non arrivati», nessun link, nessun
 * andamento). Qui ogni campagna inviata ha:
 *
 * - una riga `CampaignRecipient` per destinatario, con consegna, prima
 *   apertura, primo click, rimbalzi e disiscrizioni **datati**: le aperture
 *   si addensano nelle prime ore, come succede davvero;
 * - gli eventi `CLICK` con l'indirizzo, per «Link più cliccati»;
 * - i contatori della campagna ricalcolati da quelle righe, mai scritti a mano;
 * - per la campagna principale, prenotazioni attribuite a clienti che hanno
 *   **davvero** cliccato (prima il click, poi la prenotazione);
 * - due campagne passate, perché «rispetto alla media del locale» abbia una
 *   media.
 *
 * Ripetibile: una campagna che ha già righe destinatario non si tocca.
 */

const MINUTO = 60_000;
const ORA = 3_600_000;
const GIORNO = 86_400_000;

function caso(seme: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seme.length; i++) {
    h ^= seme.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h >>>= 0;
    return h / 4294967296;
  };
}

function fra(r: () => number, min: number, max: number) {
  return min + Math.floor(r() * (max - min + 1));
}

/** Un ritardo che si addensa all'inizio: metà delle aperture entro ~4 ore. */
function ritardoApertura(r: () => number) {
  const ore = -Math.log(1 - r() * 0.995) * 6;
  return Math.min(ore, 7 * 24) * ORA + fra(r, 1, 50) * MINUTO;
}

type Link = { url: string; peso: number };

const LINK_PRENOTA = (slug: string) => `https://tavolo.app/${slug}/prenota?utm_campaign=dormienti`;

type Profilo = {
  apertura: number;
  click: number;
  rimbalzo: number;
  disiscrizione: number;
  link: Link[];
};

type Destinatario = { guestId: string; email: string; firstName: string; lastName: string | null; aperta?: boolean };

async function riempi(
  db: PrismaClient,
  venueId: string,
  campagna: { id: string },
  inviata: Date,
  destinatari: Destinatario[],
  profilo: Profilo,
  cliccanoDiSicuro: Set<string> = new Set(),
) {
  const recipients: Prisma.CampaignRecipientCreateManyInput[] = [];
  const eventi: Prisma.CampaignEventCreateManyInput[] = [];
  const totPesi = profilo.link.reduce((n, l) => n + l.peso, 0);
  const scegliLink = (r: () => number) => {
    let x = r() * totPesi;
    for (const l of profilo.link) if ((x -= l.peso) <= 0) return l.url;
    return profilo.link[0].url;
  };
  const clickDi = new Map<string, Date>();

  destinatari.forEach((d, i) => {
    const r = caso(`dem-${campagna.id}-${d.guestId}`);
    const id = `${campagna.id.slice(0, 12)}r${i}`;
    const sentAt = new Date(inviata.getTime() + i * 2000);
    const sicuro = cliccanoDiSicuro.has(d.guestId);
    const rimbalza = !sicuro && r() < profilo.rimbalzo;
    if (rimbalza) {
      recipients.push({
        id, campaignId: campagna.id, venueId, guestId: d.guestId, email: d.email,
        firstName: d.firstName, lastName: d.lastName, status: "BOUNCED",
        providerMessageId: `demo-${id}`, queuedAt: inviata, sentAt, bouncedAt: new Date(sentAt.getTime() + 40_000),
        createdAt: inviata,
      });
      return;
    }
    const aperta = sicuro || (d.aperta ?? r() < profilo.apertura);
    const openedAt = aperta ? new Date(sentAt.getTime() + ritardoApertura(r)) : null;
    const clicca = sicuro || (aperta && r() < profilo.click);
    const clickedAt = clicca && openedAt ? new Date(openedAt.getTime() + fra(r, 1, 25) * MINUTO) : null;
    const clickCount = clicca ? fra(r, 1, 3) : 0;
    const disiscritto = aperta && !clicca && r() < profilo.disiscrizione;
    if (clickedAt) clickDi.set(d.guestId, clickedAt);

    recipients.push({
      id, campaignId: campagna.id, venueId, guestId: d.guestId, email: d.email,
      firstName: d.firstName, lastName: d.lastName, status: "DELIVERED",
      providerMessageId: `demo-${id}`, queuedAt: inviata, sentAt,
      deliveredAt: new Date(sentAt.getTime() + fra(r, 2, 40) * 1000),
      openedAt, clickedAt,
      unsubscribedAt: disiscritto && openedAt ? new Date(openedAt.getTime() + 2 * MINUTO) : null,
      openCount: aperta ? fra(r, 1, 4) : 0,
      clickCount,
      createdAt: inviata,
    });
    for (let k = 0; k < clickCount; k++) {
      eventi.push({
        venueId, campaignId: campagna.id, recipientId: id, type: "CLICK",
        providerEventId: `demo-${id}-click-${k}`,
        occurredAt: new Date(clickedAt!.getTime() + k * 3 * MINUTO),
        url: k === 0 && sicuro ? profilo.link[0].url : scegliLink(r),
      });
    }
  });

  await db.campaignRecipient.createMany({ data: recipients });
  await db.campaignEvent.createMany({ data: eventi });

  const conta = (f: (x: Prisma.CampaignRecipientCreateManyInput) => unknown) => recipients.filter(f).length;
  await db.campaign.update({
    where: { id: campagna.id },
    data: {
      sentCount: recipients.length,
      recipientsCount: recipients.length,
      deliveredCount: conta((x) => x.status === "DELIVERED"),
      openedCount: conta((x) => x.openedAt),
      clickedCount: conta((x) => x.clickedAt),
      bouncedCount: conta((x) => x.status === "BOUNCED"),
      unsubscribedCount: conta((x) => x.unsubscribedAt),
      readyAt: new Date(inviata.getTime() - 2 * ORA),
      queuedAt: new Date(inviata.getTime() - MINUTO),
      sendingStartedAt: inviata,
      sentAt: new Date(inviata.getTime() + recipients.length * 2000 + MINUTO),
    },
  });
  return clickDi;
}

const CORPO_DORMIENTI = `<h1>Ci sei mancato, {{nome}}</h1>
<p>Sono passati più di novanta giorni dalla tua ultima cena da noi, e nel frattempo la cucina è cambiata: è arrivato il menu d'autunno, con i tortelli di zucca e il brasato al Barolo.</p>
<p>Per il tuo ritorno ti teniamo un calice di benvenuto, su qualsiasi sera dal martedì al giovedì.</p>
<p><a href="#">Prenota il tuo tavolo</a></p>
<p>Vuoi prima dare un'occhiata? <a href="#">Sfoglia il menu</a>.</p>
<p>A presto,<br/>lo staff</p>`;

/**
 * Il modello da cui ogni campagna della vetrina avrebbe preso l'email.
 * Senza, le card dell'elenco mostravano un riquadro «da preparare» su
 * campagne già inviate: il corpo della demo era una riga di testo.
 */
const MODELLO_DELLA_CAMPAGNA: Record<string, string> = {
  "Menu d'autunno": "seasonal_menu",
  "Serata degustazione vini": "wine_dinner",
  "Recupero clienti dormienti": "win_back",
};

/**
 * Dà alle campagne della vetrina un'email vera, presa dal modello giusto:
 * foto di esempio comprese. Il logo segnaposto si toglie se il locale non ne
 * ha uno — su una campagna «inviata» un riquadro «IL TUO LOGO» è finto.
 * Ripetibile: una campagna che ha già un documento non si tocca.
 */
async function emailDelleCampagne(db: PrismaClient, venueId: string) {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { brandLogoUrl: true } });
  const campagne = await db.campaign.findMany({
    where: { venueId, name: { in: Object.keys(MODELLO_DELLA_CAMPAGNA) } },
    select: { id: true, name: true, subject: true, contentBlocks: true },
  });
  for (const c of campagne) {
    if (c.contentBlocks) continue;
    const doc = resolveTemplateSelection(
      { type: "template", templateId: MODELLO_DELLA_CAMPAGNA[c.name] },
      { subject: c.subject ?? "", brandLogoUrl: venue.brandLogoUrl ?? "", previousCampaigns: [] },
    );
    const blocks = venue.brandLogoUrl ? doc.blocks : doc.blocks.filter((b) => b.type !== "logo");
    await db.campaign.update({
      where: { id: c.id },
      data: { contentBlocks: { version: 2, settings: doc.settings, blocks } as unknown as Prisma.InputJsonValue },
    });
    console.log(`   Campagna «${c.name}»: email dal modello ${MODELLO_DELLA_CAMPAGNA[c.name]}.`);
  }
}

export async function campagneDemoComplete(db: PrismaClient, venueId: string) {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { slug: true } });
  const linkLocale: Link[] = [
    { url: LINK_PRENOTA(venue.slug), peso: 6 },
    { url: `https://tavolo.app/${venue.slug}/menu`, peso: 3 },
    { url: `https://instagram.com/${venue.slug.replace(/-/g, "")}`, peso: 1 },
  ];
  const ospiti = await db.guest.findMany({
    where: { venueId, marketingOptIn: true, email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: { createdAt: "asc" },
  });
  if (ospiti.length === 0) return emailDelleCampagne(db, venueId);
  const perId = new Map(ospiti.map((g) => [g.id, g]));

  /* ------------------------------------------- la campagna principale */
  const principale = await db.campaign.findFirst({
    // Quella del seed, che ha i messaggi: le campagne passate create qui sotto
    // sono più vecchie, e «la prima per data» le prenderebbe al suo posto.
    where: { venueId, status: "SENT", MessageLog: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, body: true },
  });
  if (principale && (await db.campaignRecipient.count({ where: { campaignId: principale.id } })) === 0) {
    const log = await db.messageLog.findMany({
      where: { campaignId: principale.id },
      orderBy: { createdAt: "asc" },
      select: { guestId: true, toAddress: true, providerId: true, createdAt: true },
    });
    const inviata = log[0]?.createdAt ?? new Date(Date.now() - 12 * GIORNO);
    const destinatari: Destinatario[] = (log.length > 0 ? log : ospiti.map((g) => ({ guestId: g.id, toAddress: g.email!, providerId: null })))
      .filter((l) => l.guestId && perId.has(l.guestId))
      .map((l) => {
        const g = perId.get(l.guestId!)!;
        return { guestId: g.id, email: l.toAddress, firstName: g.firstName, lastName: g.lastName, aperta: log.length > 0 ? Boolean(l.providerId) : undefined };
      });

    /* Chi ha prenotato dal link deve aver cliccato: si scelgono prima le
       prenotazioni (future, di clienti fra i destinatari) e quei clienti
       cliccano di sicuro. Prima il click, poi la prenotazione. */
    const idDestinatari = destinatari.map((d) => d.guestId);
    const giaAttribuite = await db.booking.findMany({
      where: { venueId, campaignId: principale.id, deletedAt: null },
      select: { id: true, guestId: true },
    });
    const daAttribuire =
      giaAttribuite.filter((b) => b.guestId && idDestinatari.includes(b.guestId)).length >= 4
        ? []
        : await db.booking.findMany({
            where: {
              venueId,
              deletedAt: null,
              campaignId: null,
              guestId: { in: idDestinatari },
              startsAt: { gte: inviata },
              status: { notIn: ["CANCELLED", "NO_SHOW"] },
            },
            orderBy: { startsAt: "asc" },
            take: 6,
            select: { id: true, guestId: true },
          });
    if (daAttribuire.length > 0) {
      // Le vecchie attribuzioni a clienti qualunque si tolgono: non avevano un click.
      await db.booking.updateMany({ where: { venueId, campaignId: principale.id }, data: { campaignId: null } });
    }
    const prenotanti = new Set(
      (daAttribuire.length > 0 ? daAttribuire : giaAttribuite).map((b) => b.guestId).filter((x): x is string => Boolean(x)),
    );

    const clickDi = await riempi(db, venueId, principale, inviata, destinatari, {
      apertura: 0.55, click: 0.3, rimbalzo: 0.03, disiscrizione: 0.06, link: linkLocale,
    }, prenotanti);

    for (const b of daAttribuire) {
      const click = clickDi.get(b.guestId!);
      await db.booking.update({
        where: { id: b.id },
        data: { campaignId: principale.id, createdAt: new Date((click ?? inviata).getTime() + 4 * MINUTO) },
      });
    }
    if (!principale.body || !principale.body.includes("<")) {
      await db.campaign.update({
        where: { id: principale.id },
        data: {
          body: CORPO_DORMIENTI,
          previewText: "Un calice di benvenuto ti aspetta",
          segment: { inactiveDays: 90 },
        },
      });
    }
    console.log(`   Campagna «${principale.name}»: report completo, ${daAttribuire.length} prenotazioni dal click.`);
  }

  /* Ogni prenotazione attribuita nasce pochi minuti dopo il click di quel
     cliente: così cade nella finestra di attribuzione anche quando il seed
     ha spostato le date. Una prenotazione di chi non ha cliccato non è
     merito della campagna, e si stacca. */
  if (principale) {
    const click = new Map(
      (
        await db.campaignRecipient.findMany({
          where: { campaignId: principale.id, clickedAt: { not: null }, guestId: { not: null } },
          select: { guestId: true, clickedAt: true },
        })
      ).map((x) => [x.guestId!, x.clickedAt!]),
    );
    const attribuite = await db.booking.findMany({
      where: { venueId, campaignId: principale.id },
      select: { id: true, guestId: true, createdAt: true },
    });
    for (const b of attribuite) {
      const quando = b.guestId ? click.get(b.guestId) : undefined;
      await db.booking.update({
        where: { id: b.id },
        data: quando ? { createdAt: new Date(quando.getTime() + 4 * MINUTO) } : { campaignId: null },
      });
    }
  }

  /* ---------------------------------------------- due campagne passate */
  const passate = [
    {
      name: "Menu d'autunno",
      subject: "È arrivato il menu d'autunno",
      giorni: 40,
      profilo: { apertura: 0.46, click: 0.22, rimbalzo: 0.02, disiscrizione: 0.03 },
    },
    {
      name: "Serata degustazione vini",
      subject: "Giovedì: cinque calici, cinque piatti",
      giorni: 75,
      profilo: { apertura: 0.39, click: 0.14, rimbalzo: 0.04, disiscrizione: 0.04 },
    },
  ];
  for (const p of passate) {
    if (await db.campaign.findFirst({ where: { venueId, name: p.name } })) continue;
    const inviata = new Date(Date.now() - p.giorni * GIORNO);
    inviata.setHours(18, 0, 0, 0);
    const c = await db.campaign.create({
      data: {
        venueId,
        name: p.name,
        channel: "EMAIL",
        subject: p.subject,
        body: `<p>${p.subject}.</p><p><a href="#">Prenota il tuo tavolo</a></p>`,
        status: "SENT",
        segment: {},
        createdAt: new Date(inviata.getTime() - 2 * GIORNO),
      },
    });
    await riempi(
      db,
      venueId,
      c,
      inviata,
      ospiti.map((g) => ({ guestId: g.id, email: g.email!, firstName: g.firstName, lastName: g.lastName })),
      { ...p.profilo, link: linkLocale },
    );
    console.log(`   Campagna passata «${p.name}» creata.`);
  }

  // In fondo: le campagne passate qui sopra nascono in questa stessa chiamata.
  await emailDelleCampagne(db, venueId);
}
