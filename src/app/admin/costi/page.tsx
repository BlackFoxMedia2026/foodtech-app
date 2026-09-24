import Link from "next/link";
import { elencoCosti, filtraFine, kpiCosti, cicloCorrente, type RigaCosto } from "@/server/costi/piattaforma-costi";
import { FiltriCosti } from "@/components/costi/filtri";
import { BarraBudget } from "@/components/costi/barra-budget";
import { Stati } from "@/components/costi/stati";
import { Aggiorna } from "@/components/costi/aggiorna";
import { RiconciliazioneAws } from "@/components/costi/riconciliazione-aws";
import { SaluteInfrastruttura } from "@/components/costi/salute-infrastruttura";
import { saluteInfrastruttura } from "@/server/costi/salute";
import { accountMascherato } from "@/lib/salute-ses";
import { storicoRiconciliazioni } from "@/server/costi/riconciliazione";
import { euro, euroConSegno } from "@/lib/euro";
import { invii } from "@/lib/dem-piani";
import type { FiltroCosti } from "@/lib/stati-costo";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Costi infrastruttura: quanto ci costano i clienti, tutti insieme.
 *
 * L'ordine di lettura è dichiarato: prima quanto stiamo spendendo contro
 * quanto avevamo deciso di spendere, poi chi è messo peggio. La tabella arriva
 * già ordinata per criticità dal database — chi sta perdendo campagne adesso è
 * la prima riga, senza che nessuno debba ordinarla a mano.
 */
