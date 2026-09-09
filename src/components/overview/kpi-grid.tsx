import { Wallet, UserX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

type Kpi = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Assente quando non c'è un confronto possibile (dato mancante). */
  delta?: number;
  /** Cosa manca, quando il valore non c'è: meglio dirlo che lasciare un trattino muto. */
  hint?: string;
  /** How the delta should read: for most KPIs higher is better, for no-show lower is better. */
  higherIsBetter: boolean;
  /** Render the delta as a raw count ("↓ 1") instead of a percentage. */
  isCount?: boolean;
  /** Which material surface this tile sits on — alternated so the section isn't a wall of green. */
  surface: "green" | "brown" | "cream";
};

const SURFACE = {
  green: {
    container: "border border-border bg-background",
    iconLabel: "text-muted-foreground",
    value: "text-foreground",
    positive: "text-sage",
    negative: "text-destructive-soft",
  },
  brown: {
    container: "finish-brown-dark border border-[#633a26]",
    iconLabel: "text-cream/65",
    value: "text-cream",
    positive: "text-sage",
    negative: "text-rose-400",
  },
  cream: {
    container: "bg-cream border border-cream",
    iconLabel: "text-clay-ink-soft",
    value: "text-clay-ink",
    positive: "text-sage-deep",
    negative: "text-rose-700",
  },
} as const;

export function KpiGrid({
  totalCovers,
  estimatedRevenueCents,
  incasso,
  currency,
  expectedNoShow,
  comparisons,
}: {
  totalCovers: number;
  estimatedRevenueCents: number | null;
  /** L'incasso vero: `conti: 0` vuol dire «nessun conto chiuso», non «zero euro». */
  incasso?: {
    totalCents: number;
    conti: number;
    /** Già pagato con gift card: denaro entrato prima di oggi. */
    giftCardCents?: number;
    /** Scontato coi punti: incasso a cui il locale ha rinunciato. */
    scontiPuntiCents?: number;
  } | null;
  currency: string;
  expectedNoShow: number;
  /*
    `occupancyPct` arrivava fin qui e non veniva mai reso: un dato passato per
    abitudine. La percentuale di pieno si legge nel briefing, una volta.
  */
  comparisons: { covers: number; revenue: number | null; occupancy: number | null; noShow: number };
}) {
  const kpis: Kpi[] = [

    {
      /**
       * Prima questa cifra era la media di `Guest.totalSpend` — un campo che
       * nessuno aggiornava, riempito dal seed — moltiplicata per i coperti:
       * un numero inventato in cima alla Panoramica.
       *
       * Ora la stima esiste solo se il locale ha dichiarato la spesa media per
       * coperto. Altrimenti la casella dice cosa manca, invece di riempirsi da
       * sola.
       */
      /**
       * Appena qualcuno chiude un conto, questa casella smette di stimare.
       * Finché nessuno lo fa resta la stima, e si chiama stima: le due cose
       * non si mescolano, perché sono risposte a due domande diverse.
       */
      label: incasso && incasso.conti > 0 ? "Incasso" : "Incassi stimati",
      value:
        incasso && incasso.conti > 0
          ? formatCurrency(incasso.totalCents, currency)
          : estimatedRevenueCents != null
            ? formatCurrency(estimatedRevenueCents, currency)
            : "—",
      hint:
        incasso && incasso.conti > 0
          ? [
              `${incasso.conti} ${incasso.conti === 1 ? "conto chiuso" : "conti chiusi"}`,
              // Se una parte del conto era già pagata (gift card) o non è mai
              // stata pagata (punti), il totale servito e quello entrato in
              // cassa oggi non coincidono, e va detto qui: è la differenza fra
              // sapere come va il locale e non tornare con la cassa.
              incasso.giftCardCents ? `${formatCurrency(incasso.giftCardCents, currency)} da gift card` : null,
              incasso.scontiPuntiCents ? `${formatCurrency(incasso.scontiPuntiCents, currency)} in punti` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : estimatedRevenueCents != null
            ? undefined
            : "imposta lo scontrino medio in Impostazioni",
      icon: Wallet,
      /**
       * Nessun confronto quando il numero è l'incasso vero.
       *
       * Il confronto con ieri è calcolato sulle **stime**: mettere 38 € veri
       * contro una stima di ieri e scriverci «▲ 20%» è un paragone fra due
       * cose diverse presentato come una crescita. Tornerà quando ci saranno
       * conti chiusi anche nei giorni passati.
       */
      delta: incasso && incasso.conti > 0 ? undefined : (comparisons.revenue ?? undefined),
      higherIsBetter: true,
      surface: "brown",
    },
    {
      label: "No show",
      value: String(expectedNoShow),
      icon: UserX,
      delta: comparisons.noShow,
      higherIsBetter: false,
      isCount: true,
      surface: "brown",
    },
  ];

  return (
    <Card className="card-notch">
      <CardHeader>
        {/* Coperti e occupazione stavano qui **e** nei riquadri in cima alla
            pagina: gli stessi due numeri, due componenti, due linguaggi
            visivi. Qui restano i due che in cima non ci sono. */}
        <CardTitle>Soldi e assenze</CardTitle>
      </CardHeader>
      {/* Due caselle affiancate solo dove c'è spazio: nella colonna del
          tablet (310 px) «2.250,00 €» andava a capo sull'euro. */}
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {kpis.map(({ label, value, icon: Icon, delta, hint, higherIsBetter, isCount, surface }) => {
          const positive = delta != null && (higherIsBetter ? delta >= 0 : delta <= 0);
          const magnitude = delta != null ? Math.abs(delta) : 0;
          const s = SURFACE[surface];
          return (
            <div key={label} className={cn("card-notch p-3", s.container)}>
              <div className={cn("flex items-center gap-2", s.iconLabel)}>
                <Icon className="h-3.5 w-3.5" />
                <p className="text-xs uppercase tracking-wider">{label}</p>
              </div>
              <p className={cn("mt-1.5 font-mono text-xl font-semibold", s.value)}>{value}</p>
              {hint && <p className={cn("mt-1 text-[11px] leading-tight", s.iconLabel)}>{hint}</p>}
              {delta != null && delta !== 0 && (
                <p className={cn("mt-1 font-mono text-xs font-medium", positive ? s.positive : s.negative)}>
                  {delta > 0 ? "▲" : "▼"} {magnitude}
                  {isCount ? "" : "%"} vs ieri
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
