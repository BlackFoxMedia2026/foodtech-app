"use client";

import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Il vuoto, e una porta sola.
 *
 * Prima qui c'era un rimando a un blocco pieno di scorciatoie che stava sopra:
 * uno stato vuoto che spiegava dov'era la vera funzione. Adesso la funzione è
 * una, e lo stato vuoto la apre — lo stesso identico gesto del pulsante in
 * cima, perché due pulsanti che fanno cose diverse non devono avere due nomi
 * che sembrano uguali.
 */
export function QrEmptyState({ onCrea }: { onCrea: () => void }) {
  return (
    <EmptyState
      icon={QrCode}
      title="Nessun QR code creato"
      action={
        <Button variant="accent" onClick={onCrea}>
          Crea QR code
        </Button>
      }
    >
      Crea il tuo primo QR code per menu, pagamenti, Wi-Fi o altre destinazioni.
    </EmptyState>
  );
}
