import Link from "next/link";
import { notFound } from "next/navigation";
import {
  avvisiDelCliente,
  campagneDelCiclo,
  dettaglioCosti,
  serviziDelCiclo,
  storicoDelCliente,
} from "@/server/costi/dettaglio";
import { storicoOverride } from "@/server/costi/override";
import { BarraBudget } from "@/components/costi/barra-budget";
import { Stati } from "@/components/costi/stati";
import { GraficoCosto } from "@/components/costi/grafico-costo";
import { GestisciLimite } from "@/components/costi/gestisci-limite";
import { Aggiorna } from "@/components/costi/aggiorna";
import { Linguette } from "@/components/costi/linguette";
import { Badge } from "@/components/ui/badge";
import { euro, euroConSegno } from "@/lib/euro";
import { invii } from "@/lib/dem-piani";

export const dynamic = "force-dynamic";

const DATA = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATA_ORA = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" });

/**
 * Un cliente, e cosa sta generando costo.
 *
 * La gerarchia della pagina è quella chiesta e ha una ragione: il dato che
 * decide se intervenire è **costo contro budget**, non il volume di email.
 * Quindi quello sta in cima e occupa spazio; la previsione gli sta accanto
 * perché è l'altra metà della stessa domanda; il dettaglio tecnico — servizi,
 * campagne, storico — viene dopo, per chi vuole capire **perché**.
 */
