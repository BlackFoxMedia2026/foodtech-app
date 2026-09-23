"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CAPACITA, ETICHETTA_CATEGORIA, type Capacita } from "@/server/integrations/tipi";
import type { Dettaglio } from "@/server/integrations/vista";
import { azione, disinstallaIntegrazione, ErroreAzione } from "./azioni";
import { BadgeImplementazione, BadgeStato, Monogramma, PallinoSalute, quando } from "./segni";
import { WebhookManuale } from "./webhook-manuale";
import { ConsoleCertificazione } from "./console-certificazione";

/**
 * **La pagina di un'integrazione installata.**
 *
 * In cima la risposta alla domanda per cui si apre: *sta funzionando?* —
 * stato, ultima sincronizzazione, account e sede collegati, e se qualcosa
 * non va, la frase che dice cosa fare con il pulsante che lo fa. Sotto, sei
 * schede per chi deve fare qualcosa: configurare, sincronizzare, abbinare,
 * leggere il registro, gestire la connessione.
 *
 * Ogni pulsante corrisponde a un'azione vera del servizio, con il suo
 * permesso: chi non lo ha non vede il comando (e il server lo rifiuterebbe
 * comunque — nascondere un pulsante non è un permesso).
 */

type Permessi = { configura: boolean; disconnetti: boolean; installa: boolean; registro: boolean };

const SCHEDE = [
  { id: "panoramica", label: "Panoramica" },
  { id: "configurazione", label: "Configurazione" },
  { id: "sincronizzazione", label: "Sincronizzazione" },
  { id: "mappatura", label: "Mappatura" },
  { id: "log", label: "Log" },
  { id: "connessione", label: "Connessione" },
  { id: "certificazione", label: "Certificazione" },
] as const;
type SchedaId = (typeof SCHEDE)[number]["id"];

const ETICHETTA_TIPO: Record<string, string> = {
  TABLE: "Tavoli",
  FLOOR: "Sale",
  MENU: "Menu",
  CATEGORY: "Categorie",
  PRODUCT: "Prodotti",
  PRICE_LIST: "Listini",
  TAX_RATE: "Aliquote IVA",
  PAYMENT_METHOD: "Metodi di pagamento",
  ORDER: "Ordini",
  PAYMENT: "Pagamenti",
  CUSTOMER: "Clienti",
  RESERVATION: "Prenotazioni",
  LOCATION: "Sedi",
  MODIFIER: "Varianti",
  DISCOUNT: "Sconti",
  SERVICE_CHARGE: "Maggiorazioni di servizio",
  STAFF: "Personale",
};

/** I tipi che si abbinano a una cosa di Foodtech (gli altri sono solo letti). */
const ABBINABILI = new Set(["TABLE", "PRODUCT", "CATEGORY"]);

const ETICHETTA_TRIGGER: Record<string, string> = {
  MANUAL: "A mano",
  WEBHOOK: "Da un evento",
  SCHEDULED: "Programmata",
  INITIAL_IMPORT: "Prima importazione",
  RETRY: "Nuovo tentativo",
};

