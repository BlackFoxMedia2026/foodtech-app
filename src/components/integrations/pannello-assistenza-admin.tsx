"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { RigaAdmin } from "@/server/integrations/vista-assistenza";
import type { StatoCliente } from "@/server/integrations/cliente";
import { dataOra, Logo, PillolaStato } from "./segni";

/**
 * **L'assistenza Foodtech sulle integrazioni di un locale.** Solo Super Admin.
 *
 * Per ogni integrazione: che cosa vede il cliente (lo stesso stato, con le
 * stesse parole), lo stato tecnico, l'ultima verifica, l'ultimo errore con
 * il suo codice e il riassunto già ripulito, le credenziali **solo come
 * metadati** (tipo, permessi, scadenze), il registro con i riferimenti di
 * correlazione. Le azioni:
 *
 * - sempre: **Verifica connessione** (una chiamata vera al fornitore),
 *   beta, collegamento per le credenziali, chiudere la richiesta;
 * - con la delega del cliente: installare, leggere le opzioni, scegliere la
 *   sede, cosa sincronizzare, attivare, sincronizzare, pausa.
 *
 * Il server rifiuta comunque le seconde senza delega: qui i pulsanti si
 * spengono solo per non far provare a vuoto.
 */

export type VoceAdmin = {
  accesso: "oauth" | "modulo" | "nativa";
  titoloSede: string;
  campiSede: {
    chiave: string;
    etichetta: string;
    tipo: string;
    opzioniDa: string | null;
    opzioni: { value: string; label: string }[] | null;
    obbligatorio: boolean;
  }[];
  gruppi: { chiave: string; etichetta: string }[];
};

type Esito = Record<string, unknown>;

