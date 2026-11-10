"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useVenueToday } from "@/components/shell/venue-time-provider";
import { ALTEZZA, BottoneOggi } from "@/components/bookings/barra-prenotazioni";
import { cn } from "@/lib/utils";
import type { GiornoSettimana, Settimana } from "@/server/booking-week";

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/**
 * La settimana sui libri.
 *
 * Risponde alla domanda che si fa al telefono — «avete posto sabato?» — in un
 * colpo d'occhio, invece di cinque frecce e cinque pagine.
 *
 * **L'altezza è il dato.** Ogni giorno è una colonna che si riempie dal basso
 * quanto è pieno. Prima erano sette schede alte con il numero a metà e una
 * barretta da sessanta pixel in fondo: l'altezza c'era ma non diceva niente, e
 * per sapere se sabato era più pieno di giovedì bisognava leggere due numeri.
 * Adesso si vede prima di leggere.
 *
 * Le parole che si ripetevano sette volte («coperti», «di 150») sono scritte
 * una volta sola, nel riepilogo in cima. In fondo a ogni colonna resta quello
 * che serve per rispondere al telefono: i **posti liberi**.
 *
 * Ogni giorno è un collegamento: si tocca e si apre quel giorno **nell'elenco**,
 * perché il gesto vero dopo aver visto la settimana è entrare in una serata.
 * Che l'elenco si apra davvero lo decide `BookingsPageClient` con
 * `onApriGiorno`: senza, il clic cambiava il giorno restando sulla settimana.
 *
 * Niente colori d'allarme decisi da noi sulla percentuale: «pieno» per un
 * bistrot da trenta coperti e per una sala da duecento non sono la stessa
 * cosa, e un rosso deciso qui sarebbe un giudizio travestito da dato. Si
 * evidenzia solo quello che chiede un'azione: **le prenotazioni da
 * confermare**.
 */
export function WeekBoard({
  settimana,
  onApriGiorno,
}: {
  settimana: Settimana;
  /** Chiamata quando si apre un giorno: serve a passare all'elenco. */
  onApriGiorno?: () => void;
}) {
  const { giorni } = settimana;

  /* La capienza si scrive nel riepilogo solo se è la stessa ogni giorno: con
     un lunedì da 80 e un sabato da 150, «capienza 150» sarebbe falso per sei
     giorni su sette. */
  const capienze = new Set(giorni.map((g) => g.capienza).filter((c) => c != null));
  const capienzaUnica = capienze.size === 1 ? [...capienze][0] : null;
  const primoInAttesa = giorni.find((g) => g.inAttesa > 0 && !g.passato) ?? giorni.find((g) => g.inAttesa > 0);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 xl:gap-5">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[0.9375rem] text-muted-foreground">
          {/* «In questa settimana» va detto: in altre viste la barra mostra il
              totale del giorno, e due numeri diversi senza etichetta sembrano
              una contraddizione. */}
          In questa settimana:{" "}
          <span className="font-semibold text-foreground tabular-nums">{settimana.copertiTotali} coperti</span> su{" "}
          <span className="tabular-nums">{settimana.prenotazioniTotali}</span>{" "}
          {settimana.prenotazioniTotali === 1 ? "prenotazione" : "prenotazioni"}
          {capienzaUnica != null && (
            <>
              {" · "}capienza <span className="tabular-nums">{capienzaUnica}</span> al giorno
            </>
          )}
        </p>

        {primoInAttesa && (
          /* L'unica cosa della vista che chiede di fare qualcosa: porta dritto
             al giorno, già filtrato su chi aspetta una risposta. */
          <Link
            href={`/bookings?day=${primoInAttesa.dateKey}&status=pending`}
            onClick={onApriGiorno}
            className="pastiglia inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-sm font-medium transition-colors hover:border-border-strong/70 hover:bg-veil-6"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--stato-dot-warn)]" aria-hidden="true" />
            <span>
              <span className="tabular-nums">{settimana.inAttesaTotali}</span> da confermare
              {settimana.inAttesaTotali === primoInAttesa.inAttesa && (
                <span className="text-muted-foreground"> · {nomeGiorno(primoInAttesa)}</span>
              )}
            </span>
          </Link>
        )}
      </header>

      {/*
        Le colonne prendono l'altezza che avanza, ed è giusto: più sono alte,
        più si legge la differenza fra un giorno e l'altro. Con un tetto a
        40 rem, perché su uno schermo verticale una colonna da 900 px non dice
        niente di più di una da 640.

        L'elasticità vale solo da `xl` in su, dove i giorni stanno su una riga
        sola. Sotto vanno a capo su due o quattro righe, a misura propria.
      */}
      <div className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4 xl:max-h-[40rem] xl:min-h-0 xl:flex-1 xl:grid-cols-7 xl:gap-3.5 min-[1500px]:gap-4">
        {giorni.map((g) => (
          <ColonnaGiorno key={g.dateKey} g={g} onApri={onApriGiorno} />
        ))}
      </div>

      <p className="t-nota max-w-5xl shrink-0 px-1">
        {/* Due schermate che rispondono a due domande diverse: dirlo evita che
            qualcuno le confronti e pensi che una delle due sbagli. */}
        Qui c&apos;è quello che è già prenotato, l&apos;intera giornata. La{" "}
        <Link href="/insights" className="underline">
          previsione dei coperti
        </Link>{" "}
        dice quanti ne aspettiamo, non quanti sono sui libri.
      </p>
    </section>
  );
}

