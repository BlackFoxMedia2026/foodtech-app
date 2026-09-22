"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, DoorOpen, HandPlatter, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { chiedi, ErroreStaff } from "@/lib/staff-fetch";
import { useAvvisi } from "@/components/ui/avvisi";
import type { PermessoStaff } from "@/lib/permessi-staff";
import type { TavoloStaff } from "@/server/staff-app/sala";
import type { OspiteDaAccomodare } from "@/server/staff-app/da-accomodare";
import { CALORE_RICHIAMO, ICONA_RICHIAMO, daQuanto, type Calore } from "./segni-richiamo";

/**
 * **Da gestire ora** — la sezione che questa dashboard esisteva per non avere.
 *
 * ## Il difetto, detto per intero
 *
 * Prima della riscrittura la Home rispondeva alla domanda «com'è messa la
 * sala» con quattro sezioni affiancate: da fare, i miei tavoli, i tavoli
 * disponibili, e in Sala gli accomodati. Una famiglia appena fatta sedere a
 * T9 finiva **in nessuna di queste**: non era un mio tavolo (nessuno l'aveva
 * assegnato), non era libero, e non aveva un piatto pronto né un conto
 * chiesto, quindi non era neanche «da fare». Compariva soltanto se per caso
 * aveva una nota — nello screenshot da cui è partito questo lavoro era
 * «T9 · Prima volta qui», cioè il tavolo si vedeva per un motivo che non
 * c'entrava niente con il fatto che quattro persone stessero aspettando il
 * menu.
 *
 * Questa sezione è **una coda sola**, ordinata per urgenza vera, che tiene
 * insieme due cose che prima stavano in due riquadri diversi:
 *
 * 1. **chi aspetta in piedi** — una persona che guarda la sala è la cosa più
 *    urgente che ci sia, e sta in cima;
 * 2. **i tavoli che chiedono qualcosa** — piatti al passe, conti, tavolate
 *    senza comanda, tavoli da controllare o da riassettare.
 *
 * L'ordine non è scritto qui: arriva già fatto da `daGestireOra`, che è la
 * stessa funzione che ordina la Sala. Due idee di priorità in due schermate
 * sarebbero due prodotti.
 *
 * ## Perché le card sono grandi e sono poche
 *
 * Una card qui è alta il doppio di un tasto della griglia, e va bene: è
 * l'unica cosa della schermata che chiede di *fare* qualcosa, e deve vincere
 * su tutto il resto senza che nessuno legga. Il prezzo è che non possono
 * essere dodici — si fermano a quattro, con una riga che dice quante ne
 * restano e dove trovarle. Un cameriere che ha quattro cose da fare adesso
 * non ha bisogno di sapere che ce n'è una quinta: ha bisogno di cominciare.
 */

/* Il tetto di quante card entrano in Home sta in `server/staff-app/sala.ts`,
   accanto alla funzione che taglia la coda: il perché — e il difetto che ha
   prodotto tenendolo qui — è scritto lì. */

/** Quanti nomi in attesa si scrivono per esteso prima di contarli. */
const MAX_NOMI_IN_ATTESA = 2;

const VESTE: Record<Calore, string> = {
  allarme: "border-destructive/50 bg-destructive/10",
  ora: "border-accent/55 bg-accent/10",
  poi: "border-border bg-card",
};

const BADGE: Record<Calore, string> = {
  allarme: "bg-destructive/20 text-destructive-soft",
  ora: "bg-accent/25 text-accent-strong",
  poi: "bg-card-sunken text-tertiary-foreground",
};

const SEGNO: Record<Calore, string> = {
  allarme: "text-destructive-soft",
  ora: "text-accent-strong",
  poi: "text-tertiary-foreground",
};