async function chiama(venueId: string, corpo: Record<string, unknown>): Promise<Esito> {
  const res = await fetch(`/api/admin/integrazioni/locali/${venueId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Operazione non riuscita."));
  return (await res.json()) as Esito;
}

export function PannelloAssistenzaAdmin({ venueId, righe, voci }: { venueId: string; righe: RigaAdmin[]; voci: Record<string, VoceAdmin> }) {
  if (righe.length === 0) return <p className="t-nota">Nessuna integrazione collegabile per questo locale.</p>;
  return (
    <div className="space-y-4">
      {righe.map((r) => (
        <SchedaAdmin key={r.slug} venueId={venueId} r={r} voce={voci[r.slug] ?? null} />
      ))}
    </div>
  );
}

function SchedaAdmin({ venueId, r, voce }: { venueId: string; r: RigaAdmin; voce: VoceAdmin | null }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [prova, setProva] = useState<Esito | null>(null);
  const [link, setLink] = useState<{ url: string; scadeIl: string } | null>(null);
  const [opzioni, setOpzioni] = useState<Record<string, { value: string; label: string }[]> | null>(null);
  const [valori, setValori] = useState<Record<string, string>>({});
  const [gruppi, setGruppi] = useState<Set<string>>(new Set());
  const i = r.installazione;
  const delega = !!r.assistenza?.delegaFinoAl;

  async function esegui(chiave: string, corpo: Record<string, unknown>, riuscita?: string) {
    setInCorso(chiave);
    try {
      const e = await chiama(venueId, { slug: r.slug, ...corpo });
      if (riuscita) avvisi.mostra(riuscita);
      router.refresh();
      return e;
    } catch (err) {
      avvisi.problema(err instanceof Error ? err.message : "Operazione non riuscita.");
      return null;
    } finally {
      setInCorso(null);
    }
  }

  const attesa = (k: string) => (inCorso === k ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null);
  const serveBeta = r.serveBeta;

  return (
    <section
      className={cn(
        "riquadro comodo space-y-4",
        r.assistenza?.aperta && "border-accent/60",
        (r.statoCliente === "ERRORE_CONNESSIONE" || r.statoCliente === "CREDENZIALI_SCADUTE") && "border-accent/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo src={r.logo} testo={r.monogramma} />
          <div className="min-w-0">
            <h2 className="t-titolo-scheda">{r.nome}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <PillolaStato stato={r.statoCliente as StatoCliente} etichetta={`Il cliente vede: ${r.etichettaStatoCliente}`} />
              <span className="t-nota">
                {r.implementazione} · rilascio {r.fase} · beta {r.betaAbilitata ? "sì" : "no"}
              </span>
            </div>
          </div>
        </div>
        <a href={`/admin/integrazioni/${r.slug}`} className="t-nota underline-offset-4 hover:underline">
          Vista tecnica del fornitore
        </a>
      </div>

      {r.motivoNonInstallabile && r.motivoNonInstallabile.codice !== "native" && (
        <p className="flex items-start gap-2 text-sm text-accent-strong">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Non collegabile: {r.motivoNonInstallabile.codice} — {r.motivoNonInstallabile.messaggio}
        </p>
      )}

      {(r.assistenza || r.richiesta) && (
        <div className="rounded-lg border border-border/70 p-3 text-sm">
          {r.assistenza && (
            <p>
              <strong>{r.assistenza.aperta ? "Assistenza richiesta" : "Delega attiva"}</strong> il {dataOra(r.assistenza.il)}
              {r.assistenza.nota ? ` — «${r.assistenza.nota}»` : ""}
              {r.assistenza.delegaFinoAl ? (
                <span className="ml-1 inline-flex items-center gap-1 text-sage-strong">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Delega a configurare fino al {dataOra(r.assistenza.delegaFinoAl)}
                </span>
              ) : (
                <span className="ml-1 text-muted-foreground">· senza delega: puoi guardare e verificare, non configurare.</span>
              )}
            </p>
          )}
          {r.richiesta && (
            <p className="t-nota mt-1">
              Richiesta {r.richiesta.tipo === "ACCESS" ? "di attivazione" : "di avviso"} del {dataOra(r.richiesta.il)}.
            </p>
          )}
        </div>
      )}

      {i ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Dato nome="Stato tecnico" valore={`${i.status} · salute ${i.salute}`} />
          <Dato nome="Account / sede" valore={[i.account, i.sede].filter(Boolean).join(" · ") || "—"} />
          <Dato
            nome="Ultima verifica"
            valore={i.verificaInCorso ? "In corso…" : i.ultimaVerificaIl ? `${dataOra(i.ultimaVerificaIl)} · ${i.ultimaVerificaOk ? "riuscita" : "non riuscita"}` : "Mai"}
          />
          <Dato nome="Ultima sincronizzazione" valore={i.ultimaSyncIl ? `${dataOra(i.ultimaSyncIl)}${i.ultimaSyncRiuscitaIl === i.ultimaSyncIl ? " · riuscita" : ""}` : "—"} />
          <Dato nome="Attivata" valore={dataOra(i.attivataIl) ?? "no"} />
          <Dato nome="Capacità accese" valore={i.capacita.join(", ") || "nessuna"} />
          <Dato
            nome="Credenziali (mai il valore)"
            valore={
              i.credenziali
                ? `${i.credenziali.tipo} · v${i.credenziali.versione}${i.credenziali.scadeAccesso ? ` · accesso fino al ${dataOra(i.credenziali.scadeAccesso)}` : ""}${i.credenziali.permessi.length ? ` · ${i.credenziali.permessi.join(", ")}` : ""}`
                : "nessuna"
            }
          />
          {i.sospensione && <Dato nome="Sospesa da Foodtech" valore={`${i.sospensione.da} · ${dataOra(i.sospensione.il)}`} />}
          {i.erroreCodice && (
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <dt className="t-etichetta">Ultimo errore</dt>
              <dd className="mt-0.5 text-accent-strong">
                {i.erroreCodice} · {dataOra(i.erroreIl)} {i.frase ? `— ${i.frase}` : ""}
              </dd>
              {i.erroreRiassunto && (
                <details className="mt-1">
                  <summary className="t-nota cursor-pointer">Dettaglio tecnico (ripulito dai segreti)</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-card-sunken p-2 text-xs">{i.erroreRiassunto}</pre>
                </details>
              )}
            </div>
          )}
        </dl>
      ) : (
        <p className="t-nota">Non installata su questo locale.</p>
      )}

      {/* ---------------------------------------------------------- */}
      {/*  Azioni sempre possibili                                    */}
      {/* ---------------------------------------------------------- */}
      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
        {i?.credenziali && (
          <Button
            size="sm"
            variant="accent"
            disabled={!!inCorso}
            onClick={async () => {
              const e = await esegui("prova", { azione: "prova" });
              if (e) setProva(e);
            }}
          >
            {attesa("prova")}
            Verifica connessione
          </Button>
        )}
        {r.betaApplicabile && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!inCorso}
            onClick={() => esegui("beta", { azione: "beta", abilitato: !r.betaAbilitata }, r.betaAbilitata ? "Beta revocata." : "Beta abilitata per questo locale.")}
          >
            {attesa("beta")}
            {r.betaAbilitata ? "Revoca la beta" : "Abilita la beta"}
          </Button>
        )}
        {r.haAdattatore && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!inCorso || serveBeta || !!r.motivoNonInstallabile}
            title={serveBeta ? "Abilita prima la beta" : undefined}
            onClick={async () => {
              const e = await esegui("consegna", { azione: "consegna" });
              if (e && typeof e.url === "string") setLink({ url: e.url, scadeIl: String(e.scadeIl) });
            }}
          >
            {attesa("consegna") ?? <Link2 className="h-4 w-4" aria-hidden="true" />}
            Collegamento per le credenziali
          </Button>
        )}
        {r.assistenza?.aperta && (
          <Button size="sm" variant="ghost" disabled={!!inCorso} onClick={() => esegui("chiudi", { azione: "chiudi_assistenza" }, "Richiesta chiusa.")}>
            {attesa("chiudi")}
            Chiudi la richiesta
          </Button>
        )}
      </div>

      {prova && <EsitoProva e={prova} onChiudi={() => setProva(null)} />}
      {link && <LinkConsegna url={link.url} scadeIl={link.scadeIl} onChiudi={() => setLink(null)} />}

      {r.consegne.length > 0 && (
        <details>
          <summary className="t-nota cursor-pointer">Collegamenti per le credenziali ({r.consegne.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {r.consegne.map((c) => {
              const attivo = !c.completataIl && !c.revocataIl && new Date(c.scadeIl) > new Date();
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {dataOra(c.creataIl)} da {c.creataDa} ·{" "}
                    {c.completataIl
                      ? `credenziali inserite il ${dataOra(c.completataIl)}`
                      : c.revocataIl
                        ? "revocato"
                        : attivo
                          ? `${c.apertaIl ? `aperto il ${dataOra(c.apertaIl)}` : "non ancora aperto"} · scade il ${dataOra(c.scadeIl)}`
                          : "scaduto"}
                  </span>
                  {attivo && (
                    <Button size="sm" variant="ghost" disabled={!!inCorso} onClick={() => esegui("revoca", { azione: "revoca_consegna", id: c.id }, "Collegamento revocato.")}>
                      Revoca
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* ---------------------------------------------------------- */}
      {/*  Con la delega del cliente                                  */}
      {/* ---------------------------------------------------------- */}
      {r.haAdattatore && voce && (
        <details className="rounded-lg border border-border/60 p-3" open={delega && !!i && i.status !== "ACTIVE"}>
          <summary className="cursor-pointer text-sm font-medium">
            Configura per il cliente {delega ? "" : "(serve la delega del cliente)"}
          </summary>
          <div className={cn("mt-3 space-y-3 text-sm", !delega && "opacity-60")}>
            {!i && (
              <Button size="sm" variant="outline" disabled={!delega || !!inCorso} onClick={() => esegui("installa", { azione: "installa" }, "Installazione creata.")}>
                {attesa("installa")}
                Crea l&apos;installazione
              </Button>
            )}
            {i && !i.credenziali && (
              <p className="t-nota">
                Mancano le credenziali: {voce.accesso === "oauth" ? "il cliente deve accedere al fornitore" : "il cliente deve inserirle"} dal
                collegamento per le credenziali.
              </p>
            )}
            {i?.credenziali && voce.campiSede.length > 0 && (
              <div className="space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!delega || !!inCorso}
                  onClick={async () => {
                    const e = await esegui("opzioni", { azione: "opzioni" });
                    if (e) setOpzioni((e.opzioni as Record<string, { value: string; label: string }[]>) ?? {});
                  }}
                >
                  {attesa("opzioni")}
                  Leggi {voce.titoloSede.toLowerCase()} dal fornitore
                </Button>
                {opzioni && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {voce.campiSede.map((c) => {
                      const scelte = c.opzioni ?? (c.opzioniDa ? opzioni[c.opzioniDa] ?? [] : null);
                      return (
                        <label key={c.chiave} className="space-y-1">
                          <span className="t-etichetta block">
                            {c.etichetta}
                            {c.obbligatorio ? " *" : ""}
                          </span>
                          {scelte ? (
                            <select
                              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={valori[c.chiave] ?? ""}
                              onChange={(e) => setValori({ ...valori, [c.chiave]: e.target.value })}
                            >
                              <option value="">—</option>
                              {scelte.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={valori[c.chiave] ?? ""}
                              onChange={(e) => setValori({ ...valori, [c.chiave]: e.target.value })}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {opzioni && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!delega || !!inCorso}
                    onClick={async () => {
                      const etichette: Record<string, string> = {};
                      for (const c of voce.campiSede) {
                        const o = c.opzioniDa ? opzioni[c.opzioniDa]?.find((x) => x.value === valori[c.chiave]) : null;
                        if (o) etichette[c.chiave] = o.label.split(" · ")[0]!;
                      }
                      const ok = await esegui("configura", { azione: "configura", configurazione: valori, etichette }, "Configurazione salvata: ora verifica.");
                      if (ok) {
                        const e = await esegui("prova", { azione: "prova" });
                        if (e) setProva(e);
                      }
                    }}
                  >
                    {attesa("configura")}
                    Salva e verifica
                  </Button>
                )}
              </div>
            )}
            {i?.credenziali && voce.gruppi.length > 0 && (
              <div className="space-y-2">
                <p className="t-etichetta">Che cosa sincronizzare</p>
                <div className="flex flex-wrap gap-3">
                  {voce.gruppi.map((g) => (
                    <label key={g.chiave} className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={gruppi.has(g.chiave)}
                        onChange={(e) => {
                          const n = new Set(gruppi);
                          if (e.target.checked) n.add(g.chiave);
                          else n.delete(g.chiave);
                          setGruppi(n);
                        }}
                      />
                      {g.etichetta}
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!delega || !!inCorso || gruppi.size === 0}
                    onClick={() => esegui("gruppi", { azione: "gruppi", gruppi: [...gruppi] }, "Scelte salvate.")}
                  >
                    {attesa("gruppi")}
                    Salva le scelte
                  </Button>
                  {i.status === "CONNECTED" && (
                    <Button size="sm" variant="accent" disabled={!delega || !!inCorso} onClick={() => esegui("attiva", { azione: "attiva" }, "Integrazione attivata.")}>
                      {attesa("attiva")}
                      Attiva
                    </Button>
                  )}
                  {(i.status === "ACTIVE" || i.status === "ERROR") && (
                    <Button size="sm" variant="outline" disabled={!delega || !!inCorso} onClick={() => esegui("sincronizza", { azione: "sincronizza" }, "Sincronizzazione in coda.")}>
                      {attesa("sincronizza")}
                      Sincronizza ora
                    </Button>
                  )}
                  {i.status === "DISABLED" && (
                    <Button size="sm" variant="outline" disabled={!delega || !!inCorso} onClick={() => esegui("riattiva", { azione: "riattiva" }, "Riattivata.")}>
                      {attesa("riattiva")}
                      Riattiva
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {r.registro.length > 0 && (
        <details>
          <summary className="t-nota cursor-pointer">Registro delle sincronizzazioni ({r.registro.length})</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Quando</th>
                <th className="py-1 pr-2 font-medium">Operazione</th>
                <th className="py-1 pr-2 font-medium">Esito</th>
                <th className="py-1 pr-2 font-medium">Errore</th>
                <th className="py-1 font-medium">Correlazione</th>
              </tr>
            </thead>
            <tbody>
              {r.registro.map((x) => (
                <tr key={x.id} className="border-t border-border/50">
                  <td className="py-1 pr-2">{dataOra(x.il)}</td>
                  <td className="py-1 pr-2">
                    {x.operazione} · {x.origine}
                  </td>
                  <td className="py-1 pr-2">
                    {x.esito} ({x.riusciti}/{x.falliti})
                  </td>
                  <td className="py-1 pr-2">{x.erroreCodice ?? "—"}</td>
                  <td className="py-1 font-mono">{x.correlazione}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function Dato({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-etichetta">{nome}</dt>
      <dd className="mt-0.5 break-words">{valore}</dd>
    </div>
  );
}

function EsitoProva({ e, onChiudi }: { e: Esito; onChiudi: () => void }) {
  const ok = e.ok === true;
  const avvisi = Array.isArray(e.avvisi) ? (e.avvisi as string[]) : [];
  return (
    <div role="status" className={cn("rounded-lg border p-3 text-sm", ok ? "border-border" : "border-accent/50 bg-accent/10")}>
      <p className="font-medium">
        {ok ? `Connessione verificata${e.account ? ` · ${String(e.account)}` : ""}${e.sede ? ` · ${String(e.sede)}` : ""}` : `${String(e.titolo)}. ${String(e.spiegazione)}`}
      </p>
      {avvisi.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {avvisi.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {!ok && typeof e.correlationId === "string" && <p className="t-nota mt-1 font-mono">Correlazione: {e.correlationId}</p>}
      <Button size="sm" variant="ghost" className="mt-1" onClick={onChiudi}>
        Chiudi
      </Button>
    </div>
  );
}

/** Il collegamento in chiaro si vede qui una volta sola: nel database c'è solo la sua impronta. */
function LinkConsegna({ url, scadeIl, onChiudi }: { url: string; scadeIl: string; onChiudi: () => void }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p className="font-medium">Collegamento per le credenziali</p>
      <p className="t-nota">
        Mandalo al referente del locale. Vale fino al {dataOra(scadeIl)}, solo per chi è amministratore del locale, una volta sola. Si vede
        solo adesso: se lo perdi, preparane un altro (il vecchio smette di valere).
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-card-sunken px-2 py-1 text-xs">{url}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopiato(true);
          }}
        >
          {copiato ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copiato ? "Copiato" : "Copia"}
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onChiudi}>
        Chiudi
      </Button>
    </div>
  );
}
