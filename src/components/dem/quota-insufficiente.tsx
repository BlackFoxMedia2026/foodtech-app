"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { invii } from "@/lib/dem-piani";

export type QuotaMancante = {
  disponibili: number;
  richiesti: number;
  mancanti: number;
};

/**
 * Legge dalla risposta del server il caso «gli invii non bastano».
 *
 * Restituisce i numeri, oppure `null` se l'errore era un altro: chi chiama
 * mostra la finestra o il solito messaggio in riga, senza dover conoscere il
 * formato delle risposte.
 */
export async function leggiQuotaMancante(res: Response): Promise<QuotaMancante | null> {
  if (res.status !== 402) return null;
  try {
    const body = (await res.clone().json()) as { error?: string; detail?: QuotaMancante };
    if (body.error !== "dem_quota_insufficient" || !body.detail) return null;
    return body.detail;
  } catch {
    return null;
  }
}

/**
 * «Ti servono altri 2.390 invii».
 *
 * Non è un errore: è una decisione da prendere, e una decisione ha bisogno di
 * due strade. La prima è il piano più grande, la seconda è scrivere a meno
 * persone — e sono l'una accanto all'altra perché sono davvero alternative,
 * non una scelta giusta e una scappatoia.
 *
 * Il numero che manca è più utile di quello che c'è: «hai 2.430 invii» fa
 * fare un calcolo, «te ne mancano 2.390» è già la risposta.
 */
export function QuotaInsufficienteDialog({
  quota,
  onClose,
}: {
  quota: QuotaMancante | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={quota !== null} onOpenChange={(aperto) => !aperto && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gli invii disponibili non bastano</DialogTitle>
          <DialogDescription>
            {quota && (
              <>
                Hai {invii(quota.disponibili)} email disponibili questo mese e questa campagna ne
                richiede {invii(quota.richiesti)}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {quota && (
          <p className="text-display text-2xl tabular-nums">
            Ti servono altri {invii(quota.mancanti)} invii
          </p>
        )}

        <p className="t-nota">
          Non ne mandiamo una parte: chi resterebbe fuori verrebbe scelto dal caso, e non lo
          saprebbe nessuno.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Modifica destinatari
          </Button>
          <Button asChild variant="accent">
            <Link href="/settings/marketing/piano/confronto">Scopri i piani</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
