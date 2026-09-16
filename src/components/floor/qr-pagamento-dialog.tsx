"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { readApiError } from "@/lib/api-client";
import type { StatoQrTavolo } from "@/server/qr-tavolo";

/**
 * Il QR di un tavolo: accenderlo, vederlo, stamparlo, revocarlo.
 *
 * ## Perché la rigenerazione chiede conferma
 *
 * È l'unica azione qui dentro che **rompe qualcosa di fisico**: da quel
 * momento ogni cartoncino già stampato per questo tavolo smette di funzionare,
 * e chi è seduto lì con la pagina aperta si trova il link morto. Serve — un QR
 * finito in una fotografia pubblica va revocato — ma non è un pulsante da
 * premere per curiosità, quindi chiede due volte.
 *
 * ## Perché l'anteprima è un'immagine dal server
 *
 * Il QR si potrebbe disegnare nel browser, ma servirebbe mandare il **token**
 * al client per farlo. Così invece esce dal server già come immagine: il
 * segreto resta nel link da copiare, che è l'unico posto in cui deve stare.
 */
export function QrPagamentoDialog({
  open,
  onOpenChange,
  tableId,
  tavolo,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string | null;
  tavolo: string;
  currency: string;
}) {
  const [stato, setStato] = useState<StatoQrTavolo | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const [confermaRigenera, setConfermaRigenera] = useState(false);
  // Cambia a ogni rigenerazione, così il browser non ripesca l'anteprima
  // vecchia dalla propria cache — che mostrerebbe il QR appena revocato.
  const [versione, setVersione] = useState(0);

  const carica = useCallback(async () => {
    if (!tableId) return;
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
    if (open) void carica();
    else {
      setConfermaRigenera(false);
      setCopiato(false);
    }
  }, [open, carica]);

  async function commuta(attivo: boolean) {
    if (!tableId) return;
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/qr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non riusciamo a cambiare lo stato."));
      setStato(await res.json());
      setVersione((v) => v + 1);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riusciamo a cambiare lo stato.");
    } finally {
      setCaricando(false);
    }
  }

  async function rigenera() {
    if (!tableId) return;
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/qr`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Non riusciamo a rigenerare il QR."));
      setStato(await res.json());
      setVersione((v) => v + 1);
      setConfermaRigenera(false);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riusciamo a rigenerare il QR.");
    } finally {
      setCaricando(false);
    }
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        `[&>*]:min-w-0` non è decorazione: `DialogContent` è una griglia, e in
        una griglia ogni figlio ha larghezza minima pari al proprio contenuto.
        Le due colonne di pulsanti e il link del QR spingevano il contenuto
        oltre i 448 px del pannello, che lo tagliava — «PDF da stampa» restava
        a metà e il pulsante «Copia» spariva del tutto fuori dal bordo.
      */}
      <DialogContent className="max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Pagamento con QR · Tavolo {tavolo}</DialogTitle>
          <DialogDescription>
            Chi è seduto qui inquadra il codice e paga il proprio conto dal telefono, senza
            registrarsi e senza installare nulla.
          </DialogDescription>
        </DialogHeader>

        {errore && (
          <p
            role="alert"
            className="riquadro flex items-start gap-2 border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
            {errore}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 riquadro p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {stato?.attivo ? "Attivo" : "Disattivato"}
            </p>
            <p className="text-xs text-muted-foreground">
              {stato?.attivo
                ? "Il codice sul tavolo funziona."
                : "Chi inquadra il codice legge che il pagamento non è attivo."}
            </p>
          </div>
          <Switch
            checked={!!stato?.attivo}
            disabled={caricando || !stato}
            onCheckedChange={commuta}
            aria-label="Pagamento con QR attivo"
          />
        </div>

        {stato?.url ? (
          <>
            <div className="flex justify-center rounded-xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/tables/${tableId}/qr/png?lato=420&v=${versione}`}
                alt={`Codice QR del tavolo ${tavolo}`}
                width={210}
                height={210}
                className="h-[210px] w-[210px]"
              />
            </div>

            <div className="flex items-center gap-2 riquadro p-2">
              <code className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
                {stato.url}
              </code>
              <Button type="button" variant="subtle" size="sm" onClick={copia}>
                {copiato ? (
                  <>
                    <Check className="h-4 w-4" /> Copiato
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copia
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/tables/${tableId}/qr/png?lato=1200`} download={`tavolo-${tavolo}-qr.png`}>
                  <Download className="h-4 w-4" /> Scarica PNG
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/tables/${tableId}/qr/pdf`}>
                  <FileText className="h-4 w-4" /> PDF da stampa
                </a>
              </Button>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 riquadro p-3 text-sm">
              <Voce
                etichetta="Pagamenti dal QR"
                valore={stato.pagamenti === 0 ? "Nessuno" : String(stato.pagamenti)}
              />
              <Voce
                etichetta="Incassato"
                valore={stato.pagamenti === 0 ? "—" : formatCurrency(stato.incassatoCents, currency)}
              />
              <Voce
                etichetta="Mance"
                valore={stato.manceCents === 0 ? "—" : formatCurrency(stato.manceCents, currency)}
              />
              <Voce
                etichetta="Ultimo utilizzo"
                valore={stato.ultimoUtilizzo ? formatDateTime(stato.ultimoUtilizzo) : "Mai"}
              />
            </dl>

            {/* La revoca sta in fondo, staccata, e chiede conferma: rompe i
                cartoncini già stampati. */}
            <div className="border-t border-border pt-3">
              {confermaRigenera ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong className="font-semibold">Da questo momento i codici già stampati per
                    il tavolo {tavolo} smettono di funzionare.</strong>{" "}
                    Chi è seduto lì adesso dovrà inquadrare il nuovo. I pagamenti già ricevuti non
                    cambiano.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={caricando}
                      onClick={rigenera}
                    >
                      {caricando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Sì, rigenera
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfermaRigenera(false)}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setConfermaRigenera(true)}
                >
                  <RefreshCw className="h-4 w-4" /> Rigenera codice
                </Button>
              )}
              {stato.rigeneratoIl && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Generato il {formatDateTime(stato.rigeneratoIl)}.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="riquadro p-4 text-sm text-muted-foreground">
            {caricando
              ? "Un momento…"
              : "Accendi il pagamento con QR per generare il codice di questo tavolo."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="tabular-nums">{valore}</dd>
    </div>
  );
}
