import Link from "next/link";
import { ChefHat, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import type { FoodCostReport } from "@/server/food-cost";
import { Base } from "@/components/ui/base-del-numero";

/**
 * Quanto è rimasto, e per merito di cosa.
 *
 * L'elenco è ordinato dal margine più alto al più basso, e questo risponde a
 * due domande con una lista sola: in cima ci sono i piatti che tengono su il
 * conto, in fondo quelli che lo affondano. Nessuna soglia inventata su cosa
 * sia un margine «buono» — cambia troppo fra un antipasto e una bottiglia, e
 * un colore rosso deciso da noi sarebbe un giudizio travestito da dato.
 *
 * La riga sulla copertura non è un avviso tecnico: è la differenza fra «il mio
 * food cost è il 31%» e «il food cost dei piatti di cui ho messo il costo è il
 * 31%, e sono il 60% dell'incasso». La prima frase, se non è vera, fa alzare i
 * prezzi sbagliati.
 */
export function FoodCostPanel({ report, currency }: { report: FoodCostReport; currency: string }) {
  const euro = (c: number) => formatCurrency(c, currency);

  if (report.conti === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto è rimasto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={ChefHat} compact title="Nessun conto chiuso nel periodo">
            Il costo del cibo si calcola sui conti chiusi. Apri un conto dalla scheda della prenotazione in
            Servizio, batti i piatti e incassa: da lì questi numeri diventano veri.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-accent" aria-hidden="true" /> Quanto è rimasto
        </CardTitle>
        <CardDescription>
          {report.conti} {report.conti === 1 ? "conto chiuso" : "conti chiusi"} nel periodo, per{" "}
          {euro(report.incassoCents)} di incasso.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {report.foodCostPct == null ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Non sappiamo il costo di nessuno dei piatti venduti.</p>
            <p className="mt-1">
              Il costo delle materie prime si mette dal <Link href="/menu" className="underline">menu</Link>, piatto
              per piatto. Senza, l&apos;incasso si vede ma non quello che resta.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Materie prime</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{euro(report.costoCents)}</p>
                <p className="text-xs text-muted-foreground">{report.foodCostPct}% del venduto coperto</p>
              </div>
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Resta</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-accent">{euro(report.margineCents)}</p>
                <p className="text-xs text-muted-foreground">{100 - report.foodCostPct}% del venduto coperto</p>
              </div>
              <div className="riquadro p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Su quanto</p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
                  {report.coperturaPct}%
                  <Base
                    base="misurato"
                    dettaglio={`Il ${report.coperturaPct}% dell'incasso ha un costo dichiarato: il food cost è calcolato solo su quella parte, non su tutta la carta.`}
                  />
                </p>
                <p className="text-xs text-muted-foreground">dell&apos;incasso ha un costo dichiarato</p>
              </div>
            </div>

            {report.coperturaPct < 100 && (
              <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {/* La differenza fra «il mio food cost è il 31%» e «il food cost
                    di quello che ho misurato è il 31%». La prima frase, se non
                    è vera, fa alzare i prezzi sbagliati. */}
                Queste percentuali valgono sui {euro(report.incassoCopertoCents)} di cui conosciamo il costo, non
                su tutto l&apos;incasso. Non le estendiamo al resto: sarebbe una moltiplicazione, non una misura.
              </p>
            )}
          </>
        )}

        {report.piatti.length > 0 && (
          <div>
            <p className="text-sm font-medium">Dal margine più alto al più basso</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              In cima i piatti che tengono su il conto, in fondo quelli che lo affondano. Nessuna soglia decisa da
              noi su cosa sia un buon margine: cambia troppo fra un antipasto e una bottiglia.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Piatto</th>
                    <th className="pb-2 text-right font-medium">Venduti</th>
                    <th className="pb-2 text-right font-medium">Incasso</th>
                    <th className="pb-2 text-right font-medium">Costo</th>
                    <th className="pb-2 text-right font-medium">Resta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.piatti.map((p) => (
                    <tr key={p.menuItemId}>
                      <td className="py-2 pr-2">{p.name}</td>
                      <td className="py-2 text-right tabular-nums">{p.quantita}</td>
                      <td className="py-2 text-right tabular-nums">{euro(p.incassoCents)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {euro(p.costoCents ?? 0)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {euro(p.margineCents ?? 0)}
                        <span className="ml-1 text-xs text-muted-foreground">{p.marginePct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report.senzaCosto.length > 0 && (
          <div className="riquadro p-3">
            <p className="text-sm font-medium">
              {report.senzaCosto.length === 1
                ? "Di questo piatto non sappiamo il costo"
                : `Di questi ${report.senzaCosto.length} piatti non sappiamo il costo`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {report.senzaCosto.length === 1 ? "È venduto e incassa" : "Sono venduti e incassano"}, ma senza il
              costo delle materie prime non {report.senzaCosto.length === 1 ? "entra" : "entrano"} nel calcolo. Si
              {report.senzaCosto.length === 1 ? " completa" : " completano"} dal{" "}
              <Link href="/menu?filtro=senza_costo" className="underline">
                menu
              </Link>
              .
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {report.senzaCosto.slice(0, 8).map((p) => (
                <li key={p.menuItemId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {p.quantita} × · {euro(p.incassoCents)}
                  </span>
                </li>
              ))}
              {report.senzaCosto.length > 8 && (
                <li className="text-xs text-tertiary-foreground">e altri {report.senzaCosto.length - 8}</li>
              )}
            </ul>

            {/*
              La terza riga: **cosa posso fare**.

              Questo riquadro diceva già cosa è successo e su cosa è misurato.
              Mancava l'azione — e il collegamento c'era, ma portava sulla carta
              intera, dove ritrovare i cinque piatti fra quaranta era di nuovo
              un lavoro. Adesso arriva con il filtro già acceso.

              La regola che mi sono dato: l'azione si scrive **solo** se porta
              su una schermata con quelle righe dentro. Un consiglio generico —
              «considera di dichiarare i costi» — insegna a saltare la riga.
              Per questo qui c'è e altrove no: è l'unico posto, per adesso,
              dove esiste una destinazione vera.
            */}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/menu?filtro=senza_costo">
                {report.senzaCosto.length === 1 ? "Completa il costo" : "Completa i costi"}
              </Link>
            </Button>
          </div>
        )}

        {report.fuoriCartaCents > 0 && (
          <p className="text-xs text-tertiary-foreground">
            {euro(report.fuoriCartaCents)} arrivano da righe scritte a mano sul conto: un costo non possono
            averlo, e restano fuori dal calcolo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
