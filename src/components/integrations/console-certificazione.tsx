"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * **La console di certificazione di un fornitore.** Solo Super Admin: la
 * pagina la monta solo per loro, e la rotta risponde 404 a tutti gli altri.
 *
 * L'ordine delle sezioni è l'ordine dell'onboarding di una cassa vera:
 * connessione → letture → tavolo e prodotti → ordine di prova → che cosa è
 * successo sul POS → seconda comanda → conto → (se autorizzato) pagamento.
 * Ogni esito sul POS lo dichiara una persona: la console non promuove niente
 * a «POS verificato» da sola.
 */

type Cella = { esito: "PASSED" | "FAILED" | "INCONCLUSIVE" | null; il: string | null; applicabile: boolean };
type Stato = {
  provider: { slug: string; nome: string; implementazione: string; disponibilita: string };
  certificazione: { stato: string; inviaComanda: { pronto: boolean; mancano: string[] } };
  rilascio: string;
  accessoBeta: { abilitato: boolean; operazioniFiscali: boolean; da: string; il: string } | null;
  installazione: { stato: string; salute: string; sede: string | null; account: string | null; sospensione: { da: string; il: string; motivo: string | null } | null } | null;
  capacita: { chiave: string; etichetta: string; fiscale: boolean; richiedeHardware: boolean }[];
  matrice: { capacita: string; etichetta: string; celle: Record<string, Cella> }[];
  pagamento: string | null;
  prove: { id: string; kind: string; status: string; realEnvironment: boolean; externalEntityId: string | null; riferimento: string | null; parentRunId: string | null; createdByEmail: string; createdAt: string }[];
  evidenze: { id: string; capacita: string; livello: string; esito: string; locale: string; sede: string | null; ambiente: string | null; operatore: string; idEsterno: string | null; manuale: boolean; riferimentoProva: string | null; note: string | null; il: string }[];
};
type Tavolo = { externalId: string; etichetta: string };
type Prodotto = { tipo: string; externalId: string; nome: string | null; prezzoCents: number | null; codicePerOrdine: string | null; problema: string | null; indizi: { conVarianti: boolean; conModificatori: boolean }; abbinatoA: string | null; metadata: unknown };
type Anteprima = { provider: string; location: string | null; tavolo: string | null; prodotti: { nome: string; quantita: number; codice: string }[]; importoAttesoCents: number | null; effettiAttesi: string[]; nota: string; frase: string; impronta: string };

