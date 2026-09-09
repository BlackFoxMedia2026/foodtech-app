import Link from "next/link";
import { ArrowRight, ChevronRight, Gift, Megaphone, QrCode as QrCodeIcon, Repeat, Target, Ticket, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listAutomations } from "@/server/automations/engine";
import { debitoGiftCards } from "@/server/gift-cards";
import { getWifiStats } from "@/server/wifi";
import { intentiDisponibili } from "@/server/marketing/intenti";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/campaigns",
    icon: Megaphone,
    eyebrow: "Campagne email",
    title: "Campagne email",
    description: "Crea campagne email, scegli segmenti di ospiti e programma comunicazioni.",
  },
  {
    href: "/marketing/automations",
    icon: Repeat,
    eyebrow: "Automazioni",
    title: "Automazioni",
    description:
      "Tre messaggi che partono da soli: auguri di compleanno, chi non torna da un po', invito a tornare dopo la prima volta.",
  },
  {
    href: "/marketing/coupons",
    icon: Ticket,
    eyebrow: "Coupon",
    title: "Coupon",
    description:
      "Sconti e omaggi con un codice: si creano qui e si segnano come usati al tavolo, dalla scheda della prenotazione.",
  },
  {
    href: "/marketing/gift-cards",
    icon: Gift,
    eyebrow: "Gift card",
    title: "Gift card",
    description:
      "Cene pagate in anticipo: si vendono al bancone e si scalano dal conto al tavolo, anche in più volte.",
  },
  {
    href: "/marketing/wifi",
    icon: Wifi,
    eyebrow: "Wi-Fi",
    title: "Wi-Fi",
    description:
      "Chi si collega lascia un contatto e riceve la password. Con lo sconto per farlo tornare, se lo vuoi.",
  },
  {
    href: "/marketing/qr-codes",
    icon: QrCodeIcon,
    eyebrow: "QR Code",
    title: "QR Code",
    description: "Genera QR code collegati a URL specifici per menu, prenotazioni, eventi o campagne.",
  },
];

export default async function MarketingPage() {
  const ctx = await getActiveVenue();

  /**
   * Cinque card con una descrizione e nessun numero: sembrava un indice, non
   * un cruscotto. Tutti questi dati esistono già — nessuna colonna nuova,
   * nessuna tabella nuova: si leggono e si scrivono sulla card.
   */
  const [campagne, automazioni, coupon, gift, wifi, intenti] = await Promise.all([
    db.campaign.count({ where: { venueId: ctx.venueId, status: { in: ["SENT", "SCHEDULED", "SENDING"] } } }),
    listAutomations(ctx.venueId),
    db.coupon.count({ where: { venueId: ctx.venueId, status: "ACTIVE" } }),
    debitoGiftCards(ctx.venueId),
    getWifiStats(ctx.venueId),
    intentiDisponibili(ctx.venueId),
  ]);

  const attive = automazioni.filter((a) => a.active).length;

  const NUMERI: Record<string, string> = {
    "/campaigns": campagne === 0 ? "nessuna campagna inviata" : `${campagne} inviate o in programma`,
    "/marketing/automations":
      attive === 0 ? "tutte spente" : `${attive} attive su ${automazioni.length}`,
    "/marketing/coupons":
      coupon === 0 ? "nessun coupon attivo" : `${coupon} ${coupon === 1 ? "attivo" : "attivi"}`,
    "/marketing/gift-cards":
      gift.carte === 0
        ? "nessuna gift card"
        : `${formatCurrency(gift.residuoCents, ctx.venue.currency)} ancora da spendere`,
    "/marketing/wifi":
      wifi.contatti === 0
        ? "nessun contatto raccolto"
        : `${wifi.contatti} ${wifi.contatti === 1 ? "contatto" : "contatti"} · ${
            wifi.conPrenotazione
          } poi ${wifi.conPrenotazione === 1 ? "venuto" : "venuti"}`,
  };

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa">
        <p className="t-etichetta">Marketing</p>
        <h1 className="text-display text-3xl">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Cosa vuoi ottenere. Gli strumenti stanno sotto, con i loro numeri.
        </p>
      </header>

      {/*
        La prima domanda è «cosa vuoi ottenere», non «quale strumento apro»
        (§38).

        Questa pagina era un indice di funzioni: campagne, automazioni,
        coupon, gift card, Wi-Fi, QR. Chi ci arriva sapendo già cosa cliccare
        non ha bisogno di un indice; chi non lo sa non trova il suo problema
        in un elenco di strumenti, perché il suo problema è «il martedì è
        vuoto» e non «coupon».

        Ogni intento porta **il numero che lo giustifica** e la base su cui è
        misurato, e compare solo se quel numero si può calcolare: la regola sta
        in `server/marketing/intenti.ts`. Su un locale appena aperto qui
        rimane un solo intento — scrivere a mano — che è la verità.
      */}
      <section className="fissa" aria-label="Cosa vuoi ottenere">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {intenti.map((i) => (
            <Link
              key={i.chiave}
              href={i.href}
              className="riquadro group flex flex-col gap-1 p-3 transition-colors hover:border-gilt-dark/50"
            >
              <span className="flex items-center gap-1.5 text-accent">
                <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="t-titolo-scheda">{i.titolo}</span>
              </span>
              <span className="t-nota">{i.perche}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium">
                {i.azione}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <h2 className="fissa t-etichetta">Gli strumenti</h2>

      {/* Cinque card: su schermo largo ci stanno, sul telefono scorrono
          dentro questa regione invece di allungare la pagina. */}
      <div className="fill-scroll grid gap-3 pr-0.5 md:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, eyebrow, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-gilt-dark/50">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <div className="flex items-center gap-2 text-accent">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">{eyebrow}</span>
                  </div>
                  <CardTitle className="mt-1">{title}</CardTitle>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2">
                <CardDescription>{description}</CardDescription>
                {NUMERI[href] && (
                  <p className="text-sm font-medium text-accent-strong">{NUMERI[href]}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
