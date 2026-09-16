"use client";

import type { ReactNode } from "react";
import { Link2, Phone } from "lucide-react";
import { CosaSapere } from "@/components/guests/cosa-sapere";
import { durataUmana } from "@/lib/durata";
import { frasePrevisione } from "@/lib/liberazione";
import { oraInVenue } from "@/lib/venue-time";
import { formatCurrency } from "@/lib/utils";
import { SUPERFICIE_STATO } from "@/components/tables/stile-stato";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { Cifra, Riquadro } from "./sezione";

/**
 * **Cosa sta succedendo adesso**: il blocco che domina il pannello.
 *
 * ## Perché è un riquadro e non una sezione
 *
 * Perché è la risposta alla domanda per cui si è toccato il tavolo, e prima
 * aveva lo stesso trattamento dello storico di agosto. Qui ha una superficie
 * sua — tinta dallo stato (`SUPERFICIE_STATO`) — quindi si riconosce prima di
 * essere letto: un tavolo occupato è caldo, uno libero è un incavo, uno in
 * arrivo è verde salvia. Il colore non aggiunge informazione nuova: **anticipa**
 * quella che c'è scritta dentro, che è il mestiere del colore in una schermata
 * guardata per un secondo.
 *
 * ## Tre forme, un componente
 *
 * Un tavolo libero, uno prenotato e uno occupato rispondono alla stessa
 * domanda con fatti diversi. Tre file avrebbero voluto dire tre posti dove
 * decidere come si scrive un orario.
 *
 * ## I soldi
 *
 * Il residuo è **il numero grande** quando c'è gente seduta: è quello che fa
 * alzare una persona dalla cassa. Il dettaglio del conto — righe, sconti,
 * mance, chi ha pagato quanto — sta sotto, in un gruppo di consultazione, e
 * non ripete questa cifra.
 */
