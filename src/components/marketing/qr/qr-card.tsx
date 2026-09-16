"use client";

import { useState } from "react";
import Link from "next/link";
import { CopyPlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { disegnoInSvg } from "@/lib/qr-svg";
import { etichettaTipo } from "@/lib/qr-tipi";
import { nomeDestinazione } from "@/lib/qr-contenuto";
import { deleteQrCode, duplicateQrCode, type QrCodeSalvato } from "@/lib/qr-codes-api";
import { formatDate } from "@/lib/utils";
import { useDisegnoQr } from "./use-disegno-qr";
import { QrExportMenu } from "./qr-export-menu";

/**
 * Un codice in elenco.
 *
 * Una riga larga e non una cella di tabella: le cose da sapere di un QR sono
 * cinque e quattro sono testo — nome, tipo, dove porta, quando è nato — ma la
 * quinta è **come si vede**, e quella in una tabella non ci sta. La miniatura
 * è il codice vero, disegnato qui: chi ne ha fatti sei con colori diversi li
 * riconosce guardando, non leggendo.
 */
export function QrCard({ qr, onCambiato }: { qr: QrCodeSalvato; onCambiato: () => void }) {
  const { disegno } = useDisegnoQr(qr.contenuto, qr.design);
  const [inCorso, setInCorso] = useState<"elimina" | "duplica" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function elimina() {
    if (!confirm(`Eliminare «${qr.name}»? I codici già stampati smettono di funzionare.`)) return;
    setInCorso("elimina");
    setErrore(null);
    try {
      await deleteQrCode(qr.id);
      onCambiato();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Eliminazione non riuscita.");
    } finally {
      setInCorso(null);
    }
  }

  async function duplica() {
    setInCorso("duplica");
    setErrore(null);
    try {
      await duplicateQrCode(qr.id);
      onCambiato();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Duplicazione non riuscita.");
    } finally {
      setInCorso(null);
    }
  }

  return (
    <article className="surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div
        className="h-24 w-24 shrink-0 self-start overflow-hidden rounded-md border border-border bg-sand-100 p-1.5 [&>svg]:h-full [&>svg]:w-full"
        aria-hidden="true"
        dangerouslySetInnerHTML={disegno ? { __html: disegnoInSvg(disegno) } : undefined}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{qr.name}</p>
          <Badge tone="neutral">{etichettaTipo(qr.kind)}</Badge>
          {qr.tavolo && <Badge tone="neutral">Tavolo {qr.tavolo}</Badge>}
          {!qr.isActive && <Badge tone="neutral">Disattivo</Badge>}
        </div>

        <p className="truncate text-sm text-muted-foreground" title={qr.link ?? undefined}>
          {qr.link ?? nomeDestinazione(qr.kind)}
        </p>

        <p className="t-nota">Creato {formatDate(qr.createdAt)}</p>
        {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <QrExportMenu disegno={disegno} nome={qr.name} urlPdf={`/api/qr-codes/${qr.id}/pdf`} />
        {qr.link && (
          <CopyButton value={qr.link} variant="ghost" size="sm">
            Copia link
          </CopyButton>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/marketing/qr-codes/${qr.id}`}>
            <Pencil className="h-3.5 w-3.5" /> Modifica
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={duplica} disabled={inCorso !== null}>
          {inCorso === "duplica" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CopyPlus className="h-3.5 w-3.5" />
          )}
          Duplica
        </Button>
        <Button variant="ghost" size="sm" onClick={elimina} disabled={inCorso !== null}>
          {inCorso === "elimina" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Elimina
        </Button>
      </div>
    </article>
  );
}
