"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QrCodeSalvato } from "@/lib/qr-codes-api";
import type { TipoQr } from "@/lib/qr-tipi";
import { QrCard } from "./qr-card";
import { QrEmptyState } from "./qr-empty-state";
import { QrTypeSelector } from "./qr-type-selector";

/**
 * La pagina dei QR code: il titolo, il pulsante, e i codici. Basta.
 *
 * Prima sopra l'elenco c'era un blocco che proponeva le pagine pubbliche del
 * locale da collegare. Era un buon blocco per un prodotto in cui un QR era un
 * link in una casella di testo: serviva a non far cercare l'indirizzo. Adesso
 * l'indirizzo non lo cerca più nessuno — lo mette l'editor, a seconda di cosa
 * si è scelto di creare — e quel blocco sarebbe rimasto a proporre in tre modi
 * diversi la stessa cosa che il pulsante in alto fa in uno.
 */
export function QrLista({ items }: { items: QrCodeSalvato[] }) {
  const router = useRouter();
  const [sceltaAperta, setSceltaAperta] = useState(false);

  function vaiAllEditor(tipo: TipoQr) {
    router.push(`/marketing/qr-codes/nuovo?tipo=${tipo}`);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        {/* Il titolo della pagina lo scrive già la testata del prodotto (vedi
            `shell/nav-items.ts`): ripeterlo qui darebbe due volte la stessa
            parola, e due `h1` nella stessa pagina. Qui resta la riga che dice
            a cosa serve. */}
        <div>
          <p className="t-etichetta">Marketing</p>
          <p className="text-sm text-muted-foreground">
            Un codice da stampare per ogni cosa che i tuoi clienti aprono col telefono.
          </p>
        </div>
        <Button variant="accent" onClick={() => setSceltaAperta(true)}>
          <Plus className="h-4 w-4" /> Nuovo QR code
        </Button>
      </header>

      {items.length === 0 ? (
        <QrEmptyState onCrea={() => setSceltaAperta(true)} />
      ) : (
        <div className="space-y-2.5">
          {items.map((qr) => (
            <QrCard key={qr.id} qr={qr} onCambiato={() => router.refresh()} />
          ))}
        </div>
      )}

      <QrTypeSelector aperto={sceltaAperta} onApertoCambia={setSceltaAperta} onScelta={vaiAllEditor} />
    </div>
  );
}
