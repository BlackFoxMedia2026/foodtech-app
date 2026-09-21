"use client";

import Link from "next/link";
import { useState } from "react";
import { Phone, PhoneMissed } from "lucide-react";
import { useTelefonoVivo } from "@/components/telefono/voice-globale";

/**
 * Il telefono in testata: quante cose chiedono di essere fatte.
 *
 * ## Il bollino non conta le telefonate
 *
 * Conta le **azioni in sospeso**: chiamate perse che nessuno ha gestito e
 * persone da richiamare. Un bollino che dice «47» perché oggi sono arrivate
 * quarantasette telefonate non chiede niente a nessuno, e dopo due giorni non
 * lo si guarda più. Questo si spegne quando non c'è niente da fare, ed è
 * l'unico modo perché accendersi significhi qualcosa.
 *
 * ## Non compare se non serve
 *
 * Senza telefono collegato non c'è. Senza niente da fare **e** senza nessuno
 * in linea, nemmeno: un'icona spenta in mezzo alle altre tre è un posto in più
 * dove guardare per scoprire che non c'era niente.
 *
 * ## Il pannello dice tre cose e poi si fa da parte
 *
 * Chi sta in linea, chi va richiamato, chi ha chiamato senza trovare nessuno.
 * Non è un centro operativo — quello è la pagina Telefono, e il pannello ci
 * porta con un clic.
 */

export function IndicatoreTelefono() {
  const stato = useTelefonoVivo();
  const [aperto, setAperto] = useState(false);

  const inLinea = stato.chiamate.length;
  /* Niente da fare e nessuno in linea: l'icona non c'è. Il contesto restituisce
     zero anche sui locali senza telefono, quindi questa riga copre entrambi i
     casi senza doverli distinguere. */
  if (stato.azioni === 0 && inLinea === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        aria-label={
          inLinea > 0
            ? `Telefono: ${inLinea === 1 ? "una chiamata in corso" : `${inLinea} chiamate in corso`}`
            : `Telefono: ${stato.azioni === 1 ? "una cosa da fare" : `${stato.azioni} cose da fare`}`
        }
        className="tocco-comodo relative flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
        {/* Il numero, e non un puntino: «quante» è l'informazione. Il puntino
            direbbe solo «qualcosa», e costringerebbe ad aprire per sapere se
            vale la pena. */}
        {stato.azioni > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums text-destructive-foreground">
            {stato.azioni > 9 ? "9+" : stato.azioni}
          </span>
        )}
        {/* Qualcuno è in linea **adesso**: un anello, non un numero. Sono due
            informazioni diverse e non si sommano in un bollino solo. */}
        {inLinea > 0 && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-sage-strong"
          />
        )}
      </button>

      {aperto && (
        <>
          {/* Si chiude toccando altrove: un pannello che si chiude solo con la
              sua X costa due gesti dove ne basta uno. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setAperto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="riquadro absolute right-0 top-11 z-50 w-72 space-y-2 bg-card p-3 shadow-lg">
            {inLinea > 0 && (
              <Riga
                icona={
                  <Phone
                    className="h-3.5 w-3.5 text-sage-strong"
                    aria-hidden="true"
                  />
                }
                testo={
                  inLinea === 1
                    ? "Una chiamata in corso"
                    : `${inLinea} chiamate in corso`
                }
                nota={
                  stato.chiamate[0]?.chi?.firstName ??
                  stato.chiamate[0]?.telefono ??
                  null
                }
              />
            )}
            {stato.richiamateAperte > 0 && (
              <Riga
                icona={
                  <Phone
                    className="h-3.5 w-3.5 text-accent-strong"
                    aria-hidden="true"
                  />
                }
                testo={
                  stato.richiamateAperte === 1
                    ? "Una persona da richiamare"
                    : `${stato.richiamateAperte} persone da richiamare`
                }
                nota={null}
              />
            )}
            {stato.perseDaGestire > 0 && (
              <Riga
                icona={
                  <PhoneMissed
                    className="h-3.5 w-3.5 text-destructive-soft"
                    aria-hidden="true"
                  />
                }
                testo={
                  stato.perseDaGestire === 1
                    ? "Una chiamata senza risposta"
                    : `${stato.perseDaGestire} chiamate senza risposta`
                }
                nota="nelle ultime 24 ore"
              />
            )}
            <Link
              href="/telefono"
              onClick={() => setAperto(false)}
              className="block rounded-md border border-border/60 px-2 py-1.5 text-center text-xs hover:bg-muted/40"
            >
              Apri il Telefono
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Riga({
  icona,
  testo,
  nota,
}: {
  icona: React.ReactNode;
  testo: string;
  nota: string | null;
}) {
  return (
    <p className="flex items-baseline gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icona}</span>
      <span className="min-w-0">
        {testo}
        {nota && <span className="ml-1 t-nota">{nota}</span>}
      </span>
    </p>
  );
}
