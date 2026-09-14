import { Sparkles } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LoyaltyTier } from "@prisma/client";

/**
 * La tessera, disegnata come una tessera.
 *
 * ## Perché non è un riquadro con dentro dei campi
 *
 * Tutto quello che c'è qui — punti, livello, data d'iscrizione — stava già
 * sulla scheda, sparso fra il pannello fedeltà e l'intestazione. Rimetterlo
 * dentro un altro riquadro con l'etichettina sopra ogni valore non avrebbe
 * aggiunto niente: sarebbe stata la dodicesima scatola di una pagina di
 * scatole.
 *
 * Una tessera invece è **un oggetto che il cliente conosce**. Chi la guarda
 * dallo schermo la riconosce come la cosa che ha in tasca, e per questo la
 * proporzione è quella vera (85,6 × 54 mm, cioè 1,586 : 1 — la ISO 7810 delle
 * carte di credito) e non un rettangolo qualsiasi: è la proporzione che fa
 * dire «tessera» prima di leggere una parola.
 *
 * ## I materiali
 *
 * Il livello non è un colore fra tanti: è **di che cosa è fatta la carta**.
 * Ambassador è la carta nera, VIP la madreperla, gli altri il verde del
 * locale con il filo d'oro. È la stessa distinzione che fanno già le pillole
 * `pearl` e `carbon` in `ui/badge` — dove il commento dice che quei due toni
 * stanno fuori tavolozza per scelta, perché dicono di che materiale è fatta
 * la tessera, non che cosa sta accadendo — e qui vale a piena pagina.
 *
 * Niente alone, niente bagliore: la superficie è una sfumatura e un filo di
 * bordo, come tutto il resto del materiale del prodotto.
 */

type Materiale = {
  /** La superficie della carta. */
  fondo: string;
  /** Il testo che ci sta sopra. */
  inchiostro: string;
  /** Etichette e righe secondarie: lo stesso inchiostro, più tenue. */
  tenue: string;
  bordo: string;
  nome: string;
};

const MATERIALE: Record<LoyaltyTier, Materiale> = {
  /*
    Il verde del locale con il filo d'oro. È la carta di tutti: chi non ha un
    livello assegnato ha comunque una tessera, e mostrarla spenta o grigia
    direbbe «non sei niente» a un cliente che è semplicemente nuovo.
  */
  NEW: {
    fondo: "bg-[linear-gradient(135deg,#1C4A3A_0%,#102B22_55%,#0B1511_100%)]",
    inchiostro: "text-cream",
    tenue: "text-cream/60",
    bordo: "border-gilt/30",
    nome: "Tessera",
  },
  REGULAR: {
    fondo: "bg-[linear-gradient(135deg,#1C4A3A_0%,#102B22_55%,#0B1511_100%)]",
    inchiostro: "text-cream",
    tenue: "text-cream/60",
    bordo: "border-gilt/30",
    nome: "Tessera",
  },
  /** Madreperla: chiara, quindi l'inchiostro diventa scuro. */
  VIP: {
    fondo: "bg-[linear-gradient(135deg,#FFFFFF_0%,#EDE7DA_45%,#D9CDB6_100%)]",
    inchiostro: "text-clay-ink",
    tenue: "text-clay-ink/60",
    bordo: "border-white/70",
    nome: "Tessera VIP",
  },
  /** Carta nera. */
  AMBASSADOR: {
    fondo: "bg-[linear-gradient(135deg,#2A2B31_0%,#15161A_55%,#0C0D10_100%)]",
    inchiostro: "text-sand-50",
    tenue: "text-sand-50/60",
    bordo: "border-gilt/40",
    nome: "Tessera Ambassador",
  },
};

