import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  ChefHat,
  ChevronRight,
  DoorOpen,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OspiteDaAccomodare } from "@/server/staff-app/da-accomodare";

/**
 * **Le sezioni della Home** — il redesign operativo.
 *
 * Stanno tutte in un file perché sono un solo oggetto di progettazione: il
 * ritmo della dashboard. Il titolo di sezione, il vuoto leggero e l'elenco
 * delle cose da fare si leggono uno sotto l'altro, e tenerli in quattro file
 * vorrebbe dire cambiarne tre ogni volta che si corregge una spaziatura.
 *
 * I **tasti dei tavoli** sono usciti da qui e stanno in
 * `griglia-tavoli.tsx`: da quando la Sala usa la stessa griglia, tenerli
 * dentro «le sezioni della Home» voleva dire che il componente di due
 * schermate viveva in casa di una sola.
 *
 * ## La regola che tiene insieme tutto
 *
 * **Lo stato si guarda, l'azione si legge.**
 *
 * I tavoli sono disegnati e non descritti: forma, dimensione e colore dicono
 * com'è messo il tavolo senza una parola. Le cose da fare invece sono righe
 * di testo, perché «vai al tavolo 4, ci sono due piatti pronti» non è uno
 * stato — è una frase, e un'icona colorata non la sostituisce.
 *
 * Prima era il contrario: i tavoli erano rettangoli identici pieni di testo
 * (nome, ospite, minuti, conto, stato, richiamo) e non c'era nessun elenco
 * di azioni. Si leggevano sei card per scoprire quale chiedeva qualcosa.
 */

/* -------------------------------------------------------------------------- */
/*  Il titolo di una sezione                                                   */
/* -------------------------------------------------------------------------- */

