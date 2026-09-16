"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, Printer, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { StatoQrTavolo } from "@/server/qr-tavolo";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { Cifra, Modulo } from "./sezione";

/**
 * Il QR del tavolo: **si vede, non si cerca**.
 *
 * ## Il percorso che questa piastrella esiste per togliere
 *
 * Era: tavolo → tre puntini → voce di menu → finestra. Quattro gesti per far
 * vedere a un cliente il codice che ha già davanti sul legno. Poi è diventato
 * una sezione con un titolo e un pulsante «Gestisci», che è la stessa cosa con
 * un gesto in meno.
 *
 * Adesso il codice **è** la piastrella: l'anteprima si vede senza toccare
 * niente, e un tocco la apre grande con scarica, stampa e link. Zero menu.
 *
 * ## Il codice è del tavolo, non della serata
 *
 * `Table.payQrToken` è permanente: si stampa una volta e resta incollato al
 * legno. Il conto da pagare si risolve invece **ogni volta** (tavolo →
 * prenotazione seduta → conto aperto, vedi `server/conto-tavolo.ts`). Per
 * questo non c'è niente da «rigenerare a ogni prenotazione», e per questo la
 * rigenerazione vera sta in fondo al livello, dietro una conferma: da quel
 * momento ogni cartoncino già stampato smette di funzionare.
 *
 * ## L'anteprima è un'immagine dal server
 *
 * Il QR si potrebbe disegnare nel browser, ma servirebbe mandargli il
 * **segreto**. Così invece esce già come immagine: il token resta nel link da
 * copiare, che è l'unico posto in cui deve stare.
 */