function nomeGiorno(g: GiornoSettimana) {
  return `${GIORNI[g.weekday]} ${Number(g.dateKey.slice(8))}`;
}

function ColonnaGiorno({ g, onApri }: { g: GiornoSettimana; onApri?: () => void }) {
  const pieno = g.occupazione;
  const liberi = g.capienza != null ? g.capienza - g.coperti : null;

  return (
    <Link
      href={`/bookings?day=${g.dateKey}`}
      onClick={onApri}
      aria-current={g.oggi ? "date" : undefined}
      aria-label={[
        nomeGiorno(g) + (g.oggi ? ", oggi" : ""),
        `${g.coperti} coperti`,
        pieno != null ? `${pieno}% della capienza` : null,
        g.inAttesa > 0 ? `${g.inAttesa} da confermare` : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        "surface flex min-h-[17rem] min-w-0 flex-col gap-3 rounded-xl border p-3.5 transition-colors min-[1500px]:p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        g.oggi ? "border-[color:var(--oggi-fondo)]" : "border-border hover:border-border-strong",
      )}
    >
      {/* Quando. Oggi è la capsula verde piena, come nel calendario dei turni:
          è uno dei cinque posti dove il verde pieno vuol dire «attivo». */}
      <div className="flex min-h-[1.75rem] items-center justify-between gap-2">
        <span
          className={cn(
            "t-etichetta whitespace-nowrap rounded-full px-2.5 py-1 text-[0.8125rem]",
            g.oggi
              ? "bg-[color:var(--oggi-fondo)] text-[color:var(--oggi-ink)]"
              : "bg-secondary text-foreground",
          )}
        >
          {nomeGiorno(g)}
          {g.oggi && " · oggi"}
        </span>
        {g.inAttesa > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums" title={`${g.inAttesa} da confermare`}>
            <span className="h-2 w-2 rounded-full bg-[color:var(--stato-dot-warn)]" aria-hidden="true" />
            {g.inAttesa}
          </span>
        )}
      </div>

      {/* Quanto. I giorni passati non si sbiadiscono — su carta un testo
          velato si legge come annullato — si abbassano di tono. */}
      <div>
        <p
          className={cn(
            "text-display text-[2.5rem] leading-none tabular-nums min-[1500px]:text-[2.75rem]",
            g.passato && "text-muted-foreground",
          )}
        >
          {g.coperti}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">coperti</p>
      </div>

      {/* Quanto pieno: la colonna si riempie dal basso. */}
      {pieno != null ? (
        <div className="barra-binario relative min-h-[6rem] flex-1 overflow-hidden rounded-lg bg-veil-10" aria-hidden="true">
          {/* La metà, tratteggiata: il riferimento che fa leggere un 44% come
              «quasi metà» senza contare. */}
          <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-strong/40" />
          <span
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-lg",
              g.passato ? "bg-tertiary-foreground/45" : "barra-pieno bg-accent",
            )}
            style={{ height: `${Math.min(100, pieno)}%` }}
          />
          <span
            className="absolute left-2.5 text-sm font-semibold tabular-nums text-foreground"
            style={{ bottom: `calc(${Math.min(88, pieno)}% + 0.375rem)` }}
          >
            {pieno}%
          </span>
        </div>
      ) : (
        <p className="flex flex-1 items-center text-sm text-tertiary-foreground">nessun turno configurato</p>
      )}

      {/* Per rispondere al telefono: quanti posti restano. Su un giorno
          passato non c'è più niente da prenotare, e resta solo il conto. */}
      <div className="space-y-0.5 text-sm text-muted-foreground">
        {/* Una riga anche sul giorno passato: senza, la sua colonna scende più
            delle altre e i fondi delle sette barre non stanno più in fila. */}
        {g.passato && liberi != null && <p>giorno passato</p>}
        {liberi != null && !g.passato && (
          <p>
            {liberi >= 0 ? (
              <>
                <span className="font-semibold text-foreground tabular-nums">{liberi}</span> posti liberi
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground tabular-nums">{-liberi}</span> oltre la capienza
              </>
            )}
          </p>
        )}
        <p>
          {g.prenotazioni === 0
            ? "nessuna prenotazione"
            : `${g.prenotazioni} ${g.prenotazioni === 1 ? "prenotazione" : "prenotazioni"}`}
        </p>
      </div>
    </Link>
  );
}

