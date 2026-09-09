import Link from "next/link";
import { Info, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  MINIMO_VENDITE_PIATTO,
  NOME_QUADRANTE,
  SPIEGAZIONE_QUADRANTE,
  type MenuEngineering,
  type Quadrante,
} from "@/server/menu-engineering";

/**
 * Quali piatti tengo, quali cambio, quali tolgo.
 *
 * Quattro gruppi, ognuno con la sua frase: senza la frase sarebbero quattro
 * parole da manuale, e «cavallo» da solo non dice a nessuno cosa fare lunedì.
 *
 * Il riquadro dice anche **su cosa** ha deciso — quante vendite, quale
 * margine medio, quale soglia di popolarità — perché una classifica che non
 * mostra il proprio metro è un'opinione con l'aria di un dato.
 */

const TONO: Record<Quadrante, string> = {
  stella: "border-sage/40 bg-sage/10",
  cavallo: "border-border bg-current/[0.04]",
  enigma: "border-border bg-current/[0.04]",
  cane: "border-accent/30 bg-accent/10",
};

const ORDINE: Quadrante[] = ["stella", "cavallo", "enigma", "cane"];

export function MenuEngineeringPanel({
  dati,
  currency,
}: {
  dati: MenuEngineering;
  currency: string;
}) {
  const euro = (c: number) => formatCurrency(c, currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-accent" aria-hidden="true" /> Che cosa tiene su la carta
        </CardTitle>
        <CardDescription>
          Quanto piace incrociato con quanto rende, sui piatti di cui conosciamo il costo. Nessun dato nuovo:
          sono i due che ci sono già, messi uno sull&apos;altro.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!dati.abbastanzaDati ? (
          <div className="riquadro p-4 text-sm">
            <p className="font-medium">Ancora presto per dirlo.</p>
            <p className="mt-1 text-muted-foreground">{dati.perche}</p>
            <p className="mt-1 t-nota">
              Preferiamo dire «non lo so» che appiccicare a un piatto l&apos;etichetta di «cane» sulla base di
              due coperti.
            </p>
          </div>
        ) : (
          <>
            {ORDINE.map((q) => {
              const gruppo = dati.piatti.filter((p) => p.quadrante === q);
              if (gruppo.length === 0) return null;
              return (
                <div key={q} className={`rounded-md border p-3 ${TONO[q]}`}>
                  <p className="text-sm font-medium">
                    {NOME_QUADRANTE[q]} · {gruppo.length}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{SPIEGAZIONE_QUADRANTE[q]}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {gruppo.map((p) => (
                      <li key={p.menuItemId ?? p.name} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {p.quantita} venduti · {euro(p.margineUnitCents)} a piatto
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <p className="flex items-start gap-2 t-nota">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Deciso su {dati.vendutiClassificati} piatti venduti: «rende» vuol dire sopra{" "}
              {euro(dati.margineMedioCents)} di margine a piatto, «piace» vuol dire almeno il{" "}
              {dati.sogliaPopolaritaPct}% delle vendite. Sono le soglie del metodo classico, non nostre.
            </p>
          </>
        )}

        {dati.esclusi.length > 0 && (
          <div className="riquadro p-3">
            <p className="text-sm font-medium">
              {dati.esclusi.length === 1 ? "Un piatto resta fuori" : `${dati.esclusi.length} piatti restano fuori`}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {dati.esclusi.slice(0, 8).map((e) => (
                <li key={e.name} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.motivo === "senza_costo"
                      ? "costo non dichiarato"
                      : `venduto ${e.quantita} ${e.quantita === 1 ? "volta" : "volte"}: troppo poco`}
                  </span>
                </li>
              ))}
              {dati.esclusi.length > 8 && (
                <li className="t-nota">e altri {dati.esclusi.length - 8}</li>
              )}
            </ul>
            <p className="mt-2 t-nota">
              I costi si dichiarano dal <Link href="/menu" className="underline">menu</Link>. Sotto{" "}
              {MINIMO_VENDITE_PIATTO} vendite non diciamo niente: il dato non direbbe niente nemmeno lui.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