export default async function AdminCostiPage({
  searchParams,
}: {
  searchParams: { filtro?: string; q?: string; piano?: string; pagina?: string; ciclo?: string };
}) {
  const ciclo = searchParams.ciclo ?? cicloCorrente();
  const filtro = (searchParams.filtro ?? "tutti") as FiltroCosti;
  const pagina = Number(searchParams.pagina ?? "1");

  const [elenco, kpi, piani, riconciliazioni, salute] = await Promise.all([
    elencoCosti({ ciclo, filtro, ricerca: searchParams.q, pianoSlug: searchParams.piano, pagina }),
    kpiCosti(ciclo),
    /* I piani dell'elenco sono quelli che esistono: un nome scritto nel codice
       sparirebbe il giorno che il Super Admin ne rinomina uno dal pannello. */
    db.demPlan.findMany({ where: { active: true }, select: { slug: true, name: true }, orderBy: { sortOrder: "asc" } }),
    storicoRiconciliazioni(6),
    /* La fotografia della catena: tenuta in cache cinque minuti, quindi
       aprire la pagina non significa interrogare AWS ogni volta. */
    saluteInfrastruttura(),
  ]);
  const riconciliazione = riconciliazioni.find((r) => r.yearMonth === ciclo) ?? null;
  const righe = filtraFine(elenco.righe, filtro);

  const scostamento = kpi.previsioneTotaleCents - kpi.budgetTotaleCents;
  const criticita = kpi.bloccati + kpi.critici + kpi.nonCalcolabili;
  const pagine = Math.max(1, Math.ceil(elenco.totale / elenco.perPagina));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-titolo-pagina">Costi infrastruttura</h1>
          <p className="t-nota mt-1">
            Ciclo {ciclo} · {kpi.clienti} {kpi.clienti === 1 ? "cliente" : "clienti"} con il modulo attivo.
          </p>
        </div>
        <Aggiorna aggiornatoIl={righe[0]?.aggiornatoIl ?? new Date()} />
      </header>

      {criticita > 0 && (
        <section className="surface border-accent/40 p-4">
          <p className="t-titolo-scheda">
            {criticita} {criticita === 1 ? "criticità" : "criticità"} da guardare
          </p>
          <p className="t-nota mt-1">
            {[
              kpi.bloccati > 0 && `${kpi.bloccati} con gli invii fermi`,
              kpi.critici > 0 && `${kpi.critici} vicini al limite`,
              kpi.nonCalcolabili > 0 && `${kpi.nonCalcolabili} con il costo non calcolabile`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}

      <section className="surface grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Dato etichetta="Costo del ciclo" valore={euro(kpi.costoTotaleCents)} nota="Totale costi variabili" />
        <Dato etichetta="Budget complessivo" valore={euro(kpi.budgetTotaleCents)} nota="Somma dei budget clienti" />
        <Dato
          etichetta="Previsione fine ciclo"
          valore={euro(kpi.previsioneTotaleCents)}
          nota={
            kpi.budgetTotaleCents === 0
              ? "nessun budget configurato"
              : scostamento > 0
                ? `${euroConSegno(scostamento)} sopra il budget`
                : `${euro(Math.abs(scostamento))} sotto il budget`
          }
        />
        <Dato
          etichetta="Clienti"
          valore={String(kpi.clienti)}
          nota={`${kpi.regolari} regolari · ${kpi.attenzione} attenzione · ${kpi.critici} critici · ${kpi.bloccati} bloccati`}
        />
        <Dato etichetta="Email processate" valore={invii(kpi.emailProcessate)} nota="nel ciclo corrente" />
      </section>

      <SaluteInfrastruttura
        dati={{
          salute: salute.salute,
          quando: salute.quando.toISOString(),
          degradata: salute.degradata,
          regione: process.env.AWS_REGION ?? "non impostata",
          account: accountMascherato(process.env.AWS_ACCOUNT_ID),
          ultimaRiconciliazione: riconciliazione?.lettoIl ? riconciliazione.lettoIl.toISOString() : null,
        }}
      />

      {/* Cosa dice Amazon contro cosa abbiamo attribuito noi. Sta sopra la
          tabella perché è la domanda che viene prima: i costi per cliente
          valgono quanto vale il listino che li produce. */}
      {riconciliazione && (
        <RiconciliazioneAws
          dati={{
            ...riconciliazione,
            lettoIl: riconciliazione.lettoIl ? riconciliazione.lettoIl.toISOString() : null,
          }}
        />
      )}

      <FiltriCosti
        filtro={filtro}
        ricerca={searchParams.q ?? ""}
        cicloAttivo={ciclo}
        cicli={cicliDisponibili()}
        piani={piani.map((p) => ({ slug: p.slug, nome: p.name }))}
        pianoAttivo={searchParams.piano ?? ""}
      />

      {righe.length === 0 ? (
        <p className="surface p-8 text-center text-sm text-muted-foreground">
          Nessun cliente corrisponde a questo filtro.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Cliente</Th>
                  <Th>Piano</Th>
                  <Th>Email</Th>
                  <Th>Costo</Th>
                  <Th>Budget</Th>
                  <Th>Utilizzo</Th>
                  <Th>Previsione</Th>
                  <Th>Stato</Th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.venueId} className="border-b border-border/50 hover:bg-veil-5">
                    <Td>
                      <Link href={`/admin/costi/${r.venueId}`} className="hover:underline">
                        {r.locale}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{r.piano}</Td>
                    <Td className="tabular-nums">
                      {invii(r.emailUsati)}
                      <span className="t-nota block">su {invii(r.emailLimite)}</span>
                    </Td>
                    <Td className="tabular-nums">{r.calcolabile ? euro(r.amountCents) : "—"}</Td>
                    <Td className="tabular-nums">{euro(r.budgetCents)}</Td>
                    <Td className="w-40">
                      {r.budgetCents && r.calcolabile ? (
                        <>
                          <BarraBudget
                            spesoCents={r.amountCents ?? 0}
                            impegnatoCents={r.reservedCents}
                            budgetCents={r.budgetCents}
                            warningPct={75}
                            criticalPct={90}
                          />
                          <span className="t-nota tabular-nums">{r.percentuale}%</span>
                        </>
                      ) : (
                        <span className="t-nota">—</span>
                      )}
                    </Td>
                    <Td className="tabular-nums">{euro(r.forecastCents)}</Td>
                    <Td>
                      <Stati etichette={r.etichette} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sul telefono la tabella non si comprime: diventa una scheda per
              cliente, con dentro le quattro cose che servono a decidere se
              aprirlo. */}
          <ul className="space-y-3 lg:hidden">
            {righe.map((r) => (
              <li key={r.venueId} className="surface space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/costi/${r.venueId}`} className="t-titolo-scheda hover:underline">
                    {r.locale}
                  </Link>
                  <span className="text-sm tabular-nums">
                    {r.calcolabile ? euro(r.amountCents) : "—"} / {euro(r.budgetCents)}
                  </span>
                </div>
                {r.budgetCents && r.calcolabile && (
                  <BarraBudget
                    spesoCents={r.amountCents ?? 0}
                    impegnatoCents={r.reservedCents}
                    budgetCents={r.budgetCents}
                    warningPct={75}
                    criticalPct={90}
                  />
                )}
                <p className="t-nota tabular-nums">
                  {r.percentuale !== null ? `${r.percentuale}% · ` : ""}
                  previsione {euro(r.forecastCents)} · {invii(r.emailUsati)} email
                </p>
                <Stati etichette={r.etichette} />
              </li>
            ))}
          </ul>

          {pagine > 1 && (
            <nav className="flex items-center justify-between text-sm">
              <span className="t-nota">
                Pagina {elenco.pagina} di {pagine} · {elenco.totale} clienti
              </span>
              <span className="flex gap-2">
                <Paginetta pagina={elenco.pagina - 1} attiva={elenco.pagina > 1} params={searchParams}>
                  Precedente
                </Paginetta>
                <Paginetta pagina={elenco.pagina + 1} attiva={elenco.pagina < pagine} params={searchParams}>
                  Successiva
                </Paginetta>
              </span>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/** Gli ultimi sei cicli: «questo mese», «mese precedente», e i quattro prima. */
function cicliDisponibili(): { valore: string; testo: string }[] {
  const oggi = new Date();
  const fuori: { valore: string; testo: string }[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - i, 1));
    const valore = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const nome = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    fuori.push({ valore, testo: i === 0 ? `${nome} (in corso)` : nome });
  }
  return fuori;
}

function Paginetta({
  pagina,
  attiva,
  params,
  children,
}: {
  pagina: number;
  attiva: boolean;
  params: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  if (!attiva) return <span className="t-nota">{children}</span>;
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  query.set("pagina", String(pagina));
  return (
    <Link href={`/admin/costi?${query.toString()}`} className="transition-colors hover:text-foreground">
      {children}
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-3 align-top ${className ?? ""}`}>{children}</td>;
}

function Dato({ etichetta, valore, nota }: { etichetta: string; valore: string; nota: string }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className="text-display mt-0.5 text-xl tabular-nums">{valore}</p>
      <p className="t-nota mt-0.5">{nota}</p>
    </div>
  );
}