export function StatoCorrente({
  profilo,
  azioni,
}: {
  profilo: ProfiloTavolo;
  /** Le azioni secondarie contestuali. La principale sta nella fascia in fondo. */
  azioni?: ReactNode;
}) {
  const { corrente, prossima, conto, timezone, currency, stato } = profilo;
  const superficie = SUPERFICIE_STATO[stato];
  const ora = (iso: string) => oraInVenue(iso, timezone);

  /* ---------------------------------------------------------------------- */
  /*  Seduti                                                                */
  /* ---------------------------------------------------------------------- */
  if (corrente && corrente.status === "SEATED") {
    const previsione = corrente.liberoVerso ? frasePrevisione(corrente.liberoVerso, timezone) : null;
    const oltre = corrente.liberoVerso != null && corrente.liberoVerso.minuti < 0;
    const soldiInEvidenza = !!conto && (conto.residuoCents > 0 || conto.pagatoCents > 0);

    return (
      <Riquadro superficie={superficie}>
        <p className="t-titolo-sezione leading-tight">
          {corrente.ospite.nome}
          {corrente.ospite.affezionato && (
            <span className="ml-2 align-middle rounded-full bg-accent/25 px-2 py-0.5 text-[11px] font-normal">
              Affezionato
            </span>
          )}
        </p>
        <p className="mt-0.5 t-nota">
          dalle {ora(corrente.seatedAt ?? corrente.startsAt)}
          {corrente.unitoA.length > 0 && (
            <>
              {" · "}
              <Link2 className="inline h-3 w-3" aria-hidden="true" /> unito ad altri{" "}
              {corrente.unitoA.length}
            </>
          )}
        </p>

        {/*
          Tre cifre, non sette righe di prosa. La terza è quella che fa muovere
          qualcuno: se c'è un conto da saldare è il residuo, altrimenti è l'ora
          in cui il tavolo si libera — e in entrambi i casi è la sola che porta
          il peso tipografico.
        */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Cifra
            valore={corrente.daMinuti != null ? durataUmana(corrente.daMinuti) : "—"}
            etichetta="in tavola"
          />
          <Cifra
            valore={`${corrente.coperti}`}
            etichetta={corrente.coperti === 1 ? "ospite" : "ospiti"}
          />
          {conto && conto.residuoCents > 0 ? (
            <Cifra
              valore={formatCurrency(conto.residuoCents, currency)}
              etichetta="da pagare"
              tono="forte"
            />
          ) : conto && conto.pagatoCents > 0 ? (
            // Un tavolo che ha saldato dal telefono **non deve passare in
            // cassa**: è la cifra che qui diventa un'istruzione.
            <Cifra valore="Saldato" etichetta="dal tavolo" className="text-sage-strong" />
          ) : previsione ? (
            <div title={previsione.dettaglio}>
              <Cifra
                valore={
                  oltre
                    ? `+${durataUmana(Math.abs(corrente.liberoVerso!.minuti))}`
                    : ora(corrente.liberoVerso!.fine)
                }
                etichetta={oltre ? "oltre il previsto" : "si libera verso"}
                className={oltre ? "text-accent-strong" : undefined}
              />
            </div>
          ) : (
            <Cifra valore="—" etichetta="conto" tono="quieto" />
          )}
        </div>

        {/*
          La previsione di liberazione quando la terza cifra è occupata dai
          soldi: resta una riga, perché è la promessa con cui si decide se far
          aspettare qualcuno dieci minuti invece di mandarlo via.
        */}
        {previsione && soldiInEvidenza && (
          <p
            className={oltre ? "mt-2 text-sm text-accent-strong" : "mt-2 text-sm text-muted-foreground"}
            title={previsione.dettaglio}
          >
            {oltre
              ? `oltre il previsto di ${durataUmana(Math.abs(corrente.liberoVerso!.minuti))}`
              : `si libera verso ${ora(corrente.liberoVerso!.fine)}`}
          </p>
        )}

        <CosaSapere righe={corrente.daSapere} disposizione="colonna" className="mt-2.5" />

        {corrente.note && <p className="mt-2 t-corpo text-muted-foreground">{corrente.note}</p>}

        {/*
          Chi arriva dopo, **anche mentre il tavolo è occupato**: è la metà
          della decisione. Sapere che si libera verso le 22:30 serve a poco se
          non si sa che alle 22:15 arriva qualcuno proprio qui.
        */}
        {prossima && (
          <p className="mt-2 t-nota">
            poi {prossima.ospite.nome} alle {ora(prossima.startsAt)} · {prossima.coperti}p
            {corrente.liberoVerso &&
              new Date(corrente.liberoVerso.fine).getTime() > new Date(prossima.startsAt).getTime() && (
                <span className="text-accent-strong"> — non fa in tempo</span>
              )}
          </p>
        )}

        {azioni}
      </Riquadro>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  In arrivo o prenotato                                                 */
  /* ---------------------------------------------------------------------- */
  if (corrente) {
    return (
      <Riquadro superficie={superficie}>
        <div className="flex items-baseline gap-2.5">
          <span className="text-display text-3xl leading-none">{ora(corrente.startsAt)}</span>
          <span className="t-corpo text-muted-foreground">
            {corrente.coperti} {corrente.coperti === 1 ? "persona" : "persone"}
          </span>
        </div>

        <p className="mt-2.5 t-titolo-sezione leading-tight">{corrente.ospite.nome}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 t-nota">
          {corrente.ospite.telefono && (
            <a
              href={`tel:${corrente.ospite.telefono}`}
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              {corrente.ospite.telefono}
            </a>
          )}
          {corrente.minutiAllArrivo != null && (
            <span className={corrente.minutiAllArrivo < 0 ? "text-accent-strong" : undefined}>
              {corrente.status === "ARRIVED"
                ? "in sala, in attesa del tavolo"
                : corrente.minutiAllArrivo >= 0
                  ? `fra ${durataUmana(corrente.minutiAllArrivo)}`
                  : `in ritardo di ${durataUmana(Math.abs(corrente.minutiAllArrivo))}`}
            </span>
          )}
        </p>

        <CosaSapere righe={corrente.daSapere} disposizione="colonna" className="mt-2.5" />

        {corrente.note && <p className="mt-2 t-corpo text-muted-foreground">{corrente.note}</p>}

        {azioni}
      </Riquadro>
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Libero                                                                */
  /* ---------------------------------------------------------------------- */
  return (
    <Riquadro superficie={superficie}>
      <p className="t-titolo-sezione leading-tight">
        {stato === "BLOCCATO"
          ? "Fuori servizio"
          : stato === "PULIZIA"
            ? "Da riassettare"
            : "Tavolo libero"}
      </p>

      {prossima ? (
        <>
          <p className="mt-0.5 t-nota">prossima prenotazione</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-display text-3xl leading-none">{ora(prossima.startsAt)}</span>
            <span className="t-corpo text-muted-foreground">
              {prossima.coperti} {prossima.coperti === 1 ? "ospite" : "ospiti"}
            </span>
          </div>
          <p className="mt-2 t-titolo-scheda">{prossima.ospite.nome}</p>
          {prossima.ospite.telefono && (
            <a
              href={`tel:${prossima.ospite.telefono}`}
              className="mt-0.5 inline-flex items-center gap-1 t-nota underline underline-offset-4"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              {prossima.ospite.telefono}
            </a>
          )}
        </>
      ) : (
        <p className="mt-0.5 t-nota">Nessuna prenotazione imminente su questo tavolo.</p>
      )}

      {azioni}
    </Riquadro>
  );
}