export function DettaglioIntegrazione({
  dettaglio,
  permessi,
  superAdmin = false,
}: {
  dettaglio: Dettaglio;
  permessi: Permessi;
  /** Solo per i Super Admin: la scheda «Certificazione» (e la rotta risponde 404 a tutti gli altri). */
  superAdmin?: boolean;
}) {
  const router = useRouter();
  const { voce, installazione: i } = dettaglio;
  const [scheda, setScheda] = useState<SchedaId>("panoramica");
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);
  const [conferma, setConferma] = useState(false);

  if (!i) return null;

  async function esegui(chiave: string, corpo: Record<string, unknown>, riuscita: string) {
    setInCorso(chiave);
    setMessaggio(null);
    try {
      const r = await azione<Record<string, unknown>>(voce.slug, corpo);
      if (chiave === "prova" && r.ok === false) {
        setMessaggio({ ok: false, testo: `${r.titolo}. ${r.spiegazione}` });
      } else if (chiave === "autorizza" && typeof r.url === "string") {
        window.location.href = r.url;
        return;
      } else {
        setMessaggio({ ok: true, testo: chiave === "sincronizza" && r.giaInCoda ? "Una sincronizzazione è già in coda." : riuscita });
      }
      router.refresh();
    } catch (e) {
      setMessaggio({ ok: false, testo: e instanceof ErroreAzione ? e.message : "Qualcosa è andato storto." });
    } finally {
      setInCorso(null);
    }
  }

  const operativa = i.status === "ACTIVE" || i.status === "SYNCING" || i.status === "ERROR";
  const schedeVisibili = SCHEDE.filter((s) => (s.id !== "log" || permessi.registro) && (s.id !== "certificazione" || superAdmin));

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ */}
      {/*  La testata: sta funzionando?                                */}
      {/* ------------------------------------------------------------ */}
      <section
        className={cn(
          "riquadro comodo space-y-4 p-5 md:p-6",
          i.problema ? "border-accent/50 bg-accent/[0.06]" : "bg-card/40",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Monogramma testo={voce.monogramma} grande />
            <div>
              <p className="t-etichetta">{ETICHETTA_CATEGORIA[voce.categoria]}</p>
              <h2 className="flex items-center gap-2 text-display text-xl">
                <PallinoSalute salute={i.salute} /> {voce.nome}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <BadgeStato stato={i.status} salute={i.salute} />
                <BadgeImplementazione voce={voce} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {permessi.configura && (
              <Button
                variant="outline"
                size="sm"
                disabled={!!inCorso}
                onClick={() => esegui("prova", { azione: "prova" }, "Connessione riuscita.")}
              >
                {inCorso === "prova" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Testa connessione
              </Button>
            )}
            {permessi.configura && operativa && (
              <Button
                variant="accent"
                size="sm"
                disabled={!!inCorso}
                onClick={() => esegui("sincronizza", { azione: "sincronizza" }, "Sincronizzazione in coda: parte entro un minuto.")}
              >
                {inCorso === "sincronizza" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizza ora
              </Button>
            )}
          </div>
        </div>

        {i.problema && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
              <span>
                <strong>{i.problema.titolo}.</strong> {i.problema.spiegazione}
              </span>
            </p>
            {i.problema.azione === "ricollega" && permessi.installa && voce.autenticazione === "OAUTH2" && (
              <Button
                size="sm"
                variant="accent"
                disabled={!!inCorso}
                onClick={() => esegui("autorizza", { azione: "autorizza" }, "")}
              >
                Ricollega {voce.fornitore}
              </Button>
            )}
            {i.problema.azione === "ricollega" && permessi.installa && voce.autenticazione !== "OAUTH2" && (
              <Button asChild size="sm" variant="accent">
                <Link href={`/settings/integrations/${voce.slug}?installa=1&passo=auth`}>Inserisci di nuovo la chiave</Link>
              </Button>
            )}
            {i.problema.azione === "configura" && permessi.configura && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/settings/integrations/${voce.slug}?installa=1`}>Riconfigura</Link>
              </Button>
            )}
          </div>
        )}

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato nome="Ultima sincronizzazione" valore={quando(i.ultimaSyncIl) ?? "Mai"} />
          <Dato nome="Ultima riuscita" valore={quando(i.ultimaSyncRiuscitaIl) ?? "—"} />
          <Dato nome="Account collegato" valore={i.account ?? "—"} />
          <Dato nome={voce.categoria === "POS" ? "Punto vendita" : "Sede"} valore={i.sede ?? "—"} />
        </dl>

        {messaggio && (
          <p
            role={messaggio.ok ? "status" : "alert"}
            className={cn("flex items-center gap-2 text-sm", messaggio.ok ? "text-sage-strong" : "text-destructive-soft")}
          >
            {messaggio.ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
            {messaggio.testo}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      {/*  Le schede                                                   */}
      {/* ------------------------------------------------------------ */}
      <div role="tablist" aria-label="Sezioni dell'integrazione" className="flex flex-wrap gap-1 border-b border-border">
        {schedeVisibili.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scheda === s.id}
            onClick={() => setScheda(s.id)}
            className={cn(
              "tocco-comodo -mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              scheda === s.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-4">
        {scheda === "panoramica" && <Panoramica dettaglio={dettaglio} />}
        {scheda === "configurazione" && <Configurazione dettaglio={dettaglio} puo={permessi.configura} />}
        {scheda === "sincronizzazione" && (
          <Sincronizzazione dettaglio={dettaglio} puo={permessi.configura} onCambiato={() => router.refresh()} />
        )}
        {scheda === "mappatura" && <Mappatura dettaglio={dettaglio} puo={permessi.configura} />}
        {scheda === "log" && permessi.registro && <Registro dettaglio={dettaglio} />}
        {scheda === "certificazione" && superAdmin && <ConsoleCertificazione slug={dettaglio.voce.slug} />}
        {scheda === "connessione" && (
          <Connessione
            dettaglio={dettaglio}
            permessi={permessi}
            inCorso={inCorso}
            onRicollega={() => esegui("autorizza", { azione: "autorizza" }, "")}
            onDisattiva={() => esegui("disattiva", { azione: "disattiva" }, "Integrazione disattivata.")}
            onRiattiva={() => esegui("riattiva", { azione: "riattiva" }, "Integrazione riattivata.")}
            onDisinstalla={() => setConferma(true)}
          />
        )}
      </div>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disinstallare {voce.nome}?</DialogTitle>
            <DialogDescription>
              Foodtech cancella le credenziali e gli abbinamenti di questo locale. Il registro delle
              sincronizzazioni resta. Per ricollegarla servirà rifare l&apos;installazione.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConferma(false)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={inCorso === "disinstalla"}
              onClick={async () => {
                setInCorso("disinstalla");
                try {
                  await disinstallaIntegrazione(voce.slug);
                  router.replace("/settings/integrations");
                  router.refresh();
                } catch (e) {
                  setMessaggio({ ok: false, testo: e instanceof ErroreAzione ? e.message : "Non riuscita." });
                  setConferma(false);
                } finally {
                  setInCorso(null);
                }
              }}
            >
              {inCorso === "disinstalla" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Disinstalla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Dato({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-etichetta">{nome}</dt>
      <dd className="mt-0.5 truncate">{valore}</dd>
    </div>
  );
}

function Blocco({ titolo, children, azione: comando }: { titolo: string; children: React.ReactNode; azione?: React.ReactNode }) {
  return (
    <section className="riquadro comodo space-y-3 bg-card/40">
      <div className="flex items-center justify-between gap-3">
        <h3 className="t-titolo-scheda">{titolo}</h3>
        {comando}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Panoramica({ dettaglio }: { dettaglio: Dettaglio }) {
  const { voce, installazione: i, mappature } = dettaglio;
  if (!i) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Blocco titolo="Cosa fa per questo locale">
        <ul className="space-y-1.5 text-sm">
          {i.capacitaAccese.length === 0 && <li className="text-muted-foreground">Nessuna sincronizzazione accesa.</li>}
          {i.capacitaAccese.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" />
              {CAPACITA[c as Capacita]?.label ?? c}
            </li>
          ))}
        </ul>
      </Blocco>
      <Blocco titolo="Cosa ha trovato">
        {mappature.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ancora niente: i dati arrivano con la prima sincronizzazione.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {mappature.map((m) => (
              <li key={m.tipo} className="flex items-center justify-between gap-2">
                <span>{ETICHETTA_TIPO[m.tipo] ?? m.tipo}</span>
                <span className="tabular-nums text-muted-foreground">
                  {m.totale}
                  {ABBINABILI.has(m.tipo) && m.daAbbinare > 0 ? ` · ${m.daAbbinare} da abbinare` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Blocco>
      {voce.implementazione !== "IMPLEMENTED" && voce.mancaPerOperare.length > 0 && (
        <Blocco titolo="Prima di usarla sul servizio">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {voce.mancaPerOperare.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
        </Blocco>
      )}
    </div>
  );
}

function Configurazione({ dettaglio, puo }: { dettaglio: Dettaglio; puo: boolean }) {
  const { voce, installazione: i } = dettaglio;
  if (!i) return null;
  return (
    <Blocco
      titolo="Configurazione"
      azione={
        puo ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/settings/integrations/${voce.slug}?installa=1`}>
              <Settings2 className="h-4 w-4" /> Riconfigura
            </Link>
          </Button>
        ) : null
      }
    >
      <dl className="grid gap-2 text-sm sm:grid-cols-[200px_1fr]">
        {voce.configurazione
          .filter((c) => c.tipo !== "segreto")
          .map((c) => (
            <div key={c.chiave} className="contents">
              <dt className="text-muted-foreground">{c.etichetta}</dt>
              <dd>
                {c.opzioniDa === "locations" && i.sede ? `${i.sede} ` : ""}
                <span className="t-nota">{i.configurazione[c.chiave] ?? "—"}</span>
              </dd>
            </div>
          ))}
        <dt className="text-muted-foreground">Versione dell&apos;adattatore</dt>
        <dd>{voce.versioneAdattatore ?? "—"}</dd>
      </dl>
      <p className="t-nota">Cambiare la sede rimette l&apos;integrazione da provare e da riattivare.</p>
    </Blocco>
  );
}

function Sincronizzazione({ dettaglio, puo, onCambiato }: { dettaglio: Dettaglio; puo: boolean; onCambiato: () => void }) {
  const { voce, installazione: i } = dettaglio;
  const [scelte, setScelte] = useState(new Set(i?.capacitaAccese ?? []));
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  if (!i) return null;
  const cambiate =
    scelte.size !== i.capacitaAccese.length || i.capacitaAccese.some((c) => !scelte.has(c));

  return (
    <Blocco titolo="Cosa si sincronizza">
      <ul className="divide-y divide-border/60 rounded-md border border-border">
        {(voce.capacita as Capacita[]).map((c) => (
          <li key={c} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{CAPACITA[c].label}</p>
              <p className="t-nota">{CAPACITA[c].descrizione}</p>
            </div>
            <Switch
              checked={scelte.has(c)}
              disabled={!puo || salvando}
              aria-label={CAPACITA[c].label}
              onCheckedChange={(v) => {
                const n = new Set(scelte);
                if (v) n.add(c);
                else n.delete(c);
                setScelte(n);
              }}
            />
          </li>
        ))}
      </ul>
      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
      {puo && cambiate && (
        <Button
          variant="accent"
          size="sm"
          disabled={salvando || scelte.size === 0}
          onClick={async () => {
            setSalvando(true);
            setErrore(null);
            try {
              await azione(voce.slug, { azione: "capacita", capacita: [...scelte] });
              onCambiato();
            } catch (e) {
              setErrore(e instanceof ErroreAzione ? e.message : "Non salvato.");
            } finally {
              setSalvando(false);
            }
          }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salva
        </Button>
      )}
      <p className="t-nota">
        Foodtech si sincronizza da solo ogni sei ore e dopo l&apos;attivazione. «Sincronizza ora» mette in coda una
        sincronizzazione che parte entro un minuto.
      </p>
    </Blocco>
  );
}

type RigaMappatura = {
  id: string;
  tipo: string;
  esterno: string;
  internalId: string | null;
  interno: string | null;
  manuale: boolean;
};

function Mappatura({ dettaglio, puo }: { dettaglio: Dettaglio; puo: boolean }) {
  const tipi = dettaglio.mappature.map((m) => m.tipo);
  const [tipo, setTipo] = useState<string | null>(tipi.find((t) => ABBINABILI.has(t)) ?? tipi[0] ?? null);
  const [righe, setRighe] = useState<RigaMappatura[] | null>(null);
  const [interni, setInterni] = useState<{ id: string; etichetta: string }[]>([]);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(t: string) {
    setRighe(null);
    const res = await fetch(`/api/integrations/${dettaglio.voce.slug}/mappature?tipo=${t}`);
    if (!res.ok) {
      setErrore("Non riusciamo a leggere le mappature.");
      return;
    }
    const j = (await res.json()) as { righe: RigaMappatura[]; interni: { id: string; etichetta: string }[] };
    setRighe(j.righe);
    setInterni(j.interni);
  }

  useEffect(() => {
    if (tipo) void carica(tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  if (tipi.length === 0) {
    return (
      <p className="riquadro tratteggiato comodo text-sm text-muted-foreground">
        Nessun dato ancora: le mappature compaiono dopo la prima sincronizzazione.
      </p>
    );
  }

  return (
    <Blocco titolo="Cosa corrisponde a cosa">
      <div className="flex flex-wrap gap-1.5">
        {tipi.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              tipo === t ? "border-cream/40 text-cream" : "border-border text-muted-foreground",
            )}
          >
            {ETICHETTA_TIPO[t] ?? t}
          </button>
        ))}
      </div>
      <p className="t-nota">
        Si abbina da solo solo ciò che ha lo stesso nome, e uno solo. Il resto si abbina qui: un abbinamento deciso a
        mano non lo cambia più nessuna sincronizzazione.
      </p>
      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
      {!righe ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carichiamo…
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {righe.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{r.esterno}</span>
              {ABBINABILI.has(r.tipo) ? (
                <div className="flex items-center gap-2">
                  {r.manuale && <Badge tone="info">a mano</Badge>}
                  <Select
                    value={r.internalId ?? "__nessuno"}
                    disabled={!puo}
                    onValueChange={async (v) => {
                      const internalId = v === "__nessuno" ? null : v;
                      setErrore(null);
                      const res = await fetch(`/api/integrations/${dettaglio.voce.slug}/mappature`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ mappingId: r.id, internalId }),
                      });
                      if (!res.ok) {
                        const j = (await res.json().catch(() => ({}))) as { message?: string };
                        setErrore(j.message ?? "Abbinamento non salvato.");
                      }
                      if (tipo) void carica(tipo);
                    }}
                  >
                    <SelectTrigger className="h-9 w-56">
                      <SelectValue placeholder="Da abbinare" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nessuno">Da abbinare</SelectItem>
                      {interni.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.etichetta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="t-nota">letto da {dettaglio.voce.fornitore}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Blocco>
  );
}

function Registro({ dettaglio }: { dettaglio: Dettaglio }) {
  if (dettaglio.registro.length === 0) {
    return <p className="riquadro tratteggiato comodo text-sm text-muted-foreground">Nessuna sincronizzazione ancora.</p>;
  }
  return (
    <Blocco titolo="Ultime sincronizzazioni">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="t-etichetta">
            <tr>
              <th className="py-2 pr-3 font-normal">Quando</th>
              <th className="py-2 pr-3 font-normal">Cosa</th>
              <th className="py-2 pr-3 font-normal">Perché</th>
              <th className="py-2 pr-3 font-normal">Esito</th>
              <th className="py-2 pr-3 text-right font-normal">Elementi</th>
              <th className="py-2 font-normal">Riferimento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {dettaglio.registro.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{quando(r.startedAt)}</td>
                <td className="py-2 pr-3">{r.operation === "full" ? "Tutto" : r.operation}</td>
                <td className="py-2 pr-3">{ETICHETTA_TRIGGER[r.trigger] ?? r.trigger}</td>
                <td className="py-2 pr-3">
                  {r.status === "SUCCEEDED" ? (
                    <Badge tone="success">Riuscita</Badge>
                  ) : r.status === "PARTIAL" ? (
                    <Badge tone="warning">In parte</Badge>
                  ) : r.status === "RUNNING" ? (
                    <Badge tone="info">In corso</Badge>
                  ) : (
                    <Badge tone="danger">{r.problema ?? "Non riuscita"}</Badge>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.itemsSucceeded}
                  {r.itemsFailed ? ` · ${r.itemsFailed} scartati` : ""}
                </td>
                <td className="py-2 font-mono text-xs text-muted-foreground">{r.correlationId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-nota">
        Il riferimento lega ogni riga ai dettagli tecnici che conserviamo per l&apos;assistenza.
      </p>
    </Blocco>
  );
}

function Connessione({
  dettaglio,
  permessi,
  inCorso,
  onRicollega,
  onDisattiva,
  onRiattiva,
  onDisinstalla,
}: {
  dettaglio: Dettaglio;
  permessi: Permessi;
  inCorso: string | null;
  onRicollega: () => void;
  onDisattiva: () => void;
  onRiattiva: () => void;
  onDisinstalla: () => void;
}) {
  const { voce, installazione: i } = dettaglio;
  if (!i) return null;
  const c = i.credenziali;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Blocco titolo="Accesso">
        <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
          <dt className="text-muted-foreground">Credenziali</dt>
          <dd>{c.presenti ? "Salvate, cifrate" : "Nessuna"}</dd>
          <dt className="text-muted-foreground">Permessi concessi</dt>
          <dd>{c.permessi.length ? c.permessi.join(", ") : "—"}</dd>
          <dt className="text-muted-foreground">Accesso valido fino</dt>
          <dd>{c.scadenzaAccesso ? new Date(c.scadenzaAccesso).toLocaleString("it-IT") : "—"}</dd>
          <dt className="text-muted-foreground">Rinnovato</dt>
          <dd>{quando(c.rinnovateIl) ?? "—"}</dd>
          <dt className="text-muted-foreground">Installata</dt>
          <dd>{quando(i.installataIl)}</dd>
        </dl>
        <p className="t-nota">
          L&apos;accesso si rinnova da solo prima di scadere. Le credenziali non si possono leggere da qui, nemmeno da
          chi amministra il locale.
        </p>
        {permessi.installa && voce.autenticazione === "OAUTH2" && (
          <Button variant="outline" size="sm" disabled={!!inCorso} onClick={onRicollega}>
            Ricollega {voce.fornitore}
          </Button>
        )}
        {permessi.installa && voce.autenticazione === "API_KEY" && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/settings/integrations/${voce.slug}?installa=1&passo=auth`}>Sostituisci la chiave API</Link>
          </Button>
        )}
      </Blocco>

      {dettaglio.webhook && (
        <Blocco titolo="Webhook">
          <WebhookManuale
            slug={voce.slug}
            fornitore={voce.nome}
            indirizzo={dettaglio.webhook.indirizzo}
            segretoPresente={dettaglio.webhook.segretoPresente}
            puo={permessi.configura}
          />
        </Blocco>
      )}

      {permessi.disconnetti && (
        <Blocco titolo="Spegnere o togliere">
          <p className="text-sm text-muted-foreground">
            <strong>Disattiva</strong> ferma sincronizzazioni ed eventi, e tiene credenziali e abbinamenti.{" "}
            <strong>Disinstalla</strong> cancella tutto ciò che riguarda questo locale.
          </p>
          <div className="flex flex-wrap gap-2">
            {i.status === "DISABLED" ? (
              <Button variant="outline" size="sm" disabled={!!inCorso || !permessi.configura} onClick={onRiattiva}>
                {inCorso === "riattiva" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Riattiva
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={!!inCorso} onClick={onDisattiva}>
                {inCorso === "disattiva" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Disattiva
              </Button>
            )}
            <Button variant="destructive" size="sm" disabled={!!inCorso} onClick={onDisinstalla}>
              Disinstalla
            </Button>
          </div>
        </Blocco>
      )}
    </div>
  );
}
