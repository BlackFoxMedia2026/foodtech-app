"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Loader2, QrCode } from "lucide-react";
import { Blocco } from "@/components/ui/blocco";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createQrCode } from "@/lib/qr-codes-api";
import type { Superficie } from "@/lib/qr-superfici";

/**
 * Le pagine pubbliche che il locale ha già, pronte da mettere su un QR.
 *
 * La pagina dei QR code partiva da un foglio bianco: «Nessun QR code creato»,
 * e poi tocca al ristoratore sapere che cosa collegare e a quale indirizzo —
 * mentre il prodotto quegli indirizzi li conosce tutti.
 *
 * Sta in un blocco che **dichiara il suo valore da chiuso** («2 da creare»),
 * come i blocchi delle impostazioni: si apre solo se c'è qualcosa da fare, e
 * quando sono tutti creati resta una riga sola invece di una colonna di roba
 * già fatta.
 */
export function SuperficiPubbliche({ superfici }: { superfici: Superficie[] }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const daCreare = superfici.filter((s) => s.stato === "pronta").length;
  const daSistemare = superfici.filter((s) => s.stato === "manca").length;

  /* Il valore da chiuso dice la cosa su cui si può agire, e la dice al plurale
     giusto. Se non c'è niente da creare, dice che sono tutte a posto. */
  const valore =
    daCreare > 0
      ? `${daCreare} da creare`
      : daSistemare > 0
        ? `${daSistemare} ${daSistemare === 1 ? "non è pronta" : "non sono pronte"}`
        : "tutte già collegate";

  async function crea(s: Superficie) {
    setErrore(null);
    setInCorso(s.chiave);
    try {
      await createQrCode({
        name: s.nome,
        description: s.descrizione,
        destinationUrl: s.url,
        category: s.categoria,
      });
      router.refresh();
    } catch {
      setErrore(`Non è stato possibile creare il QR di «${s.nome}». Riprova.`);
    } finally {
      setInCorso(null);
    }
  }

  return (
    <Blocco
      titolo="Le tue pagine pubbliche"
      icona={QrCode}
      valore={valore}
      aperto={daCreare > 0 || daSistemare > 0}
    >
      <p className="t-nota">
        Sono le pagine che i tuoi clienti aprono col telefono. Gli indirizzi li sa già il prodotto:
        qui diventano un QR con un tocco.
      </p>

      {errore && <p className="mt-2 text-sm font-medium text-destructive-soft">{errore}</p>}

      <ul className="mt-3 divide-y divide-border">
        {superfici.map((s) => (
          <li
            key={s.chiave}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="t-corpo font-medium">{s.nome}</p>
              <p className="t-nota">{s.descrizione}</p>
              {s.stato === "manca" ? (
                <p className="mt-1 text-xs text-accent-strong">Prima serve: {s.cosaManca}.</p>
              ) : (
                <p className="mt-1 break-all font-mono text-[11px] text-tertiary-foreground">{s.url}</p>
              )}
            </div>

            <div className="shrink-0">
              {s.stato === "pronta" && (
                <Button size="sm" variant="accent" onClick={() => crea(s)} disabled={inCorso !== null}>
                  {inCorso === s.chiave ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creo…
                    </>
                  ) : (
                    "Crea il QR"
                  )}
                </Button>
              )}
              {s.stato === "giaCreato" && (
                <Badge tone="success-soft">
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" /> Già creato
                </Badge>
              )}
              {s.stato === "manca" && s.dove && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={s.dove}>
                    Sistema <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Blocco>
  );
}
