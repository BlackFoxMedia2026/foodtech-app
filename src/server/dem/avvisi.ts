import type { NotificationKind } from "@prisma/client";
import { db } from "@/lib/db";
import { createNotification } from "@/server/notifications";
import { sendDemOperationalEmail } from "@/server/emails";
import { can } from "@/lib/abilities";
import { logAttenzione } from "@/lib/observability";

/**
 * Quando il modulo DEM deve farsi sentire, e come.
 *
 * Due canali, e servono a due cose diverse:
 *
 * - **la campanella** è per chi sta usando il prodotto adesso: la vede al
 *   primo accesso, e basta per «hai usato l'80%»;
 * - **l'email** è per i fatti che non possono aspettare il prossimo accesso —
 *   un pagamento non riuscito, un dominio che smette di funzionare, gli invii
 *   sospesi. Sono le cose che, scoperte tre giorni dopo, hanno già fatto danno.
 *
 * Non tutto merita tutti e due, e questo file è il posto dove quella decisione
 * è scritta una volta invece che sparsa nei punti di chiamata.
 */

/** Chi, dentro un locale, riceve le email amministrative del modulo DEM. */
async function destinatariAmministrativi(venueId: string) {
  const membri = await db.venueMembership.findMany({
    where: { venueId, disabledAt: null },
    include: { user: { select: { email: true, name: true } } },
  });
  // Lo stesso permesso che serve per cambiare piano: chi non può decidere di
  // spendere non ha motivo di ricevere un avviso su un pagamento.
  return membri.filter((m) => can(m.role, "manage_venue")).map((m) => m.user);
}

export type AvvisoDem = {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  /** Vero quando il fatto non può aspettare il prossimo accesso. */
  perEmail?: boolean;
};

/**
 * Manda un avviso, senza poter far fallire quello che l'ha generato.
 *
 * Un pagamento riuscito non deve tornare indietro perché il server di posta
 * era occupato: gli avvisi si registrano e si prova a mandarli, e se non si
 * riesce resta scritto nei log.
 */
export async function avvisa(venueId: string, avviso: AvvisoDem): Promise<void> {
  try {
    await createNotification(venueId, {
      kind: avviso.kind,
      title: avviso.title,
      body: avviso.body,
      link: avviso.link ?? "/settings/marketing/piano",
    });

    if (!avviso.perEmail) return;

    const venue = await db.venue.findUnique({ where: { id: venueId }, select: { name: true } });
    const destinatari = await destinatariAmministrativi(venueId);
    for (const d of destinatari) {
      if (!d.email) continue;
      await sendDemOperationalEmail({
        to: d.email,
        nome: d.name ?? "",
        venueName: venue?.name ?? "il tuo locale",
        titolo: avviso.title,
        testo: avviso.body,
      });
    }
  } catch (err) {
    logAttenzione("dem.avviso.non_inviato", { venueId, kind: avviso.kind, errore: String(err) });
  }
}

export function avvisoPagamentoFallito(): AvvisoDem {
  return {
    kind: "DEM_PAYMENT_FAILED",
    title: "Non siamo riusciti a rinnovare il tuo piano DEM",
    body:
      "Il pagamento non è andato a buon fine. Le campagne restano dove sono e puoi continuare a " +
      "inviare fino alla fine del periodo già pagato: aggiorna il metodo di pagamento per non fermarti.",
    perEmail: true,
  };
}

export function avvisoInviiSospesi(motivo: string): AvvisoDem {
  return {
    kind: "DEM_SENDING_PAUSED",
    title: "Invii temporaneamente sospesi",
    body: motivo,
    perEmail: true,
  };
}

export function avvisoCampagnaInviata(nome: string, campaignId: string): AvvisoDem {
  return {
    kind: "DEM_CAMPAIGN_SENT",
    title: `La campagna ${nome} è stata inviata`,
    body: "Puoi vedere i risultati man mano che arrivano.",
    link: `/campaigns/${campaignId}`,
  };
}