export function FidelityCard({
  nome,
  venue,
  tier,
  codice,
  qrDataUrl,
  punti,
  valoreCents,
  iscrittoIl,
  currency,
  premio,
}: {
  nome: string;
  venue: string;
  tier: LoyaltyTier;
  /** Il numero di tessera, già formattato. `null` se non è stato emesso. */
  codice: string | null;
  /** L'immagine del QR, generata dal codice sul server. */
  qrDataUrl: string | null;
  punti: number;
  /** Quanto valgono quei punti, se il locale ha dichiarato le sue regole. */
  valoreCents: number | null;
  iscrittoIl: Date;
  currency: string;
  /** Quanto manca al traguardo, quando il locale ne ha messo uno. */
  premio: { mancano: number; cosa: string } | null;
}) {
  const m = MATERIALE[tier];

  return (
    /*
      Un tetto alla larghezza, ed è la ragione per cui la proporzione fissa
      funziona.

      Nella colonna da 22 rem la carta la riempie e sta bene. Su tablet, dove
      la pagina va a colonna sola, la stessa carta prendeva 786 px di
      larghezza e — per via del rapporto 1,586 — 496 px di altezza: mezza
      schermata occupata da una tessera. Un oggetto che imita una cosa fisica
      smette di sembrarla appena diventa più grande della cosa; 24 rem è la
      misura oltre la quale non lo è più.
    */
    <div className="max-w-[24rem] space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl border ${m.bordo} ${m.fondo} ${m.inchiostro} shadow-[0_10px_24px_rgba(0,0,0,0.35)]`}
        /* La proporzione delle carte vere. `aspect-ratio` e non un'altezza
           fissa: sul telefono la carta si rimpicciolisce restando una carta,
           mentre un'altezza fissa l'avrebbe fatta diventare un quadrato. */
        style={{ aspectRatio: "1.586 / 1" }}
      >
        {/* Il riflesso: una singola luce in alto a sinistra, la stessa
            direzione di `.surface` e `.vetro`. Su una superficie che vuole
            sembrare stampata è ciò che la distingue da un rettangolo pieno. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_12%_0%,rgba(255,255,255,0.16),transparent_58%)]"
        />

        <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[0.65rem] uppercase tracking-[0.18em] ${m.tenue}`}>{m.nome}</p>
              <p className="truncate text-sm font-medium">{venue}</p>
            </div>
            {/* Il QR sta sulla carta, non accanto: è la carta che si
                inquadra. Fondo crema pieno anche sulle carte chiare — un
                lettore misura il contrasto fra i moduli e il loro sfondo, e
                appoggiarlo direttamente sulla madreperla lo abbasserebbe. */}
            {qrDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={qrDataUrl}
                alt={codice ? `Codice QR della tessera ${codice}` : "Codice QR della tessera"}
                className="h-16 w-16 shrink-0 rounded-md bg-cream p-1 sm:h-20 sm:w-20"
                width={80}
                height={80}
              />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-lg font-medium leading-tight sm:text-xl">{nome}</p>
            {/*
              Il numero in monospaziato e spaziato: è un codice che si detta al
              telefono, e in proporzionale i gruppi di quattro non si contano a
              colpo d'occhio. Quando non è ancora stato emesso si dice quello,
              invece di lasciare una riga vuota che sembra un errore.
            */}
            <p className={`mt-0.5 font-mono text-sm tracking-[0.14em] ${m.tenue}`}>
              {codice ?? "numero non emesso"}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className={`text-[0.65rem] uppercase tracking-[0.14em] ${m.tenue}`}>Punti</p>
              <p className="text-display text-2xl leading-none">{punti}</p>
              {valoreCents != null && valoreCents > 0 && (
                <p className={`mt-1 text-xs ${m.tenue}`}>
                  valgono {formatCurrency(valoreCents, currency)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`text-[0.65rem] uppercase tracking-[0.14em] ${m.tenue}`}>Iscritto dal</p>
              <p className="text-sm tabular-nums">{formatDate(iscrittoIl)}</p>
            </div>
          </div>
        </div>
      </div>

      {/*
        «Ti mancano 40 punti alla cena omaggio» è la frase che riporta le
        persone; «hai 160 punti» non lo è — è la stessa nota che sta in
        `server/loyalty.ts`, e sta sotto la carta perché è una cosa da **dire
        al cliente**, non un dato della tessera.
      */}
      {premio && premio.mancano > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <span>
            Mancano <span className="font-medium">{premio.mancano} punti</span> a {premio.cosa}.
          </span>
        </p>
      )}
    </div>
  );
}
