import Link from "next/link";
import { ChevronRight, Gift, Megaphone, QrCode as QrCodeIcon, Repeat, Ticket, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listAutomations } from "@/server/automations/engine";
import { debitoGiftCards } from "@/server/gift-cards";
import { getWifiStats } from "@/server/wifi";
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
  const [campagne, automazioni, coupon, gift, wifi] = await Promise.all([
    db.campaign.count({ where: { venueId: ctx.venueId, status: { in: ["SENT", "SCHEDULED", "SENDING"] } } }),
    listAutomations(ctx.venueId),
    db.coupon.count({ where: { venueId: ctx.venueId, status: "ACTIVE" } }),
    debitoGiftCards(ctx.venueId),
    getWifiStats(ctx.venueId),
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
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing</p>
        <h1 className="text-display text-3xl">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci campagne, strumenti promozionali e contenuti per raggiungere i tuoi ospiti.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
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
