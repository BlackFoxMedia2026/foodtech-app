"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock, Download, Loader2, RefreshCw, Settings2, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAvvisi } from "@/components/ui/avvisi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STATI_DA_SISTEMARE } from "@/server/integrations/cliente";
import type { DettaglioCliente } from "@/server/integrations/vista-cliente";
import { azione, disinstallaIntegrazione, ErroreAzione } from "./azioni";
import { dataOra, Logo, PillolaStato, quando, SegnoAnteprima } from "./segni";
import { WebhookManuale } from "./webhook-manuale";
import { CollegamentiElementi } from "./collegamenti-elementi";
import { AssistenzaCliente } from "./assistenza-cliente";

/**
 * **Un'integrazione collegata, per chi gestisce il ristorante.**
 *
 * In cima la risposta alla domanda per cui si apre la pagina — *sta
 * funzionando?* — con lo stato della connessione, la data e l'ora
 * dell'ultima verifica fatta davvero con il fornitore, e se qualcosa non va
 * la frase che dice cosa fare con il pulsante che lo fa. Tre azioni sempre a
 * portata: **Verifica connessione**, **Riconfigura**, **Disconnetti**.
 *
 * Sotto, **che cosa fa davvero adesso**: gli interruttori accesi, quelli
 * spenti e ciò che è ancora in preparazione, detto così. Un'anteprima lo
 * dice in una riga: le funzioni sono in prova.
 *
 * Niente registro tecnico, niente riferimenti di correlazione, niente stato
 * dei webhook: quelli stanno nella vista interna di Foodtech
 * (/admin/integrazioni).
 */

type Permessi = { configura: boolean; disconnetti: boolean; installa: boolean };