export default async function CostiClientePage({
  params,
  searchParams,
}: {
  params: { venueId: string };
  searchParams: { tab?: string };
}) {
  const dettaglio = await dettaglioCosti(params.venueId);
  if (!dettaglio) notFound();

  const tab = searchParams.tab === "storico" ? "storico" : "panoramica";

  const [servizi, campagne, avvisi, storico, override] = await Promise.all([
    serviziDelCiclo(params.venueId, dettaglio.ciclo, dettaglio.exchangeRate),
    campagneDelCiclo(params.venueId, dettaglio.ciclo, dettaglio.exchangeRate),
    avvisiDelCliente(params.venueId),
    storicoDelCliente(params.venueId),
    storicoOverride(params.venueId, 20),
  ]);

  const scostamentoPrevisione =
    dettaglio.previsioneCents !== null && dettaglio.budgetCents !== null
      ? dettaglio.previsioneCents - dettaglio.budgetCents
      : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/costi" className="t-nota transition-colors hover:text-foreground">
            ← Costi infrastruttura
          </Link>
          <h1 className="t-titolo-pagina mt-1">{dettaglio.locale}</h1>
          <p className="t-nota mt-1">
            {dettaglio.piano} · ciclo {DATA.format(dettaglio.periodStart)} – {DATA.format(dettaglio.periodEnd)}
          </p>
          <div className="mt-2">
            <Stati etichette={dettaglio.etichette} />
          </div>
          <div className="mt-3">
            <Linguette venueId={dettaglio.venueId} attiva={tab} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Aggiorna aggiornatoIl={dettaglio.aggiornatoIl} venueId={dettaglio.venueId} />
          <GestisciLimite
            venueId={dettaglio.venueId}
            budgetBaseCents={dettaglio.budgetBaseCents}
            overrideBudgetCents={dettaglio.overrideBudgetCents}
            budgetCents={dettaglio.budgetCents}
            emailLimite={dettaglio.emailLimite}
          />
        </div>
      </header>

      {/* §21: un costo che non si sa calcolare non è un costo zero, e la
          pagina deve dirlo prima di mostrare qualunque numero. */}
      {!dettaglio.calcolabile && (
        <section className="surface border-accent/40 p-4">
          <p className="t-titolo-scheda">Costo non disponibile</p>
          <p className="t-nota mt-1">
            {dettaglio.motivoNonCalcolabile === "SENZA_CAMBIO"
              ? `Il consumo c'è (${dettaglio.originalAmount.toFixed(2)} ${dettaglio.originalCurrency}) ma manca il cambio verso ${dettaglio.billingCurrency}: non è possibile determinare il costo del periodo.`
              : "Manca il listino per un servizio consumato: non è possibile determinare il costo del periodo."}
          </p>
        </section>
      )}

      {dettaglio.inviiFermi && (
        <section className="surface border-destructive/40 p-4">
          <p className="t-titolo-scheda">Invii fermi</p>
          <p className="t-nota mt-1">
            {dettaglio.motivoSospensione ??
              "Il budget di infrastruttura del ciclo è esaurito e il piano non consente lo sconfinamento: le nuove campagne vengono rifiutate prima dell'accodamento."}
          </p>
        </section>
      )}

      {tab === "panoramica" && (
       <>
      {/* La carta dominante: costo contro budget. */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="t-etichetta">Consumo del budget</p>
            <p className="text-display mt-1 text-3xl tabular-nums">
              {dettaglio.calcolabile ? euro(dettaglio.amountCents) : "non disponibile"}
              <span className="text-muted-foreground"> / {euro(dettaglio.budgetCents)}</span>
            </p>
          </div>
          {dettaglio.percentuale !== null && (
            <p className="text-display text-2xl tabular-nums">{dettaglio.percentuale}%</p>
          )}
        </div>

        {dettaglio.budgetCents && dettaglio.calcolabile && (
          <BarraBudget
            spesoCents={dettaglio.amountCents ?? 0}
            impegnatoCents={dettaglio.reservedCents}
            budgetCents={dettaglio.budgetCents}
            warningPct={dettaglio.soglie.warningPct}
            criticalPct={dettaglio.soglie.criticalPct}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Dato etichetta="Speso" valore={dettaglio.calcolabile ? euro(dettaglio.amountCents) : "—"} />
          <Dato etichetta="Impegnato" valore={euro(dettaglio.reservedCents)} nota="campagne programmate" />
          <Dato etichetta="Residuo" valore={euro(dettaglio.residuoCents)} />
          <Dato
            etichetta="Budget effettivo"
            valore={euro(dettaglio.budgetCents)}
            nota={
              dettaglio.overrideBudgetCents > 0
                ? `${euro(dettaglio.budgetBaseCents)} di piano + ${euro(dettaglio.overrideBudgetCents)} autorizzati`
                : "dal piano"
            }
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface space-y-2 p-5 lg:col-span-1">
          <p className="t-etichetta">Previsione fine ciclo</p>
          <p className="text-display text-2xl tabular-nums">{euro(dettaglio.previsioneCents)}</p>
          {scostamentoPrevisione !== null && (
            <p className="text-sm">
              {scostamentoPrevisione > 0
                ? `Al ritmo attuale supererebbe il budget di ${euro(scostamentoPrevisione)}.`
                : `Al ritmo attuale resterebbe ${euro(Math.abs(scostamentoPrevisione))} sotto il budget.`}
            </p>
          )}
          <dl className="t-nota space-y-1 pt-1">
            <Riga voce="Media giornaliera" valore={euro(dettaglio.mediaGiornalieraCents)} />
            <Riga voce="Giorni" valore={`${dettaglio.giorniTrascorsi} / ${dettaglio.giorniNelCiclo}`} />
            {/* Il trend compare solo se c'è storia per calcolarlo: §11. */}
            {dettaglio.trendPct !== null && (
              <Riga
                voce="Rispetto alla settimana prima"
                valore={`${dettaglio.trendPct > 0 ? "+" : ""}${dettaglio.trendPct}%`}
              />
            )}
            {!dettaglio.previsioneAttendibile && (
              <p className="pt-1">Troppo presto nel ciclo perché la previsione sia affidabile.</p>
            )}
          </dl>
        </section>

        <section className="surface space-y-3 p-5 lg:col-span-2">
          <p className="t-etichetta">Costo cumulativo nel ciclo</p>
          <GraficoCosto
            serie={dettaglio.serie}
            budgetCents={dettaglio.budgetCents}
            impegnatoCents={dettaglio.reservedCents}
            previsioneCents={dettaglio.previsioneCents}
            giorniNelCiclo={dettaglio.giorniNelCiclo}
          />
        </section>
      </div>

      <section className="surface space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="t-etichetta">Email del ciclo</p>
          <p className="text-sm tabular-nums">
            {invii(dettaglio.emailUsati)} su {invii(dettaglio.emailLimite)}
            {dettaglio.emailRiservati > 0 && ` · ${invii(dettaglio.emailRiservati)} impegnate`}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-titolo-scheda">Dettaglio costi</h2>
        {servizi.length === 0 ? (
          <p className="surface p-6 text-center text-sm text-muted-foreground">
            Nessun consumo registrato in questo ciclo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Servizio</Th>
                  <Th>Utilizzo</Th>
                  <Th>Costo stimato</Th>
                  <Th>Costo reale</Th>
                  <Th>Stato</Th>
                </tr>
              </thead>
              <tbody>
                {servizi.map((s) => (
                  <tr key={s.service} className="border-b border-border/50">
                    <Td>{s.service}</Td>
                    <Td className="tabular-nums">{invii(s.quantita)}</Td>
                    <Td className="tabular-nums">{euro(s.stimatoCents)}</Td>
                    <Td className="tabular-nums">{s.riconciliato ? euro(s.realeCents) : "—"}</Td>
                    <Td>
                      <Badge tone={s.riconciliato ? "success-soft" : "neutral"}>
                        {s.riconciliato ? "Riconciliato" : "Stimato"}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dettaglio.exchangeRate !== null && (
          <p className="t-nota">
            Convertito a 1 {dettaglio.originalCurrency} = {dettaglio.exchangeRate} {dettaglio.billingCurrency}
            {dettaglio.exchangeRateAt && ` · cambio del ${DATA.format(dettaglio.exchangeRateAt)}`}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="t-titolo-scheda">Consumo per campagna</h2>
        {campagne.length === 0 ? (
          <p className="surface p-6 text-center text-sm text-muted-foreground">
            Nessuna campagna in questo ciclo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Campagna</Th>
                  <Th>Stato</Th>
                  <Th>Destinatari</Th>
                  <Th>Inviate</Th>
                  <Th>Impegnato</Th>
                  <Th>Costo</Th>
                  <Th>Data</Th>
                </tr>
              </thead>
              <tbody>
                {campagne.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <Td>
                      <Link href={`/campaigns/${c.id}`} className="hover:underline">{c.nome}</Link>
                    </Td>
                    <Td className="text-muted-foreground">{c.stato}</Td>
                    <Td className="tabular-nums">{invii(c.destinatari)}</Td>
                    <Td className="tabular-nums">{invii(c.inviate)}</Td>
                    <Td className="tabular-nums">{c.riservatoCents > 0 ? euro(c.riservatoCents) : "—"}</Td>
                    <Td className="tabular-nums">{euro(c.costoCents)}</Td>
                    <Td>{c.quando ? DATA.format(c.quando) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4">
        <section className="space-y-3">
          <h2 className="t-titolo-scheda">Avvisi</h2>
          {avvisi.length === 0 ? (
            <p className="surface p-6 text-sm text-muted-foreground">Nessun avviso su questo cliente.</p>
          ) : (
            <ul className="space-y-2">
              {avvisi.map((a) => (
                <li key={a.id} className="surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <span className="t-nota">{DATA_ORA.format(a.createdAt)}</span>
                  </div>
                  {a.body && <p className="t-nota mt-1">{a.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
       </>
      )}

      {tab === "storico" && (
       <>
      <div className="grid gap-4">
        <section className="space-y-3">
          <h2 className="t-titolo-scheda">Storico modifiche</h2>
          {override.length === 0 ? (
            <p className="surface p-6 text-sm text-muted-foreground">Nessuna autorizzazione su questo cliente.</p>
          ) : (
            <ul className="space-y-2">
              {override.map((o) => (
                <li key={o.id} className="surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      {o.kind === "BUDGET"
                        ? `Budget ${euro(o.oldValue)} → ${euro(o.newValue)}`
                        : `Invii ${invii(o.oldValue)} → ${invii(o.newValue)}`}
                    </p>
                    <span className="t-nota">{DATA_ORA.format(o.createdAt)}</span>
                  </div>
                  <p className="t-nota mt-1">
                    {o.actorEmail}
                    {o.note ? ` · ${o.note}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="t-titolo-scheda">Storico mensile</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Ciclo</Th>
                <Th>Email</Th>
                <Th>Costo</Th>
                <Th>Budget</Th>
                <Th>Previsione</Th>
                <Th>Override</Th>
                <Th>Stato</Th>
              </tr>
            </thead>
            <tbody>
              {storico.map((s) => (
                <tr key={s.ciclo} className="border-b border-border/50">
                  <Td>{s.ciclo}</Td>
                  <Td className="tabular-nums">{invii(s.email)}</Td>
                  <Td className="tabular-nums">{euro(s.costoCents)}</Td>
                  <Td className="tabular-nums">{euro(s.budgetCents)}</Td>
                  <Td className="tabular-nums">{euro(s.previsioneCents)}</Td>
                  <Td className="tabular-nums">{s.overrideCents > 0 ? euroConSegno(s.overrideCents) : "—"}</Td>
                  <Td>{s.inCorso ? "In corso" : s.stato}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
       </>
      )}
    </div>
  );
}

function Riga({ voce, valore }: { voce: string; valore: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{voce}</dt>
      <dd className="tabular-nums">{valore}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-3 align-top ${className ?? ""}`}>{children}</td>;
}

function Dato({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className="mt-0.5 text-lg tabular-nums">{valore}</p>
      {nota && <p className="t-nota mt-0.5">{nota}</p>}
    </div>
  );
}
