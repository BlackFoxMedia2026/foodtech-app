"use client";

import { useMemo } from "react";
import QRCode from "qrcode";
import { componiQr, livelloCorrezione, matriceDa, type DesignQr, type DisegnoQr } from "@/lib/qr-disegno";
import { controllaQr, qrSalvabile, type Avvertenza } from "@/lib/qr-validazione";

/**
 * Il codice, ricalcolato a ogni tasto.
 *
 * Costruire un QR è puro calcolo: nessuna chiamata, nessuna immagine da
 * generare, nessun momento in cui l'anteprima è «in caricamento». È la ragione
 * per cui l'anteprima può essere davvero **dal vivo** — cambia il colore e il
 * codice è già cambiato — invece di aggiornarsi mezzo secondo dopo.
 *
 * `useMemo` e non uno stato: se non cambia né il contenuto né il disegno, non
 * c'è niente da ricalcolare.
 */
export function useDisegnoQr(
  contenuto: string,
  design: DesignQr,
): {
  disegno: DisegnoQr | null;
  /** Quanti moduli per lato: serve a dire «questo codice è molto fitto». */
  moduli: number | null;
  avvisi: Avvertenza[];
  salvabile: boolean;
} {
  return useMemo(() => {
    let disegno: DisegnoQr | null = null;
    let moduli: number | null = null;

    if (contenuto.trim()) {
      try {
        const codice = QRCode.create(contenuto, { errorCorrectionLevel: livelloCorrezione(design) });
        const matrice = matriceDa(codice.modules as never);
        moduli = matrice.size;
        disegno = componiQr({ matrice, design });
      } catch {
        /* Un contenuto che non ci sta in nessuna versione del formato: lo dice
           l'avviso qui sotto, e l'anteprima resta al suo posto vuoto invece di
           far cadere la pagina. */
        disegno = null;
      }
    }

    const avvisi = controllaQr({ design, contenuto, moduli: moduli ?? undefined });
    if (contenuto.trim() && !disegno) {
      avvisi.unshift({
        chiave: "impossibile",
        messaggio: "Questo contenuto è troppo lungo per stare in un QR code.",
        grave: true,
      });
    }

    return { disegno, moduli, avvisi, salvabile: qrSalvabile(avvisi) && !!disegno };
  }, [contenuto, design]);
}