export function QrModulo({
  profilo,
  onApri,
}: {
  profilo: ProfiloTavolo;
  onApri: () => void;
}) {
  const { qr, tavolo } = profilo;

  return (
    <Modulo
      icona={QrCode}
      titolo="QR tavolo"
      onApri={onApri}
      ariaLabel={`Apri il QR del tavolo ${tavolo.label}`}
    >
      {qr.generato ? (
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/tables/${tavolo.id}/qr/png?lato=128`}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded bg-white p-0.5"
          />
          <span className="min-w-0">
            <span className={qr.attivo ? "block text-sm" : "block text-sm text-muted-foreground"}>
              {qr.attivo ? "Attivo" : "Spento"}
            </span>
            {/*
              Solo il conteggio, non anche l'incasso: due cifre qui mandavano
              la riga a capo e facevano crescere la piastrella oltre la
              gemella, che è il modo più veloce per far sembrare disallineata
              una coppia. L'incasso si legge un tocco più in là, dov'è insieme
              alle mance.
            */}
            <span className="block t-nota">
              {qr.pagamenti === 0
                ? "nessun pagamento"
                : `${qr.pagamenti} ${qr.pagamenti === 1 ? "pagamento" : "pagamenti"}`}
            </span>
          </span>
        </span>
      ) : (
        <span className="block text-sm text-muted-foreground">Non attivo</span>
      )}
    </Modulo>
  );
}

/**
 * Il livello del QR: grande, con quello che ci si fa.
 *
 * L'interruttore e la revoca stanno in fondo e non in cima: il gesto per cui
 * si entra qui è **mostrare il codice**, non spegnerlo. Un interruttore che
 * ferma gli incassi non va messo sopra la cosa che si viene a fare.
 */
export function QrLivello({
  profilo,
  puoGestireLocale,
}: {
  profilo: ProfiloTavolo;
  /** `manage_venue`: decidere se un tavolo incassa denaro non è di chi prende le prenotazioni. */
  puoGestireLocale: boolean;
}) {
  const tableId = profilo.tavolo.id;
  const [stato, setStato] = useState<StatoQrTavolo | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [conferma, setConferma] = useState(false);
  // Cambia a ogni rigenerazione, così il browser non ripesca dalla propria
  // cache l'anteprima del codice appena revocato.
  const [versione, setVersione] = useState(0);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/qr/stato`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "Non riusciamo a leggere lo stato del QR."));
      setStato(await res.json());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riusciamo a leggere lo stato del QR.");
    } finally {
      setCaricando(false);
    }
  }, [tableId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function chiama(init: RequestInit, fallback: string) {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/qr`, init);
      if (!res.ok) throw new Error(await readApiError(res, fallback));
      setStato(await res.json());
      setVersione((v) => v + 1);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : fallback);
    } finally {
      setCaricando(false);
    }
  }

  const commuta = (attivo: boolean) =>
    chiama(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo }),
      },
      "Non riusciamo a cambiare lo stato.",
    );

  async function copia() {
    if (!stato?.url) return;
    try {
      await navigator.clipboard.writeText(stato.url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      setErrore("Il browser non ha permesso di copiare. Seleziona il link a mano.");
    }
  }

  return (
    <div className="space-y-4">
      {errore && (
        <p role="alert" className="text-sm text-destructive-soft">
          {errore}
        </p>
      )}

      {stato?.url ? (
        <>
          <div className="flex justify-center rounded-lg bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/tables/${tableId}/qr/png?lato=720&v=${versione}`}
              alt={`Codice QR del tavolo ${profilo.tavolo.label}`}
              width={260}
              height={260}
              className="h-[260px] w-[260px]"
            />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {stato.attivo
              ? "Chi è seduto qui inquadra e paga il proprio conto dal telefono."
              : "Spento: chi inquadra legge che il pagamento non è attivo."}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/tables/${tableId}/qr/png?lato=1200`}
                download={`tavolo-${profilo.tavolo.label}-qr.png`}
              >
                <Download className="h-3.5 w-3.5" /> Scarica
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/tables/${tableId}/qr/pdf`} target="_blank" rel="noreferrer">
                <Printer className="h-3.5 w-3.5" /> Stampa
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copia}>
              {copiato ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copiato
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Link
                </>
              )}
            </Button>
          </div>

          <code className="block truncate rounded-md bg-background/40 px-3 py-2 text-xs text-tertiary-foreground">
            {stato.url}
          </code>

          {stato.pagamenti > 0 && (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card-sunken/60 p-3">
              <Cifra valore={String(stato.pagamenti)} etichetta="pagamenti" />
              <Cifra
                valore={formatCurrency(stato.incassatoCents, profilo.currency)}
                etichetta="incassato"
              />
              <Cifra
                valore={
                  stato.manceCents === 0 ? "—" : formatCurrency(stato.manceCents, profilo.currency)
                }
                etichetta="mance"
              />
            </div>
          )}
          {stato.ultimoUtilizzo && (
            <p className="t-nota">Ultima scansione: {formatDateTime(stato.ultimoUtilizzo)}.</p>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-border border-dashed p-6 text-center text-sm text-muted-foreground">
          {caricando
            ? "Un momento…"
            : puoGestireLocale
              ? "Il pagamento con QR non è ancora acceso su questo tavolo. Accendendolo si genera il codice da stampare."
              : "Questo tavolo non ha ancora un codice per il pagamento."}
        </p>
      )}

      {/*
        Interruttore e revoca **in fondo**: sono le due cose che si fanno una
        volta quando si attacca l'adesivo e una volta quando lo si perde. In
        cima avrebbero occupato il posto del codice, che è quello che si viene
        a vedere.
      */}
      {puoGestireLocale && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Pagamento con QR</p>
              <p className="t-nota">{stato?.attivo ? "acceso su questo tavolo" : "spento"}</p>
            </div>
            <Switch
              checked={!!stato?.attivo}
              disabled={caricando || !stato}
              onCheckedChange={commuta}
              aria-label="Pagamento con QR attivo"
            />
          </div>

          {stato?.url &&
            (conferma ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <strong className="font-semibold">
                    Da questo momento i codici già stampati per il tavolo {stato.tavolo} smettono di
                    funzionare.
                  </strong>{" "}
                  Chi è seduto lì adesso dovrà inquadrare il nuovo. I pagamenti già ricevuti non
                  cambiano.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={caricando}
                    onClick={() => {
                      void chiama({ method: "POST" }, "Non riusciamo a rigenerare il QR.");
                      setConferma(false);
                    }}
                  >
                    {caricando && <Loader2 className="h-4 w-4 animate-spin" />} Sì, rigenera
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConferma(false)}>
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConferma(true)}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Rigenera codice
                {stato.rigeneratoIl && (
                  <span className="t-nota">· dal {formatDateTime(stato.rigeneratoIl)}</span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