export function DaGestireOra({
  tavoli,
  ospiti,
  permessi,
  restanti,
}: {
  tavoli: TavoloStaff[];
  ospiti: OspiteDaAccomodare[];
  permessi: readonly PermessoStaff[];
  /** Quante cose sono rimaste fuori dal taglio. Zero = nessuna riga in fondo. */
  restanti: number;
}) {
  if (tavoli.length === 0 && ospiti.length === 0) return null;

  const quante = tavoli.length + (ospiti.length > 0 ? 1 : 0) + restanti;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 pb-2.5">
        <h2 className="sa-sezione">Da gestire ora</h2>
        <span className="sa-nota shrink-0 tabular-nums">{quante}</span>
      </div>

      <ul className="space-y-2.5">
        {ospiti.length > 0 && (
          <li>
            <CardInAttesa ospiti={ospiti} />
          </li>
        )}
        {tavoli.map((t) => (
          <li key={t.tableId}>
            <CardTavoloDaGestire tavolo={t} permessi={permessi} />
          </li>
        ))}
      </ul>

      {restanti > 0 && (
        <Link
          href="/staff-app/sala"
          className="sa-tocco mt-2 flex min-h-[44px] items-center justify-center gap-1 text-[0.9375rem] font-medium text-accent-strong"
        >
          Altri {restanti} in sala
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chi aspetta in piedi                                                      */
/* -------------------------------------------------------------------------- */

/**
 * **Gli ospiti arrivati e non ancora seduti**, come prima card della coda.
 *
 * Prima era una sezione a sé, con il suo titolo e il suo riquadro. Adesso è
 * una riga della stessa coda, e il guadagno non è di pixel: è che la
 * dashboard ha **un solo posto** dove si guarda per sapere cosa fare. Due
 * elenchi di cose urgenti uno sopra l'altro obbligano a leggerli tutti e due
 * per scegliere, che è il contrario di una coda.
 *
 * Sta in cima a tutto — sopra i piatti al passe — perché una persona in piedi
 * che guarda la sala è l'unica cosa in questa lista che *si accorge* di
 * aspettare.
 */
function CardInAttesa({ ospiti }: { ospiti: OspiteDaAccomodare[] }) {
  const nomi = ospiti.slice(0, MAX_NOMI_IN_ATTESA).map((o) => o.nome);
  const altri = ospiti.length - nomi.length;
  const attesa = Math.max(...ospiti.map((o) => o.attesaMin));

  return (
    <div className={cn("rounded-[18px] border p-3.5", VESTE.ora)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/25">
          <DoorOpen className="h-[1.125rem] w-[1.125rem] text-accent-strong" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="sa-scheda">
            {ospiti.length === 1 ? "1 ospite in attesa" : `${ospiti.length} ospiti in attesa`}
          </p>
          <p className="sa-nota mt-1 truncate">
            {nomi.join(", ")}
            {altri > 0 && ` e altri ${altri}`}
          </p>
        </div>
        {daQuanto(attesa) && (
          <span className="sa-nota shrink-0 tabular-nums text-accent-strong">{daQuanto(attesa)}</span>
        )}
      </div>

      <Link
        href="/staff-app/sala"
        className="sa-tocco mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-cream text-[0.9375rem] font-medium text-clay-ink"
      >
        Fai accomodare
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Un tavolo da gestire                                                      */
/* -------------------------------------------------------------------------- */

/**
 * **La card operativa del tavolo.**
 *
 * Quattro righe e due tasti, nell'ordine in cui un cameriere si fa le
 * domande: *quale tavolo* (la targa), *chi c'è* (il nome), *in che
 * situazione* (il badge e il cronometro), *cosa faccio* (i tasti).
 *
 * ## Il corpo è un collegamento, i tasti sono i tasti
 *
 * Toccare la card apre il tavolo: è il gesto pigro, quello che si fa quando
 * si vuole guardare. I tasti sotto sono i due gesti precisi — prendere il
 * tavolo in carico, battere la comanda — e stanno fuori dal collegamento
 * perché premerli non deve mai voler dire «aprire e poi cercare».
 *
 * Così restano **due tasti al massimo** su una card larga 343 px, che è il
 * numero sotto il quale si preme senza guardare.
 *
 * ## Il cronometro
 *
 * `da 3 min` non è un dettaglio da riempimento: è quello che distingue due
 * tavoli con lo stesso badge. «Appena seduti da 2 minuti» è una famiglia che
 * si sta togliendo il cappotto; «appena seduti da 14» è una famiglia che si
 * sta guardando intorno. La stessa etichetta, due mestieri diversi — e
 * infatti a quattordici minuti l'etichetta cambia da sola in «Comanda da
 * prendere» (vedi `MINUTI_PRIMA_DELLA_COMANDA`).
 */
function CardTavoloDaGestire({
  tavolo,
  permessi,
}: {
  tavolo: TavoloStaff;
  permessi: readonly PermessoStaff[];
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [inCorso, setInCorso] = useState(false);

  const richiamo = tavolo.richiamo;
  if (!richiamo) return null;

  const calore = CALORE_RICHIAMO[richiamo.tipo];
  const Icona = ICONA_RICHIAMO[richiamo.tipo];
  const href = `/staff-app/tavolo/${tavolo.tableId}`;
  const quanto = daQuanto(richiamo.daMinuti);

  const puoOrdinare = permessi.includes("create_orders");
  const puoPrendere = permessi.includes("manage_tables") && tavolo.scoperto;
  /* La comanda si propone dove serve davvero: un tavolo senza niente sopra.
     Su un tavolo che aspetta il conto «Prendi comanda» è un tasto grande che
     nessuno premerà mai, e ogni tasto così insegna a non leggere i tasti. */
  const comandaPrima = richiamo.tipo === "SENZA_COMANDA" && puoOrdinare && !!tavolo.bookingId;

  async function prendiInCarico() {
    if (inCorso) return;
    setInCorso(true);
    try {
      await chiedi(`/api/staff-app/tavolo/${tavolo.tableId}/in-carico`, { metodo: "POST" });
      avvisi.mostra(`Tavolo ${tavolo.label} è tuo`);
      router.refresh();
    } catch (e) {
      avvisi.problema(
        e instanceof ErroreStaff ? e.message : "Non è stato possibile prendere il tavolo.",
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className={cn("rounded-[18px] border p-3.5", VESTE[calore])}>
      <Link href={href} className="sa-tocco block">
        <div className="flex items-start justify-between gap-3">
          {/* La targa del tavolo: la prima cosa che si cerca, e l'unica che
              si legge davvero da lontano. */}
          <span className="sa-scheda shrink-0 tabular-nums">{tavolo.label}</span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-medium uppercase tracking-wider",
              BADGE[calore],
            )}
          >
            <Icona
              className={cn(
                "h-3.5 w-3.5",
                /* Solo il piatto pronto respira, e solo lui: è l'unica cosa
                   in questa coda che **peggiora aspettando**. Un conto
                   chiesto resta chiesto; un piatto pronto si fredda. */
                richiamo.tipo === "PIATTI_PRONTI" && "animate-respiro motion-reduce:animate-none",
              )}
              aria-hidden="true"
            />
            {richiamo.etichetta}
          </span>
        </div>

        <p className="sa-corpo mt-1.5 truncate font-medium">
          {tavolo.ospite ?? `${tavolo.posti} posti`}
        </p>
        {/*
          Due fatti, non tre. Chi segue il tavolo si scrive **solo quando
          qualcuno lo segue**: sui tavoli scoperti «nessun cameriere» era una
          terza voce che diceva quello che il tasto «prendo io», due righe
          sotto, dice già — e su uno schermo da 390 px la riga finiva per
          troncarsi proprio sull'ora.
        */}
        <p className="sa-nota mt-0.5 truncate">
          {[
            tavolo.ospiti ? `${tavolo.ospiti} ospiti` : null,
            tavolo.dalle ? `dalle ${tavolo.dalle}` : null,
            tavolo.coperto.length > 0 && !tavolo.mio
              ? `segue ${tavolo.coperto[0].nome.split(" ")[0]}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <p className={cn("sa-corpo mt-2 flex items-baseline gap-2", SEGNO[calore])}>
          <span className="min-w-0 flex-1 truncate">{richiamo.testo}</span>
          {quanto && <span className="sa-nota shrink-0 tabular-nums">{quanto}</span>}
        </p>
      </Link>

      {/*
        Il secondario si **restringe sul suo testo**, il primario prende quello
        che resta. Due `flex-1` li facevano larghi uguali, e «Prendi comanda»
        — che è l'azione per cui la card esiste — andava a capo dentro il suo
        stesso pulsante mentre accanto avanzava spazio. Su un tasto che si
        preme camminando, un'etichetta su due righe è un'etichetta che si
        rilegge.
      */}
      <div className="mt-3 flex gap-2">
        {puoPrendere && (
          <button
            type="button"
            disabled={inCorso}
            onClick={prendiInCarico}
            className="sa-tocco flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong px-4 text-[0.9375rem] font-medium disabled:opacity-60"
          >
            <HandPlatter className="h-4 w-4" aria-hidden="true" />
            Prendo io
          </button>
        )}

        <Link
          href={comandaPrima ? `${href}?comanda=1` : href}
          className={cn(
            "sa-tocco flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[0.9375rem] font-medium",
            calore === "poi" ? "border border-border-strong" : "bg-cream text-clay-ink",
          )}
        >
          {comandaPrima && <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {comandaPrima ? "Prendi comanda" : "Apri tavolo"}
        </Link>
      </div>
    </div>
  );
}