export function Sezione({
  titolo,
  azione,
  children,
}: {
  titolo: string;
  azione?: { testo: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <h2 className="sa-sezione">{titolo}</h2>
        {azione && (
          /* Alto 44 px anche se il testo ne occupa venti: quello che si tocca
             si misura col pollice, non col carattere. Il margine negativo lo
             rimette in linea con la base del titolo. */
          <Link
            href={azione.href}
            className="-my-2 -mr-1 inline-flex min-h-[44px] shrink-0 items-center gap-0.5 px-1 text-[0.9375rem] font-medium text-accent-strong"
          >
            {azione.testo}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Da fare                                                                    */
/* -------------------------------------------------------------------------- */

const ICONA_RICHIAMO = {
  PIATTI_PRONTI: BellRing,
  CONTO: ReceiptText,
  ALLERGIA: AlertTriangle,
  NOTA: ChefHat,
} as const;

export type CosaDaFare = {
  id: string;
  href: string;
  tipo: keyof typeof ICONA_RICHIAMO;
  /** «T4», «B2»: come si chiama il tavolo in sala. Nullo per la cucina. */
  dove: string | null;
  testo: string;
};

/**
 * **Da fare** — la sezione che rende la dashboard uno strumento invece che
 * una schermata informativa.
 *
 * Tre righe al massimo, e **non compare quando non c'è niente**. Un riquadro
 * che dice «nessun avviso» è mezzo schermo speso per confermare la
 * condizione normale: durante due terzi di un servizio non c'è niente da
 * fare *adesso*, e quella è una buona notizia che non ha bisogno di una
 * scatola.
 *
 * Ogni riga porta **dove** e **cosa**, in quest'ordine, perché la prima cosa
 * che un cameriere decide è se deve alzarsi e dove andare. Il testo è corto
 * di proposito: il dettaglio sta nel tavolo, che è a un tocco.
 */
export function DaFare({ cose }: { cose: CosaDaFare[] }) {
  if (cose.length === 0) return null;

  return (
    <Sezione titolo="Da fare">
      <ul className="space-y-2">
        {cose.map((c) => {
          const Icona = ICONA_RICHIAMO[c.tipo];
          const allarme = c.tipo === "ALLERGIA";

          return (
            <li key={c.id}>
              <Link
                href={c.href}
                className={cn(
                  "sa-tocco flex min-h-[56px] items-center gap-3 rounded-[14px] border px-3.5 py-2.5",
                  allarme
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-accent/40 bg-accent/10",
                )}
              >
                <Icona
                  className={cn(
                    "h-5 w-5 shrink-0",
                    allarme ? "text-destructive-soft" : "text-accent-strong",
                    /* Solo il piatto pronto respira, e solo lui: è l'unica
                       cosa in questo elenco che **peggiora aspettando**. Un
                       conto chiesto resta chiesto, un'allergia resta
                       un'allergia; un piatto pronto si fredda. */
                    c.tipo === "PIATTI_PRONTI" && "animate-respiro motion-reduce:animate-none",
                  )}
                  aria-hidden="true"
                />
                <p className="sa-corpo min-w-0 flex-1 truncate font-medium">
                  {c.dove && <span className="tabular-nums">{c.dove} · </span>}
                  {c.testo}
                </p>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}

/* -------------------------------------------------------------------------- */
/*  Da accomodare                                                              */
/* -------------------------------------------------------------------------- */

/** Quanti nomi stanno in Home. Il resto si conta, e si apre in Sala. */
const MAX_OSPITI_HOME = 3;

/**
 * **Gli ospiti che aspettano di sedersi**, come li vede la Home.
 *
 * ## Perché in Home c'è, e perché è breve
 *
 * Il §1 del brief chiede che l'arrivo diventi **globale**: un ospite segnato
 * arrivato da Prenotazioni deve comparire anche sul telefono di chi è in sala,
 * altrimenti resta un fatto che vive in una schermata sola. Questa è quella
 * riga.
 *
 * Ma la Home resta **sintetica** e la Sala è lo strumento: qui ci sono i nomi
 * e un pulsante, non il suggerimento del tavolo. Mettere i tavoli anche qui
 * vorrebbe dire due posti in cui si accomoda, cioè due percorsi da tenere
 * allineati per sempre — e uno dei due sarebbe quello meno usato, cioè quello
 * che si rompe senza che nessuno se ne accorga.
 *
 * Sta **sopra** «Da fare» di proposito: un piatto che si fredda è urgente, una
 * persona in piedi che guarda la sala è urgente e ti sta guardando.
 */
export function DaAccomodareHome({ ospiti }: { ospiti: OspiteDaAccomodare[] }) {
  if (ospiti.length === 0) return null;

  const visibili = ospiti.slice(0, MAX_OSPITI_HOME);
  const nascosti = ospiti.length - visibili.length;

  return (
    <section>
      <div className="flex items-center gap-2 pb-2.5">
        <DoorOpen className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
        <h2 className="sa-sezione">
          {ospiti.length === 1 ? "1 ospite da accomodare" : `${ospiti.length} ospiti da accomodare`}
        </h2>
      </div>

      <div className="rounded-[18px] border border-accent/50 bg-accent/10 p-3.5">
        <ul className="space-y-1">
          {visibili.map((o) => (
            <li key={o.bookingId} className="sa-corpo flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{o.nome}</span>
              <span className="sa-nota shrink-0 tabular-nums">
                {o.coperti === 1 ? "1 persona" : `${o.coperti} persone`}
                {o.attesaLunga && ` · ${o.attesaMin} min`}
              </span>
            </li>
          ))}
          {nascosti > 0 && <li className="sa-nota">e altri {nascosti}</li>}
        </ul>

        <Link
          href="/staff-app/sala"
          className="sa-tocco mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-cream text-[0.9375rem] font-medium text-clay-ink"
        >
          Sistema ospiti
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Il vuoto                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Il vuoto leggero.**
 *
 * Era un riquadro tratteggiato con due righe di testo. Adesso è una riga
 * sola con un'icona e una strada: circa 72 px contro 100, e soprattutto
 * **dice cosa fare** invece di limitarsi a constatare che non c'è niente.
 *
 * «Prendi un tavolo dalla sala» non è un invito generico: sotto questa riga
 * ci sono i tavoli liberi, e il pulsante porta dove ci sono tutti.
 */
export function NessunTavolo() {
  return (
    <Link href="/staff-app/sala" className="sa-tocco sa-piano flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="sa-corpo font-medium">Nessun tavolo assegnato</p>
        <p className="sa-nota mt-0.5">Prendine uno dalla sala.</p>
      </div>
      {/*
        L'icona è uscita. In un riquadro largo 310 px, un quadratino
        decorativo a sinistra costava trentadue pixel e mandava a capo
        «Nessun tavolo assegnato» — cioè il testo che doveva accompagnare.
        Un'icona che rompe la frase che illustra non è un'icona semantica.
      */}
      <span className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-[0.8125rem] font-medium text-accent-strong">
        Apri sala
      </span>
    </Link>
  );
}