const LIVELLI = ["FIXTURE", "PROVIDER_API", "REAL_POS", "REAL_POS_ITALY"] as const;
const ETICHETTA_LIVELLO: Record<string, string> = { FIXTURE: "Fixture", PROVIDER_API: "API", REAL_POS: "POS", REAL_POS_ITALY: "POS IT" };
const ETICHETTA_CERT: Record<string, string> = { PREVIEW: "Anteprima", API_VERIFIED: "API verificata", POS_VERIFIED: "POS verificato", POS_IT_VERIFIED: "POS italiano verificato" };
const FASI = ["INTERNAL", "PRIVATE_BETA", "PUBLIC_BETA", "GENERAL_AVAILABILITY"] as const;
const ETICHETTA_FASE: Record<string, string> = { INTERNAL: "Interna", PRIVATE_BETA: "Beta privata", PUBLIC_BETA: "Beta pubblica", GENERAL_AVAILABILITY: "Disponibile a tutti" };
const LETTURE: [string, string][] = [
  ["locations", "Leggi sedi"],
  ["floors", "Leggi sale"],
  ["tables", "Leggi tavoli"],
  ["menu", "Leggi menu"],
  ["products", "Leggi prodotti"],
  ["tax_rates", "Leggi IVA"],
  ["payment_methods", "Leggi metodi di pagamento"],
];
const euro = (c: number | null | undefined) => (c === null || c === undefined ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const data = (s: string) => new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

async function chiama<T>(slug: string, corpo?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/integrations/${slug}/certificazione`, corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : undefined);
  if (!res.ok) throw new Error(await readApiError(res, "Operazione non riuscita."));
  return (await res.json()) as T;
}

function Json({ valore }: { valore: unknown }) {
  return <pre className="max-h-80 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">{JSON.stringify(valore, null, 2)}</pre>;
}

function Sezione({ titolo, nota, children }: { titolo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="riquadro comodo space-y-3">
      <div>
        <h3 className="t-titolo-sezione">{titolo}</h3>
        {nota && <p className="t-nota mt-1">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

function SegnoCella({ c }: { c: Cella }) {
  if (!c.applicabile) return <span className="text-muted-foreground/50">–</span>;
  if (c.esito === "PASSED") return <span title={c.il ? data(c.il) : undefined} className="font-medium text-sage-strong">✓</span>;
  if (c.esito === "FAILED") return <span title={c.il ? data(c.il) : undefined} className="font-medium text-destructive">✗</span>;
  if (c.esito === "INCONCLUSIVE") return <span className="text-accent">?</span>;
  return <span className="text-muted-foreground">·</span>;
}

export function ConsoleCertificazione({ slug }: { slug: string }) {
  const [stato, setStato] = useState<Stato | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [connessione, setConnessione] = useState<unknown>(null);
  const [lettura, setLettura] = useState<{ risorsa: string; esito: { normalizzata: unknown; grezza: unknown; ambienteVero: boolean; motivoAmbienteFinto: string | null; errore: string | null } } | null>(null);
  const [tavoli, setTavoli] = useState<Tavolo[]>([]);
  const [tavolo, setTavolo] = useState<string>("");
  const [dettaglioTavolo, setDettaglioTavolo] = useState<unknown>(null);
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);
  const [scelti, setScelti] = useState<{ semplice: string; variante: string; modificatore: string }>({ semplice: "", variante: "", modificatore: "" });
  const [anteprima, setAnteprima] = useState<(Anteprima & { parentRunId?: string }) | null>(null);
  const [frase, setFrase] = useState("");
  const [esitoOrdine, setEsitoOrdine] = useState<unknown>(null);
  const [tracciaAperta, setTracciaAperta] = useState<{ run: unknown; passi: { fase: string; titolo: string; il: string; durataMs?: number; dati?: unknown }[] } | null>(null);
  const [conto, setConto] = useState<unknown>(null);
  const [metodi, setMetodi] = useState<{ externalId: string; nome: string }[]>([]);
  const [pagamento, setPagamento] = useState<{ runId: string; importo: string; tender: string; frase: string } | null>(null);

  const ricarica = useCallback(async () => {
    try {
      setStato(await chiama<Stato>(slug));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    }
  }, [slug]);
  useEffect(() => {
    void ricarica();
  }, [ricarica]);

  async function esegui<T>(chiave: string, fn: () => Promise<T>): Promise<T | null> {
    setInCorso(chiave);
    setErrore(null);
    try {
      const r = await fn();
      await ricarica();
      return r;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setInCorso(null);
    }
  }

  const righeScelte = useMemo(
    () => [scelti.semplice, scelti.variante, scelti.modificatore].filter(Boolean).map((externalId) => ({ externalId, quantita: 1 })),
    [scelti],
  );

  if (!stato) {
    return (
      <div className="riquadro comodo text-sm text-muted-foreground">
        {errore ?? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carico la console…
          </span>
        )}
      </div>
    );
  }

  const ordini = stato.prove.filter((p) => p.kind === "TEST_ORDER");
  const seconde = stato.prove.filter((p) => p.kind === "SECOND_ROUND");
  const occupato = (k: string) => inCorso === k;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Console tecnica di Foodtech, visibile solo ai Super Admin. Ogni azione parla con la cassa vera del locale attivo e viene registrata.
      </p>
      {errore && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {errore}
        </p>
      )}

      <Sezione titolo="Stato del fornitore" nota="Implementazione e certificazione sono due cose diverse: il codice può esserci senza che nessuna cassa vera l'abbia provato.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="t-etichetta">Implementazione</dt>
            <dd>{stato.provider.implementazione === "IMPLEMENTED" ? "READY" : "PREVIEW"}</dd>
          </div>
          <div>
            <dt className="t-etichetta">Certificazione</dt>
            <dd>{ETICHETTA_CERT[stato.certificazione.stato] ?? stato.certificazione.stato}</dd>
          </div>
          <div>
            <dt className="t-etichetta">Rilascio</dt>
            <dd>
              <Select
                value={stato.rilascio}
                onValueChange={(fase) => void esegui("fase", () => chiama(slug, { azione: "fase", fase }))}
                disabled={!!inCorso}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FASI.map((f) => (
                    <SelectItem key={f} value={f}>
                      {ETICHETTA_FASE[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
          </div>
          <div>
            <dt className="t-etichetta">«Invia comanda»</dt>
            <dd>{stato.certificazione.inviaComanda.pronto ? "Requisiti POS soddisfatti (non collegato)" : `Mancano su POS: ${stato.certificazione.inviaComanda.mancano.join(", ")}`}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-6 border-t border-border pt-3 text-sm">
          <label className="flex items-center gap-2">
            <Switch
              checked={!!stato.accessoBeta?.abilitato}
              disabled={!!inCorso}
              onCheckedChange={(v) => void esegui("beta", () => chiama(slug, { azione: "beta", abilitato: v, operazioniFiscali: false }))}
            />
            Accesso beta per questo locale
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={!!stato.accessoBeta?.operazioniFiscali}
              disabled={!!inCorso || !stato.accessoBeta?.abilitato}
              onCheckedChange={(v) => void esegui("fiscali", () => chiama(slug, { azione: "beta", abilitato: true, operazioniFiscali: v }))}
            />
            Autorizza operazioni con possibile effetto fiscale
          </label>
          {stato.accessoBeta && <span className="t-nota">Concesso da {stato.accessoBeta.da} il {data(stato.accessoBeta.il)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
          {stato.installazione?.sospensione ? (
            <>
              <span className="text-destructive">
                Sospesa da {stato.installazione.sospensione.da} il {data(stato.installazione.sospensione.il)}
                {stato.installazione.sospensione.motivo ? ` — ${stato.installazione.sospensione.motivo}` : ""}
              </span>
              <Button size="sm" variant="outline" disabled={!!inCorso} onClick={() => void esegui("revoca", () => chiama(slug, { azione: "revoca_sospensione" }))}>
                Revoca sospensione
              </Button>
            </>
          ) : (
            stato.installazione && (
              <Button
                size="sm"
                variant="destructive"
                disabled={!!inCorso}
                onClick={() => {
                  const motivo = window.prompt("Motivo della sospensione (resta nel registro di controllo):");
                  if (motivo !== null) void esegui("sospendi", () => chiama(slug, { azione: "sospendi", motivo }));
                }}
              >
                Sospendi integrazione
              </Button>
            )
          )}
          <span className="t-nota">Ferma ogni operazione verso il fornitore; configurazione e mappature restano. Non è la revoca dell&apos;accesso beta.</span>
        </div>
      </Sezione>

      <Sezione titolo="Matrice di certificazione" nota="Calcolata dalle evidenze registrate: ✓ superata, ✗ fallita, · mai provata, – non applicabile. Vale la prova più recente.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="t-etichetta py-1 pr-4">Capacità</th>
                {LIVELLI.map((l) => (
                  <th key={l} className="t-etichetta px-3 py-1 text-center">
                    {ETICHETTA_LIVELLO[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stato.matrice.map((r) => {
                const c = stato.capacita.find((x) => x.chiave === r.capacita);
                return (
                  <tr key={r.capacita} className="border-t border-border">
                    <td className="py-1.5 pr-4">
                      {r.etichetta}
                      {c?.fiscale && <Badge tone="warning" className="ml-2 text-[10px]">FISCAL_SIDE_EFFECT_POSSIBLE</Badge>}
                    </td>
                    {LIVELLI.map((l) => (
                      <td key={l} className="px-3 py-1.5 text-center">
                        <SegnoCella c={r.celle[l]!} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sezione>

      <Sezione titolo="1. Connessione reale" nota="Chiama il fornitore con le credenziali salvate. Nessun segreto viene mostrato.">
        <Button variant="accent" size="sm" disabled={!!inCorso} onClick={() => void esegui("prova", async () => setConnessione(await chiama(slug, { azione: "prova" })))}>
          {occupato("prova") && <Loader2 className="h-4 w-4 animate-spin" />} Test connessione reale
        </Button>
        {connessione !== null && <Json valore={connessione} />}
      </Sezione>

      <Sezione titolo="2. Letture" nota="Non modificano Foodtech. A sinistra la risposta grezza del fornitore (ripulita da token e dati personali), a destra la versione normalizzata di Foodtech.">
        <div className="flex flex-wrap gap-2">
          {LETTURE.map(([risorsa, etichetta]) => (
            <Button
              key={risorsa}
              variant="outline"
              size="sm"
              disabled={!!inCorso}
              onClick={() =>
                void esegui(`leggi-${risorsa}`, async () => {
                  const esito = await chiama<{ normalizzata: unknown; grezza: unknown; ambienteVero: boolean; motivoAmbienteFinto: string | null; errore: string | null }>(slug, { azione: "leggi", risorsa });
                  setLettura({ risorsa, esito });
                  if (risorsa === "tables" && Array.isArray(esito.normalizzata)) setTavoli(esito.normalizzata as Tavolo[]);
                  if (risorsa === "payment_methods" && Array.isArray(esito.normalizzata)) setMetodi(esito.normalizzata as { externalId: string; nome: string }[]);
                })
              }
            >
              {occupato(`leggi-${risorsa}`) && <Loader2 className="h-4 w-4 animate-spin" />} {etichetta}
            </Button>
          ))}
        </div>
        {lettura && (
          <div className="space-y-2">
            {!lettura.esito.ambienteVero && <p className="t-nota">Ambiente finto: {lettura.esito.motivoAmbienteFinto} Nessuna evidenza API registrata.</p>}
            {lettura.esito.errore && <p className="text-sm text-destructive">Errore: {lettura.esito.errore}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="t-etichetta mb-1">Risposta del fornitore (ripulita)</p>
                <Json valore={lettura.esito.grezza} />
              </div>
              <div>
                <p className="t-etichetta mb-1">Normalizzata da Foodtech</p>
                <Json valore={lettura.esito.normalizzata} />
              </div>
            </div>
          </div>
        )}
      </Sezione>

      <Sezione titolo="3. Tavolo e prodotti di prova" nota="Prima «Leggi tavoli» e una sincronizzazione (i prodotti si scelgono fra quelli importati).">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <p className="t-etichetta mb-1">Tavolo</p>
            <Select value={tavolo} onValueChange={(v) => { setTavolo(v); void esegui("tavolo", async () => setDettaglioTavolo(await chiama(slug, { azione: "tavolo", externalId: v }))); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={tavoli.length ? "Scegli" : "Leggi i tavoli"} />
              </SelectTrigger>
              <SelectContent>
                {tavoli.map((t) => (
                  <SelectItem key={t.externalId} value={t.externalId}>
                    {t.etichetta} ({t.externalId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" disabled={!!inCorso} onClick={() => void esegui("prodotti", async () => setProdotti((await chiama<{ prodotti: Prodotto[] }>(slug, { azione: "prodotti" })).prodotti))}>
            Carica i prodotti importati
          </Button>
        </div>
        {dettaglioTavolo !== null && <Json valore={dettaglioTavolo} />}
        {prodotti.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                ["semplice", "Prodotto semplice"],
                ["variante", "Prodotto con variante"],
                ["modificatore", "Prodotto con modificatore"],
              ] as const
            ).map(([chiave, etichetta]) => {
              const scelto = prodotti.find((p) => p.externalId === scelti[chiave]);
              return (
                <div key={chiave} className="space-y-2">
                  <p className="t-etichetta">{etichetta}</p>
                  <Select value={scelti[chiave]} onValueChange={(v) => setScelti({ ...scelti, [chiave]: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      {prodotti
                        .filter((p) => p.tipo === "PRODUCT")
                        .map((p) => (
                          <SelectItem key={p.externalId} value={p.externalId}>
                            {p.nome ?? p.externalId}
                            {p.indizi.conVarianti ? " · varianti" : ""}
                            {p.indizi.conModificatori ? " · modificatori" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {scelto && (
                    <div className="text-xs">
                      <p>Codice per l&apos;ordine: {scelto.codicePerOrdine ?? "—"}</p>
                      {scelto.problema && <p className="text-destructive">{scelto.problema}</p>}
                      <p>Prezzo: {euro(scelto.prezzoCents)} · Abbinato a Foodtech: {scelto.abbinatoA ? "sì" : "no"}</p>
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Mappatura</summary>
                        <Json valore={scelto.metadata} />
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Sezione>

      <Sezione titolo="4. Ordine di prova" nota="Riferimento riconoscibile ft-test-…, nessun pagamento, nessuna fiscalizzazione. Prima l'anteprima, poi la conferma scritta.">
        <Button
          variant="outline"
          size="sm"
          disabled={!!inCorso || !righeScelte.length}
          onClick={() => void esegui("anteprima", async () => { setFrase(""); setAnteprima(await chiama<Anteprima>(slug, { azione: "anteprima", scelta: { tavoloExternalId: tavolo || null, righe: righeScelte } })); })}
        >
          Anteprima ordine di test
        </Button>
        {anteprima && (
          <div className="space-y-3 rounded-md border border-border p-3 text-sm">
            <dl className="grid gap-2 sm:grid-cols-4">
              <div><dt className="t-etichetta">Provider</dt><dd>{anteprima.provider}</dd></div>
              <div><dt className="t-etichetta">Location</dt><dd>{anteprima.location ?? "—"}</dd></div>
              <div><dt className="t-etichetta">Tavolo</dt><dd>{anteprima.tavolo ?? "nessuno"}</dd></div>
              <div><dt className="t-etichetta">Importo atteso</dt><dd>{euro(anteprima.importoAttesoCents)}</dd></div>
            </dl>
            <ul className="list-disc pl-5">
              {anteprima.prodotti.map((p) => (
                <li key={p.codice}>{p.quantita} × {p.nome} <span className="text-muted-foreground">({p.codice})</span></li>
              ))}
            </ul>
            <div>
              <p className="t-etichetta">Effetti attesi</p>
              <ul className="list-disc pl-5">{anteprima.effettiAttesi.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-xs" value={frase} onChange={(e) => setFrase(e.target.value)} placeholder={`Scrivi «${anteprima.frase}»`} aria-label="Conferma" />
              <Button
                variant="accent"
                size="sm"
                disabled={!!inCorso || frase.trim() !== anteprima.frase}
                onClick={() =>
                  void esegui("ordine", async () => {
                    const conferma = { frase, impronta: anteprima.impronta };
                    const r = anteprima.parentRunId
                      ? await chiama(slug, { azione: "seconda", parentRunId: anteprima.parentRunId, righe: righeScelte, conferma })
                      : await chiama(slug, { azione: "ordine", scelta: { tavoloExternalId: tavolo || null, righe: righeScelte }, conferma });
                    setEsitoOrdine(r);
                    setAnteprima(null);
                  })
                }
              >
                {occupato("ordine") && <Loader2 className="h-4 w-4 animate-spin" />} {anteprima.parentRunId ? "Aggiungi seconda comanda" : "Crea ordine di test"}
              </Button>
            </div>
          </div>
        )}
        {esitoOrdine !== null && <Json valore={esitoOrdine} />}
      </Sezione>

      <Sezione titolo="5. Ordini di prova: traccia, POS, seconda comanda, conto" nota="Le risposte SÌ/NO sono le uniche evidenze su POS vero: dichiarale solo dopo aver guardato la cassa, la stampante o il KDS.">
        {ordini.length === 0 && <p className="t-nota">Nessun ordine di prova su questo locale.</p>}
        {ordini.map((o) => (
          <div key={o.id} className="space-y-2 rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{o.riferimento}</span>
              <Badge tone={o.status === "RIUSCITO" ? "success" : "danger"}>{o.status}</Badge>
              {!o.realEnvironment && <Badge tone="neutral">ambiente finto</Badge>}
              <span className="t-nota">id esterno {o.externalEntityId ?? "—"} · {data(o.createdAt)} · {o.createdByEmail}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!inCorso} onClick={() => void esegui(`traccia-${o.id}`, async () => setTracciaAperta(await chiama(slug, { azione: "traccia", runId: o.id })))}>Traccia</Button>
              <Button variant="outline" size="sm" disabled={!!inCorso || !o.externalEntityId} onClick={() => void esegui(`conto-${o.id}`, async () => setConto(await chiama(slug, { azione: "conto", parentRunId: o.id })))}>Leggi conto</Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!inCorso || !o.externalEntityId || !righeScelte.length}
                onClick={() => void esegui(`seconda-${o.id}`, async () => { setFrase(""); setAnteprima({ ...(await chiama<Anteprima>(slug, { azione: "anteprima_seconda", parentRunId: o.id, righe: righeScelte })), parentRunId: o.id }); })}
              >
                Aggiungi seconda comanda (prodotti scelti sopra)
              </Button>
              <Button variant="outline" size="sm" disabled={!!inCorso || !!stato.pagamento || !o.externalEntityId} title={stato.pagamento ?? undefined} onClick={() => setPagamento({ runId: o.id, importo: "", tender: "", frase: "" })}>
                Pagamento di prova
              </Button>
            </div>
            {o.status === "RIUSCITO" && o.realEnvironment && (
              <div className="space-y-1">
                {(
                  [
                    ["kitchen", "La comanda è stata stampata / inviata al KDS?"],
                    ["create_order", "L'ordine compare sulla cassa?"],
                    ["table_association", "È sul tavolo giusto?"],
                  ] as const
                ).map(([capacita, domanda]) => (
                  <Conferma key={capacita} domanda={domanda} disabilitato={!!inCorso} onRisposta={(risposta, note, riferimentoProva) => void esegui(`conf-${o.id}-${capacita}`, () => chiama(slug, { azione: "conferma", runId: o.id, capacita, livello: "REAL_POS", risposta, note, riferimentoProva }))} />
                ))}
              </div>
            )}
            {seconde
              .filter((s) => s.parentRunId === o.id)
              .map((s) => (
                <div key={s.id} className="ml-4 space-y-1 border-l border-border pl-3">
                  <p>
                    Seconda comanda {s.riferimento} · <Badge tone={s.status === "RIUSCITO" ? "success" : "danger"}>{s.status}</Badge>{" "}
                    <button className="underline" onClick={() => void esegui(`traccia-${s.id}`, async () => setTracciaAperta(await chiama(slug, { azione: "traccia", runId: s.id })))}>traccia</button>
                  </p>
                  {s.status === "RIUSCITO" && s.realEnvironment && (
                    <Conferma domanda="Sono state stampate solo le nuove righe?" disabilitato={!!inCorso} onRisposta={(risposta, note, riferimentoProva) => void esegui(`conf-${s.id}`, () => chiama(slug, { azione: "conferma", runId: s.id, capacita: "add_round", livello: "REAL_POS", risposta, note, riferimentoProva }))} />
                  )}
                </div>
              ))}
          </div>
        ))}
        {conto !== null && (
          <div>
            <p className="t-etichetta mb-1">Conto: atteso da Foodtech, totale del fornitore, differenza (non corretta)</p>
            <Json valore={conto} />
          </div>
        )}
        {tracciaAperta && (
          <div className="space-y-2">
            <p className="t-etichetta">Traccia</p>
            <ol className="space-y-2">
              {tracciaAperta.passi.map((p, n) => (
                <li key={n} className="rounded-md border border-border p-2 text-xs">
                  <p className="font-medium">
                    <span className="uppercase text-muted-foreground">{p.fase}</span> · {p.titolo}
                  </p>
                  <p className="text-muted-foreground">
                    {data(p.il)}
                    {p.durataMs !== undefined ? ` · ${p.durataMs} ms` : ""}
                  </p>
                  {p.dati !== undefined && (
                    <details>
                      <summary className="cursor-pointer">Dettagli</summary>
                      <Json valore={p.dati} />
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Sezione>

      {pagamento && (
        <Sezione titolo="ATTENZIONE — pagamento di prova" nota="Questa operazione potrebbe modificare una vendita reale sul POS e, secondo la configurazione della cassa, chiudere il conto o fiscalizzare. È classificata FISCAL_SIDE_EFFECT_POSSIBLE e registrata nel registro di controllo.">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="t-etichetta">Provider</dt><dd>{stato.provider.nome}</dd></div>
            <div><dt className="t-etichetta">Location</dt><dd>{stato.installazione?.sede ?? "—"}</dd></div>
            <div><dt className="t-etichetta">Ordine / check</dt><dd>{ordini.find((o) => o.id === pagamento.runId)?.externalEntityId}</dd></div>
          </dl>
          <div className="flex flex-wrap items-end gap-2">
            <Input className="w-32" inputMode="decimal" placeholder="Importo €" value={pagamento.importo} onChange={(e) => setPagamento({ ...pagamento, importo: e.target.value })} />
            <Select value={pagamento.tender} onValueChange={(v) => setPagamento({ ...pagamento, tender: v })}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder={metodi.length ? "Tender" : "Leggi i metodi di pagamento"} />
              </SelectTrigger>
              <SelectContent>
                {metodi.map((m) => (
                  <SelectItem key={m.externalId} value={m.externalId}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="max-w-xs" placeholder="Scrivi «CONFERMO PAGAMENTO DI PROVA»" value={pagamento.frase} onChange={(e) => setPagamento({ ...pagamento, frase: e.target.value })} />
            <Button
              variant="destructive"
              size="sm"
              disabled={!!inCorso || pagamento.frase.trim() !== "CONFERMO PAGAMENTO DI PROVA" || !pagamento.tender || !pagamento.importo}
              onClick={() =>
                void esegui("pagamento", async () => {
                  await chiama(slug, { azione: "pagamento", parentRunId: pagamento.runId, importoCents: Math.round(Number(pagamento.importo.replace(",", ".")) * 100), tenderExternalId: pagamento.tender, frase: pagamento.frase });
                  setPagamento(null);
                })
              }
            >
              Invia pagamento di prova
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPagamento(null)}>Annulla</Button>
          </div>
        </Sezione>
      )}

      <Sezione titolo="Evidenze registrate" nota="Immutabili. Una prova ripetuta aggiunge una riga; la matrice legge la più recente.">
        {stato.evidenze.length === 0 ? (
          <p className="t-nota">Nessuna evidenza per questo fornitore.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left">
                  {["Quando", "Capacità", "Livello", "Esito", "Locale", "Id esterno", "Operatore", "Note"].map((h) => (
                    <th key={h} className="t-etichetta py-1 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stato.evidenze.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="py-1 pr-3">{data(e.il)}</td>
                    <td className="pr-3">{e.capacita}</td>
                    <td className="pr-3">{ETICHETTA_LIVELLO[e.livello] ?? e.livello}{e.manuale ? " · manuale" : ""}</td>
                    <td className={cn("pr-3", e.esito === "PASSED" ? "text-sage-strong" : "text-destructive")}>{e.esito}</td>
                    <td className="pr-3">{e.locale}{e.sede ? ` · ${e.sede}` : ""}</td>
                    <td className="pr-3">{e.idEsterno ?? "—"}</td>
                    <td className="pr-3">{e.operatore}</td>
                    <td>{[e.note, e.riferimentoProva].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>
    </div>
  );
}

function Conferma({ domanda, disabilitato, onRisposta }: { domanda: string; disabilitato: boolean; onRisposta: (r: "SI" | "NO", note: string | null, riferimentoProva: string | null) => void }) {
  const [note, setNote] = useState("");
  const [rif, setRif] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-64">{domanda}</span>
      <Input className="h-8 w-48" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <Input className="h-8 w-48" placeholder="Foto / screenshot (riferimento)" value={rif} onChange={(e) => setRif(e.target.value)} />
      <Button size="sm" variant="outline" disabled={disabilitato} onClick={() => onRisposta("SI", note || null, rif || null)}>SÌ</Button>
      <Button size="sm" variant="outline" disabled={disabilitato} onClick={() => onRisposta("NO", note || null, rif || null)}>NO</Button>
    </div>
  );
}
