"use client";

import { useState } from "react";
import { Archive, ArrowUpRight, Check, Copy, MoreHorizontal, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { accorda } from "@/lib/accordo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoriaDi, condizioniDi, statoDi } from "@/lib/coupon-vista";
import { cn } from "@/lib/utils";
import type { CouponView } from "@/server/coupons";

/**
 * Un coupon, in una scheda a tagliando.
 *
 * A sinistra la matrice: il **codice**, grande, e tutta la matrice si clicca
 * per copiarlo. È il dato che il cameriere detta al tavolo e che si incolla
 * in un messaggio: prima era la cosa più piccola della scheda — un `code` da
 * 12 px con un tasto copia da 28 px accanto.
 *
 * A destra il resto, in colonne di larghezza fissa perché si incolonni da una
 * scheda all'altra:
 *
 * 1. **quale coupon è, cosa dà, a che condizioni** — nome e tipologia, il
 *    beneficio (l'unica cosa colorata), le condizioni in grigio. Tre righe
 *    di una sola colonna: prima il beneficio era una colonna a sé e cadeva
 *    a un'ascissa diversa su ogni scheda;
 * 2. **quanto sta girando** — gli utilizzi, con la barra solo dove c'è un
 *    tetto da consumare;
 * 3. **vale adesso?** — la pillola, in una colonna fissa: con `auto` «Non
 *    oggi» spingeva tutto il resto più a sinistra di «Valido»;
 * 4. **cosa ci faccio** — la freccia che apre il dettaglio, e il resto nel menu.
 *
 * Sotto i 1024 px la matrice va in testa, a tutta larghezza, e il resto si
 * dispone su due righe.
 */
export function CouponCard({
  c,
  canEdit,
  adesso,
  inCorso,
  onApri,
  onCambiaStato,
  onDuplica,
}: {
  c: CouponView;
  canEdit: boolean;
  /**
   * L'orologio arriva dall'elenco, uno solo per tutte le schede.
   *
   * Con un `new Date()` per scheda, undici coupon con scadenza a mezzanotte
   * potrebbero raccontare due giorni diversi nella stessa schermata.
   */
  adesso: Date;
  inCorso: boolean;
  onApri: () => void;
  onCambiaStato: (status: "ACTIVE" | "PAUSED" | "ARCHIVED") => void;
  onDuplica: () => void;
}) {
  const stato = statoDi(c);
  const condizioni = condizioniDi(c, adesso);
  const categoria = categoriaDi(c);
  const conTetto = c.restanti != null && c.maxRedemptions != null;
  const quota = conTetto ? Math.min(100, Math.round((c.usi / c.maxRedemptions!) * 100)) : 0;

  return (
    <li
      className={cn(
        "scheda-tagliando flex flex-col overflow-hidden lg:flex-row",
        // Ciò che adesso non si può usare — e non per l'ora del giorno —
        // scende di un gradino, come le righe non assegnabili in Staff.
        stato.spento && "opacity-[0.62] hover:opacity-100",
      )}
    >
      <Tagliando codice={c.code} />

      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem_auto] lg:gap-x-6 lg:py-[1.125rem] lg:pl-7">
        {/* ── 1. Quale coupon è, cosa dà, a che condizioni ─────────────── */}
        <div className="col-start-1 row-start-1 min-w-0">
          {/*
            La tipologia sale sopra il nome, come un occhiello.

            Era una pillola dorata accanto al nome, maiuscola e bordata: su
            ogni scheda c'erano due cose oro che chiedevano attenzione, la
            pillola e il beneficio. Come occhiello è una parola sola, quieta,
            e il nome torna a essere l'inizio della lettura.
          */}
          <p className="text-[0.6875rem] font-medium uppercase leading-none tracking-[0.14em] text-tertiary-foreground">
            {categoria}
          </p>
          {/* Il nome apre la scheda: è il bersaglio che si tenta per primo. */}
          <button
            type="button"
            onClick={onApri}
            className="mt-1.5 min-w-0 max-w-full rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.005em] text-card-foreground">
              {c.name}
            </span>
          </button>
          {/* L'unica cosa colorata: fra undici coupon si cerca «chi fa il 20%». */}
          <p className="mt-0.5 text-sm font-medium leading-snug text-accent-strong">
            {c.descrizione}
          </p>
          {condizioni.length > 0 && (
            /*
              Testo che va a capo, non caselle affiancate: il separatore sta
              attaccato alla parola che lo precede, quindi andando a capo il
              puntino resta in fondo alla riga, mai in testa a quella nuova.
            */
            <p className="mt-1 text-xs leading-relaxed text-tertiary-foreground">
              {condizioni.map((x, i) => (
                <span key={x.testo} className={cn(x.avviso && "font-medium text-accent-strong")}>
                  {i > 0 && " · "}
                  {x.testo}
                </span>
              ))}
            </p>
          )}
        </div>

        {/* ── 2. Quanto sta girando ─────────────────────────────────────── */}
        <div className="col-start-1 row-start-2 min-w-0 lg:col-start-2 lg:row-start-1">
          <p className="leading-none">
            <span className="text-[1.375rem] font-semibold tabular-nums tracking-tight text-card-foreground">
              {c.usi}
            </span>
            {conTetto && (
              <span className="text-sm tabular-nums text-muted-foreground"> / {c.maxRedemptions}</span>
            )}
          </p>
          <p className="mt-1 whitespace-nowrap text-xs leading-none text-tertiary-foreground">
            {accorda(["utilizzo", "utilizzi"], c.usi)}
            {conTetto ? "" : " · senza tetto"}
          </p>
          {conTetto && (
            // Muta: il rapporto è già scritto sopra in cifre.
            <div
              className="mt-2 h-1 w-full max-w-[6rem] overflow-hidden rounded-full bg-veil-10"
              aria-hidden="true"
            >
              <div
                className={cn("h-full rounded-full", quota >= 100 ? "bg-accent" : "bg-sage")}
                style={{ width: `${quota}%` }}
              />
            </div>
          )}
        </div>

        {/* ── 3. Vale adesso? ───────────────────────────────────────────── */}
        <div className="col-start-2 row-start-1 self-start justify-self-end lg:col-start-3 lg:self-center lg:justify-self-start">
          <Badge tone={stato.tono} className="gap-1.5 whitespace-nowrap">
            <i
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                stato.concluso ? "shadow-[inset_0_0_0_1.5px_currentColor]" : "bg-current",
              )}
              aria-hidden="true"
            />
            {stato.testo}
          </Badge>
        </div>

        {/* ── 4. Cosa ci faccio ─────────────────────────────────────────── */}
        <div className="col-start-2 row-start-2 flex items-center justify-end gap-1.5 lg:col-start-4 lg:row-start-1">
          {/*
            Una freccia che esce dalla scheda, invece della parola «Gestisci».

            La parola era un pulsante di testo identico su ogni riga, e
            «gestire» non dice cosa succede. La freccia in diagonale dice
            «apri il dettaglio», come in ogni elenco che porta da qualche parte;
            il nome del coupon resta comunque cliccabile.
          */}
          <Button
            variant="outline"
            size="icon"
            onClick={onApri}
            aria-label={`Apri ${c.name}`}
            title="Apri il coupon"
            className="group/apri h-9 w-9 rounded-full"
          >
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover/apri:-translate-y-px group-hover/apri:translate-x-px"
              aria-hidden="true"
            />
          </Button>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/*
                  Pausa e Archivia stanno nel menu: archiviare toglie un coupon
                  dalla vista e non deve essere il bersaglio più grosso a
                  portata di pollice.
                */}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={inCorso}
                  aria-label={`Altre azioni per ${c.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {c.status === "ACTIVE" && (
                  <DropdownMenuItem onSelect={() => onCambiaStato("PAUSED")}>
                    <Pause className="h-4 w-4" aria-hidden="true" /> Metti in pausa
                  </DropdownMenuItem>
                )}
                {c.status !== "ACTIVE" && (
                  <DropdownMenuItem onSelect={() => onCambiaStato("ACTIVE")}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {c.status === "ARCHIVED" ? "Ripristina" : "Riattiva"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={onDuplica}>
                  <Copy className="h-4 w-4" aria-hidden="true" /> Duplica
                </DropdownMenuItem>
                {c.status !== "ARCHIVED" && (
                  <DropdownMenuItem onSelect={() => onCambiaStato("ARCHIVED")}>
                    <Archive className="h-4 w-4" aria-hidden="true" /> Archivia…
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * La matrice del tagliando: il codice, grande, e tutta la matrice si clicca.
 *
 * La perforazione tratteggiata la stacca dal resto della scheda come la
 * matrice di un biglietto. Il riscontro della copia sta nell'etichetta
 * («Codice» diventa «Copiato» con la spunta) e, per chi usa un lettore di
 * schermo, in un'area annunciata.
 */
function Tagliando({ codice }: { codice: string }) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    try {
      await navigator.clipboard.writeText(codice);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1800);
    } catch {
      // Appunti negati: il codice resta lì, da leggere e selezionare.
    }
  }

  return (
    <button
      type="button"
      onClick={copia}
      aria-label={`Copia il codice ${codice}`}
      title="Clicca per copiare"
      className={cn(
        "group relative flex shrink-0 flex-col justify-center gap-2 px-5 py-4 text-left",
        // Un velo d'oro appena percettibile: la matrice è carta diversa dal
        // resto del biglietto, non un riquadro.
        "bg-[#c9a96a]/[0.07] transition-colors hover:bg-[#c9a96a]/[0.13]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "lg:w-[var(--matrice)] lg:pl-6",
      )}
    >
      {/*
        La perforazione: puntini, da una tacca all'altra. Una riga tratteggiata
        di bordo si leggeva come un divisore di tabella; i puntini tondi sono
        lo strappo di un biglietto.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute text-[#b3a07a]",
          "inset-x-4 bottom-0 h-[2px] bg-[radial-gradient(circle,currentColor_1px,transparent_1.4px)] bg-[length:7px_2px] bg-repeat-x",
          "lg:inset-x-auto lg:bottom-[calc(var(--tacca)+6px)] lg:right-0 lg:top-[calc(var(--tacca)+6px)] lg:h-auto lg:w-[2px] lg:translate-x-1/2 lg:bg-[length:2px_7px] lg:bg-repeat-y",
        )}
      />
      <span className="flex items-center justify-between gap-2 text-[0.6875rem] font-medium uppercase leading-none tracking-[0.14em]">
        {copiato ? (
          <span className="flex items-center gap-1.5 text-sage">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Copiato
          </span>
        ) : (
          <span className="text-tertiary-foreground">Codice</span>
        )}
        <Copy
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70",
            copiato && "invisible",
          )}
          aria-hidden="true"
        />
      </span>
      <span className="break-all font-mono text-[1.1875rem] font-medium leading-tight tracking-[0.06em] text-primary">
        {codice}
      </span>
      <span className="sr-only" aria-live="polite">
        {copiato ? "Codice copiato" : ""}
      </span>
    </button>
  );
}
