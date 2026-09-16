"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MISURE_PNG, scaricaPng, scaricaSvg, type MisuraPng } from "@/lib/qr-export";
import type { DisegnoQr } from "@/lib/qr-disegno";

/**
 * Scaricare.
 *
 * Tre formati, e ognuno è la risposta a una domanda diversa che il ristoratore
 * non si porrà mai con queste parole:
 *
 *  - **PNG**: «devo metterlo in un post». Tre misure, perché 512 basta per uno
 *    schermo e 2048 serve a una locandina;
 *  - **SVG**: «lo do al tipografo». Non ha misura: si ingrandisce quanto si
 *    vuole senza perdere un bordo;
 *  - **PDF**: «lo stampo». Un foglio A4 col codice al centro, già pronto.
 */
export function QrExportMenu({
  disegno,
  nome,
  /** L'indirizzo del PDF: c'è solo per un codice già salvato. */
  urlPdf,
  variant = "outline",
  size = "sm",
  etichetta = "Scarica",
}: {
  disegno: DisegnoQr | null;
  nome: string;
  urlPdf?: string;
  variant?: "accent" | "outline" | "ghost";
  size?: "sm" | "default";
  etichetta?: string;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function esporta(azione: () => Promise<void>) {
    setInCorso(true);
    setErrore(null);
    try {
      await azione();
    } catch {
      setErrore("Non è stato possibile preparare il file. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} disabled={!disegno || inCorso}>
            {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {etichetta}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Immagine (PNG)</DropdownMenuLabel>
          {MISURE_PNG.map((m) => (
            <DropdownMenuItem
              key={m}
              onSelect={() => disegno && esporta(() => scaricaPng(disegno, nome, m as MisuraPng))}
            >
              {m} px
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => disegno && esporta(() => scaricaSvg(disegno, nome))}>
            SVG · per il tipografo
          </DropdownMenuItem>
          {urlPdf && (
            <DropdownMenuItem asChild>
              <a href={urlPdf} download>
                PDF · pronto da stampare
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </div>
  );
}
