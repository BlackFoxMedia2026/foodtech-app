"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";

interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  /**
   * Solo l'icona, dove la parola non ci sta.
   *
   * Nell'elenco dei coupon il codice e il suo tasto vivono in una colonna da
   * 168 px: «Copia» accanto a `COMPLEANNO-GSOY` non entra. L'icona che diventa
   * una spunta è il riscontro per chi vede; per chi non vede, la parola
   * «Copiato» resta — in un'area annunciata, che è l'unico modo di dirlo senza
   * occupare spazio. Senza questo, un tasto icona non avrebbe **nessun**
   * riscontro per chi usa un lettore di schermo.
   */
  soloIcona?: boolean;
}

export function CopyButton({ value, children, soloIcona = false, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" onClick={handleClick} {...props}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {soloIcona ? (
        <span className="sr-only" aria-live="polite">
          {copied ? "Copiato" : ""}
        </span>
      ) : (
        children ?? (copied ? "Copiato" : "Copia")
      )}
    </Button>
  );
}
