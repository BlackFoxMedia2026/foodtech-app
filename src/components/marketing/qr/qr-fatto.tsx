"use client";

import Link from "next/link";
import { Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { nomeDestinazione } from "@/lib/qr-contenuto";
import { etichettaTipo } from "@/lib/qr-tipi";
import type { QrCodeSalvato } from "@/lib/qr-codes-api";
import { QrExportMenu } from "./qr-export-menu";
import { QrPreview } from "./qr-preview";
import { useDisegnoQr } from "./use-disegno-qr";

/**
 * Dopo il salvataggio.
 *
 * Questa schermata esiste per una ragione sola: chi ha appena finito di
 * disegnare un QR **non ha ancora finito**. Gli manca il file. Rimandarlo
 * all'elenco, dove il suo codice è uno fra dieci, vuol dire fargli cercare
 * quello che ha appena fatto per fare la cosa per cui l'ha fatto.
 *
 * Quando i codici sono più d'uno — un tavolo per QR — si mostra il primo e si
 * dice quanti sono: dieci anteprime uguali non aggiungono niente, e il resto
 * si scarica dall'elenco.
 */
export function QrFatto({
  salvati,
  onFine,
}: {
  salvati: QrCodeSalvato[];
  onFine: () => void;
}) {
  const qr = salvati[0];
  const { disegno } = useDisegnoQr(qr.contenuto, qr.design);
  const altri = salvati.length - 1;

  return (
    <div className="mx-auto max-w-lg space-y-5 animate-slide-up">
      <header className="space-y-1 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sage/25">
          <Check className="h-5 w-5 text-cream" aria-hidden="true" />
        </span>
        <h2 className="t-titolo-pagina">QR code pronto</h2>
        {altri > 0 && (
          <p className="text-sm text-muted-foreground">
            Ne sono nati {salvati.length}, uno per tavolo. Qui sotto il primo: gli altri sono in elenco.
          </p>
        )}
      </header>

      <QrPreview disegno={disegno} link={qr.link} compatta />

      <div className="surface space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{qr.name}</p>
          <Badge tone="neutral">{etichettaTipo(qr.kind)}</Badge>
          {qr.tavolo && <Badge tone="neutral">Tavolo {qr.tavolo}</Badge>}
        </div>
        <p className="break-all text-sm text-muted-foreground">{qr.link ?? nomeDestinazione(qr.kind)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <QrExportMenu
          disegno={disegno}
          nome={qr.name}
          urlPdf={`/api/qr-codes/${qr.id}/pdf`}
          variant="accent"
          size="default"
        />
        {qr.link && (
          <CopyButton value={qr.link} variant="outline">
            Copia link
          </CopyButton>
        )}
        <Button variant="outline" asChild>
          <Link href={`/marketing/qr-codes/${qr.id}`}>
            <Pencil className="h-4 w-4" /> Modifica
          </Link>
        </Button>
        <Button variant="ghost" onClick={onFine}>
          Fine
        </Button>
      </div>
    </div>
  );
}