/**
 * La navigazione della settimana, nella barra in alto.
 *
 * Prima la vista Settimana aveva due navigazioni: nella barra la data del
 * giorno («Martedì 10 novembre») con le sue frecce, e sotto il periodo
 * («9 – 15 novembre») con altre frecce. Due coppie di frecce che spostano di
 * un giorno e di sette, una sopra l'altra. Adesso in questa vista la capsula
 * della barra **è** la settimana: stesso posto, stesse misure, passo di sette.
 */
export function NavigatoreSettimana({ settimana }: { settimana: Settimana }) {
  const oggi = useVenueToday();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { giorni } = settimana;

  function vai(day: string) {
    const sp = new URLSearchParams(search);
    sp.set("day", day);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function sposta(delta: number) {
    const d = new Date(`${settimana.dal}T12:00:00`);
    d.setDate(d.getDate() + delta * 7);
    vai(d.toISOString().slice(0, 10));
  }

  const primo = new Date(`${giorni[0].dateKey}T12:00:00`);
  const ultimo = new Date(`${giorni[6].dateKey}T12:00:00`);
  const g = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric" });
  const m = (d: Date) => d.toLocaleDateString("it-IT", { month: "long" });
  const periodo =
    primo.getMonth() === ultimo.getMonth()
      ? `${g(primo)} – ${g(ultimo)} ${m(ultimo)}`
      : `${g(primo)} ${m(primo)} – ${g(ultimo)} ${m(ultimo)}`;

  return (
    <div className="flex shrink-0 items-center gap-2 min-[1280px]:gap-2.5 min-[1440px]:gap-3">
      <div className={cn(ALTEZZA, "pastiglia flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-1")}>
        <Freccia verso="indietro" onClick={() => sposta(-1)} />
        <span className="whitespace-nowrap px-1.5 text-sm font-semibold tabular-nums min-[1500px]:px-2.5">{periodo}</span>
        <Freccia verso="avanti" onClick={() => sposta(1)} />
      </div>
      {/* «Oggi» qui vuol dire «la settimana di oggi»: è acceso quando ci sei. */}
      <BottoneOggi attivo={giorni.some((d) => d.oggi)} onClick={() => vai(oggi)} />
    </div>
  );
}

function Freccia({ verso, onClick }: { verso: "indietro" | "avanti"; onClick: () => void }) {
  const Icona = verso === "indietro" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={verso === "indietro" ? "Settimana precedente" : "Settimana successiva"}
      className={cn(
        "pastiglia grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-secondary/40 text-muted-foreground transition-colors",
        "hover:border-border-strong/70 hover:bg-secondary/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icona className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