export function GestioneIntegrazione({ dettaglio, permessi }: { dettaglio: DettaglioCliente; permessi: Permessi }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const { voce, installazione: i } = dettaglio;
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [impostazioni, setImpostazioni] = useState(false);
  const [scollega, setScollega] = useState(false);
  const pagina = `/settings/integrations/${voce.slug}`;

  /* Una verifica partita da un'altra scheda (o dall'assistenza Foodtech):
     si ricontrolla fra poco, finché non arriva l'esito. */
  const inVerifica = !!i?.verificaInCorso;
  useEffect(() => {
    if (!inVerifica) return;
    const t = setTimeout(() => router.refresh(), 4000);
    return () => clearTimeout(t);
  }, [inVerifica, router]);

  if (!i) return null;

  async function esegui(chiave: string, corpo: Record<string, unknown>, riuscita: string) {
    setInCorso(chiave);
    try {
      const r = await azione<Record<string, unknown>>(voce.slug, corpo);
      if (chiave === "autorizza" && typeof r.url === "string") {
        window.location.href = r.url;
        return;
      }
      if (chiave === "prova" && r.ok === false) {
        avvisi.problema(`${String(r.titolo)}. ${String(r.spiegazione)}`);
      } else {
        avvisi.mostra(chiave === "sincronizza" && r.giaInCoda ? "Una sincronizzazione è già in corso." : riuscita);
      }
      router.refresh();
    } catch (e) {
      avvisi.problema(e instanceof ErroreAzione ? e.message : "Qualcosa è andato storto. Riprova.");
    } finally {
      setInCorso(null);
    }
  }

  const ricollega =
    voce.accesso === "oauth" ? (
      <Button size="sm" variant="accent" disabled={!!inCorso} onClick={() => esegui("autorizza", { azione: "autorizza" }, "")}>
        Ricollega
      </Button>
    ) : (
      <Button asChild size="sm" variant="accent">
        <Link href={`${pagina}?collega=1&passo=accesso`}>Ricollega</Link>
      </Button>
    );

  const sospesa = i.condizione === "sospesa";
  const puoVerificare = permessi.configura && !sospesa && i.credenzialiPresenti;
  const puoSincronizzare =
    voce.portaDati && permessi.configura && (i.condizione === "attiva" || i.condizione === "da_controllare" || i.condizione === "errore");
  const verifica = inCorso === "prova" || inVerifica;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* ------------------------------------------------------------ */}
      {/*  Sta funzionando?                                            */}
      {/* ------------------------------------------------------------ */}
      <section
        className={cn(
          "riquadro comodo space-y-4 p-5 md:p-6",
          STATI_DA_SISTEMARE.has(dettaglio.stato) ? "border-accent/50 bg-accent/[0.06]" : "bg-card/40",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo src={voce.logo} testo={voce.monogramma} grande />
            <div className="min-w-0">
              <h1 className="truncate text-display text-xl">{voce.nome}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <PillolaStato
                  stato={verifica ? "VERIFICA_IN_CORSO" : dettaglio.stato}
                  etichetta={verifica ? "Verifica in corso" : dettaglio.etichettaStato}
                />
                {dettaglio.anteprima && <SegnoAnteprima />}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {puoVerificare && (
              <Button
                variant="outline"
                size="sm"
                disabled={!!inCorso || inVerifica}
                onClick={() => esegui("prova", { azione: "prova" }, `Connessione con ${voce.nome} verificata.`)}
              >
                {verifica ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                Verifica connessione
              </Button>
            )}
            {permessi.configura && !sospesa && (
              <Button variant="outline" size="sm" onClick={() => setImpostazioni(true)}>
                <Settings2 className="h-4 w-4" aria-hidden="true" /> Riconfigura
              </Button>
            )}
            {permessi.disconnetti && (
              <Button variant="ghost" size="sm" onClick={() => setScollega(true)}>
                <Unplug className="h-4 w-4" aria-hidden="true" /> Disconnetti
              </Button>
            )}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato nome={voce.titoloSede === "Sede e revenue center" ? "Sede" : voce.titoloSede} valore={i.sede ?? i.account ?? "—"} />
          <Dato nome="Ultima verifica" valore={testoVerifica(i)} />
          {voce.portaDati && <Dato nome="Ultima sincronizzazione" valore={testoSincronizzazione(i)} />}
          <Dato
            nome="Collegata dal"
            valore={i.collegataIl ? new Date(i.collegataIl).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "—"}
          />
        </dl>

        <Avviso dettaglio={dettaglio} ricollega={permessi.installa ? ricollega : null} inCorso={inCorso} esegui={esegui} puoConfigurare={permessi.configura} />

        {dettaglio.anteprima && (
          <p className="t-nota">
            Anteprima: stiamo provando {voce.nome} con i primi ristoranti. Qui sotto trovi solo ciò che funziona già; il resto è
            indicato come «in preparazione».
          </p>
        )}
      </section>

      {dettaglio.importabile && permessi.configura && <ProposteImportazione dettaglio={dettaglio} />}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="riquadro comodo space-y-3 bg-card/40">
          <div className="flex items-center justify-between gap-2">
            <h2 className="t-titolo-scheda">Funzionalità disponibili</h2>
            {puoSincronizzare && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!!inCorso}
                onClick={() => esegui("sincronizza", { azione: "sincronizza" }, "Sincronizzazione avviata: i dati arrivano entro un minuto.")}
              >
                {inCorso === "sincronizza" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                Sincronizza ora
              </Button>
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {i.funzionalita.map((f) => (
              <li key={f.etichetta} className={cn("flex items-center justify-between gap-2", f.stato !== "attiva" && "text-muted-foreground")}>
                <span className="min-w-0">{f.etichetta}</span>
                {f.stato === "attiva" ? (
                  <Check className="h-4 w-4 shrink-0 text-sage-strong" aria-label="attiva" />
                ) : f.stato === "spenta" ? (
                  <span className="t-nota shrink-0">spenta</span>
                ) : (
                  <span className="t-nota inline-flex shrink-0 items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> in preparazione
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {voce.portaDati ? (
          <section className="riquadro comodo space-y-3 bg-card/40">
            <h2 className="t-titolo-scheda">Elementi sincronizzati</h2>
            {dettaglio.elementi.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ancora niente: i dati arrivano con la prima sincronizzazione.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {dettaglio.elementi.map((e) => (
                  <li key={e.tipo} className="flex items-center justify-between gap-2">
                    {e.etichetta}
                    <span className="t-dato text-muted-foreground">
                      {e.totale}
                      {e.tipo !== "CATEGORY" && e.daCollegare > 0 && <span className="text-accent-strong"> · {e.daCollegare} da collegare</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="riquadro comodo space-y-2 bg-card/40">
            <h2 className="t-titolo-scheda">Problemi riscontrati</h2>
            <p className="text-sm text-muted-foreground">
              {i.problema ? `${i.problema.titolo}${i.problema.il ? ` · ${dataOra(i.problema.il)}` : ""}` : "Nessun problema rilevato."}
            </p>
          </section>
        )}
      </div>

      {dettaglio.elementi.some((e) => e.tipo !== "CATEGORY") && (
        <CollegamentiElementi
          slug={voce.slug}
          fornitore={voce.nome}
          tipi={dettaglio.elementi.filter((e) => e.tipo !== "CATEGORY").map((e) => ({ tipo: e.tipo, etichetta: e.etichetta, daCollegare: e.daCollegare }))}
          puo={permessi.configura}
        />
      )}

      <AssistenzaCliente dettaglio={dettaglio} puo={permessi.installa} />

      <Impostazioni
        aperta={impostazioni}
        onChiudi={() => setImpostazioni(false)}
        dettaglio={dettaglio}
        permessi={permessi}
        inCorso={inCorso}
        esegui={esegui}
      />

      <Dialog open={scollega} onOpenChange={setScollega}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnettere {voce.nome}?</DialogTitle>
            <DialogDescription>
              {voce.portaDati
                ? "Foodtech smette di sincronizzare e dimentica i dati di accesso e i collegamenti di tavoli e prodotti. Tavoli e menu di Foodtech restano come sono. Potrai ricollegarla quando vuoi."
                : `Foodtech dimentica i dati di accesso e smette di controllare ${voce.nome}. Sul tuo account ${voce.nome} non cambia niente. Potrai ricollegarla quando vuoi.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScollega(false)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={inCorso === "disinstalla"}
              onClick={async () => {
                setInCorso("disinstalla");
                try {
                  await disinstallaIntegrazione(voce.slug);
                  avvisi.mostra(`${voce.nome} disconnessa.`);
                  router.replace("/settings/integrations");
                  router.refresh();
                } catch (e) {
                  avvisi.problema(e instanceof ErroreAzione ? e.message : "Non siamo riusciti a disconnettere. Riprova.");
                  setScollega(false);
                } finally {
                  setInCorso(null);
                }
              }}
            >
              {inCorso === "disinstalla" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Disconnetti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** L'ultima verifica con il fornitore: quando, e com'è andata. */
function testoVerifica(i: NonNullable<DettaglioCliente["installazione"]>): string {
  if (i.verificaInCorso) return "In corso…";
  if (!i.ultimaVerificaIl) return "Mai";
  const q = dataOra(i.ultimaVerificaIl)!;
  return i.ultimaVerificaOk === false ? `${q} · non riuscita` : `${q} · riuscita`;
}

/** Lo stato della sincronizzazione, separato da quello della connessione (la pillola in alto). */
function testoSincronizzazione(i: NonNullable<DettaglioCliente["installazione"]>): string {
  switch (i.sincronizzazione) {
    case "in_attesa":
      return "Prima sincronizzazione in attesa";
    case "in_corso":
      return "In corso…";
    case "non_riuscita":
      return i.ultimaSyncRiuscitaIl ? `Non riuscita · l'ultima riuscita ${quando(i.ultimaSyncRiuscitaIl)}` : "Non riuscita";
    default:
      return quando(i.ultimaSyncRiuscitaIl) ?? "—";
  }
}

function Dato({ nome, valore }: { nome: string; valore: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-etichetta">{nome}</dt>
      <dd className="mt-0.5 break-words">{valore}</dd>
    </div>
  );
}

type Esegui = (chiave: string, corpo: Record<string, unknown>, riuscita: string) => Promise<void>;

/** La frase in cima quando qualcosa va fatto, con il pulsante che lo fa. */
function Avviso({
  dettaglio,
  ricollega,
  inCorso,
  esegui,
  puoConfigurare,
}: {
  dettaglio: DettaglioCliente;
  ricollega: React.ReactNode;
  inCorso: string | null;
  esegui: Esegui;
  puoConfigurare: boolean;
}) {
  const { voce, installazione: i } = dettaglio;
  if (!i) return null;

  let testo: React.ReactNode = null;
  let comando: React.ReactNode = null;
  const rilevato = i.problema?.il ? ` Rilevato il ${dataOra(i.problema.il)}.` : "";

  switch (i.condizione) {
    case "sospesa":
      testo = "Foodtech ha messo in pausa questo collegamento. Scrivi all'assistenza per riattivarlo.";
      break;
    case "in_pausa":
      testo = voce.portaDati
        ? "La sincronizzazione è in pausa: Foodtech non legge niente dalla cassa."
        : `Il collegamento è in pausa: Foodtech non controlla ${voce.nome}.`;
      comando = puoConfigurare ? (
        <Button size="sm" variant="accent" disabled={!!inCorso} onClick={() => esegui("riattiva", { azione: "riattiva" }, `${voce.nome} di nuovo attiva.`)}>
          {inCorso === "riattiva" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Riattiva
        </Button>
      ) : null;
      break;
    case "da_ricollegare":
      testo = i.problema ? `${i.problema.titolo}. ${i.problema.spiegazione}${rilevato}` : `Il collegamento con ${voce.nome} è scaduto.`;
      comando = ricollega;
      break;
    case "errore":
    case "da_controllare":
      testo = i.problema
        ? `${i.problema.titolo}. ${i.problema.spiegazione}${rilevato}`
        : "L'ultima sincronizzazione riuscita è di più di un giorno fa.";
      comando =
        i.problema?.azione === "ricollega" ? (
          ricollega
        ) : i.problema?.azione === "configura" && puoConfigurare ? (
          <Button asChild size="sm" variant="accent">
            <Link href={`/settings/integrations/${voce.slug}?collega=1&passo=sede`}>Controlla le impostazioni</Link>
          </Button>
        ) : puoConfigurare && i.problema?.azione === "riprova" && voce.portaDati ? (
          <Button size="sm" variant="accent" disabled={!!inCorso} onClick={() => esegui("sincronizza", { azione: "sincronizza" }, "Sincronizzazione avviata: i dati arrivano entro un minuto.")}>
            {inCorso === "sincronizza" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Riprova ora
          </Button>
        ) : null;
      break;
    default:
      return null;
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
        <span>{testo}</span>
      </p>
      {comando}
    </div>
  );
}

/** «Abbiamo trovato la configurazione del tuo sistema di cassa.» Solo se Foodtech è vuoto. */
function ProposteImportazione({ dettaglio }: { dettaglio: DettaglioCliente }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [inCorso, setInCorso] = useState(false);
  const [nascosta, setNascosta] = useState(false);
  const p = dettaglio.importabile!;
  if (nascosta) return null;

  const righe = [
    p.tavoli > 0 && `${p.tavoli} ${p.tavoli === 1 ? "tavolo" : "tavoli"}`,
    p.prodotti > 0 && `${p.prodotti} ${p.prodotti === 1 ? "prodotto" : "prodotti"}`,
    p.categorie > 0 && `${p.categorie} ${p.categorie === 1 ? "categoria" : "categorie"}`,
  ].filter(Boolean) as string[];

  return (
    <section className="riquadro comodo flex flex-col gap-4 border-accent/40 bg-accent/[0.06] md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" aria-hidden="true" />
        <div>
          <h2 className="t-titolo-scheda">Abbiamo trovato la configurazione del tuo sistema di cassa</h2>
          <p className="mt-1 text-sm text-muted-foreground">Importa in Foodtech: {righe.join(", ")}.</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          variant="accent"
          disabled={inCorso}
          onClick={async () => {
            setInCorso(true);
            try {
              const r = await azione<{ tavoli: number; prodotti: number }>(dettaglio.voce.slug, {
                azione: "importa",
                tavoli: p.tavoli > 0,
                menu: p.prodotti > 0,
              });
              avvisi.mostra(`Importati ${r.tavoli} tavoli e ${r.prodotti} prodotti.`);
              router.refresh();
            } catch (e) {
              avvisi.problema(e instanceof ErroreAzione ? e.message : "Importazione non riuscita. Riprova.");
            } finally {
              setInCorso(false);
            }
          }}
        >
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Importa
        </Button>
        <Button variant="ghost" onClick={() => setNascosta(true)} disabled={inCorso}>
          Configura manualmente
        </Button>
      </div>
    </section>
  );
}

function Impostazioni({
  aperta,
  onChiudi,
  dettaglio,
  permessi,
  inCorso,
  esegui,
}: {
  aperta: boolean;
  onChiudi: () => void;
  dettaglio: DettaglioCliente;
  permessi: Permessi;
  inCorso: string | null;
  esegui: Esegui;
}) {
  const { voce, installazione: i } = dettaglio;
  const [scelti, setScelti] = useState(new Set(i?.gruppiAccesi ?? []));
  if (!i) return null;
  const pagina = `/settings/integrations/${voce.slug}`;
  const cambiati = scelti.size !== i.gruppiAccesi.length || i.gruppiAccesi.some((g) => !scelti.has(g));

  return (
    <Dialog open={aperta} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Riconfigura {voce.nome}</DialogTitle>
          <DialogDescription>
            {voce.portaDati ? "Che cosa sincronizzare, da dove, e con quale account." : "Quale profilo collegare, e con quale account."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {voce.portaDati && (
            <div className="space-y-2">
              <h3 className="t-etichetta">Cosa sincronizzare</h3>
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {voce.gruppi.map((g) => (
                  <li key={g.chiave}>
                    <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{g.etichetta}</span>
                        <span className="t-nota block">{g.descrizione}</span>
                      </span>
                      <Switch
                        checked={scelti.has(g.chiave)}
                        aria-label={g.etichetta}
                        onCheckedChange={(v) => {
                          const n = new Set(scelti);
                          if (v) n.add(g.chiave);
                          else n.delete(g.chiave);
                          setScelti(n);
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              {cambiati && (
                <Button
                  size="sm"
                  variant="accent"
                  disabled={!!inCorso || scelti.size === 0}
                  onClick={() => esegui("gruppi", { azione: "gruppi", gruppi: [...scelti] }, "Impostazioni salvate.")}
                >
                  {inCorso === "gruppi" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Salva
                </Button>
              )}
            </div>
          )}

          <Riga titolo={voce.titoloSede} valore={i.sede ?? "—"}>
            <Button asChild size="sm" variant="outline">
              <Link href={`${pagina}?collega=1&passo=sede`}>Cambia</Link>
            </Button>
          </Riga>

          {permessi.installa && (
            <Riga titolo="Accesso" valore={i.account ?? "Collegato"}>
              {voce.accesso === "oauth" ? (
                <Button size="sm" variant="outline" disabled={!!inCorso} onClick={() => esegui("autorizza", { azione: "autorizza" }, "")}>
                  Accedi di nuovo
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`${pagina}?collega=1&passo=accesso`}>Aggiorna i dati di accesso</Link>
                </Button>
              )}
            </Riga>
          )}

          {dettaglio.aggiornamenti && (
            <details className="min-w-0 rounded-lg border border-border/60 px-3.5 py-3" open={!dettaglio.aggiornamenti.segretoPresente}>
              <summary className="cursor-pointer text-sm font-medium">Aggiornamenti istantanei (facoltativo)</summary>
              <div className="mt-3">
                <WebhookManuale
                  slug={voce.slug}
                  fornitore={voce.nome}
                  indirizzo={dettaglio.aggiornamenti.indirizzo}
                  segretoPresente={dettaglio.aggiornamenti.segretoPresente}
                  puo={permessi.configura}
                />
              </div>
            </details>
          )}

          {permessi.disconnetti && (i.condizione === "in_pausa" ? null : (
            <Riga titolo="Pausa" valore={voce.portaDati ? "Ferma la sincronizzazione senza scollegare." : "Ferma i controlli senza scollegare."}>
              <Button size="sm" variant="ghost" disabled={!!inCorso} onClick={() => esegui("disattiva", { azione: "disattiva" }, `${voce.nome} in pausa.`)}>
                {inCorso === "disattiva" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Metti in pausa
              </Button>
            </Riga>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onChiudi}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Riga({ titolo, valore, children }: { titolo: string; valore: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="t-etichetta">{titolo}</p>
        <p className="mt-0.5 truncate text-sm">{valore}</p>
      </div>
      {children}
    </div>
  );
}
