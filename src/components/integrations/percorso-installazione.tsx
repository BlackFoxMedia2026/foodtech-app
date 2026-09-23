"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  KeyRound,
  Loader2,
  PenLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CAPACITA, ETICHETTA_AUTENTICAZIONE, type Capacita } from "@/server/integrations/tipi";
import type { Dettaglio } from "@/server/integrations/vista";
import { azione, ErroreAzione } from "./azioni";
import { Monogramma } from "./segni";
import { WebhookManuale } from "./webhook-manuale";

/**
 * **Il percorso di installazione: sei passi, e ognuno fa una cosa vera.**
 *
 * 1. **Informazioni** — cosa collega, cosa legge, cosa scrive, quali permessi.
 * 2. **Autenticazione** — l'accesso al fornitore (OAuth) o la chiave.
 * 3. **Configurazione** — la sede del fornitore che corrisponde al locale.
 *    Le scelte arrivano **dal fornitore**, con le credenziali appena date.
 * 4. **Prova** — `adapter.provaConnessione()` davvero, e l'esito in chiaro.
 * 5. **Cosa sincronizzare** — solo le capacità che l'adattatore offre.
 * 6. **Attivazione** — solo qui lo stato diventa «Connessa».
 *
 * Il passo a cui si arriva lo decide **lo stato sul server**, non la memoria
 * del browser: chi chiude la scheda a metà e torna domani riparte da dove era.
 * Si può tornare indietro ai passi già fatti; non si salta avanti.
 */

const PASSI = [
  { id: "info", label: "Informazioni" },
  { id: "auth", label: "Autenticazione" },
  { id: "config", label: "Configurazione" },
  { id: "prova", label: "Prova" },
  { id: "capacita", label: "Cosa sincronizzare" },
  { id: "attiva", label: "Attivazione" },
];

const ESITI_OAUTH: Record<string, { ok: boolean; testo: string }> = {
  collegato: { ok: true, testo: "Account collegato. Ora scegli la sede." },
  rifiutato: { ok: false, testo: "L'accesso non è stato concesso dalla pagina del fornitore." },
  scaduto: { ok: false, testo: "Il collegamento è scaduto prima del ritorno: riprova, hai dieci minuti." },
  non_valido: { ok: false, testo: "Il ritorno dal fornitore non è stato riconosciuto. Riprova da questo browser." },
  contesto: { ok: false, testo: "Nel frattempo è cambiato il locale attivo o l'utente. Riprova da qui." },
  sessione: { ok: false, testo: "La sessione è scaduta o il tuo ruolo non consente l'installazione." },
  incompleto: { ok: false, testo: "Il fornitore non ha restituito un'autorizzazione completa. Riprova." },
  scambio: { ok: false, testo: "Il fornitore non ha confermato l'accesso. Riprova tra qualche minuto." },
};

export function passoRaggiunto(d: Dettaglio): number {
  const i = d.installazione;
  if (!i) return 0;
  if (i.status === "INSTALLING" || i.status === "REAUTH_REQUIRED" || !i.credenziali.presenti) return 1;
  if (i.status === "NEEDS_CONFIGURATION") {
    const completa = d.voce.configurazione.every(
      (c) => !c.obbligatorio || c.tipo === "segreto" || c.fase === "autenticazione" || !!i.configurazione[c.chiave],
    );
    return completa ? 3 : 2;
  }
  if (i.status === "CONNECTED") return i.capacitaAccese.length ? 5 : 4;
  return 5;
}

export function PercorsoInstallazione({
  slug,
  dettaglio,
  esitoOAuth,
  passoRichiesto = null,
  puoInstallare,
  puoConfigurare,
}: {
  slug: string;
  dettaglio: Dettaglio;
  esitoOAuth: string | null;
  /** «Sostituisci la chiave» apre direttamente l'autenticazione. */
  passoRichiesto?: number | null;
  puoInstallare: boolean;
  puoConfigurare: boolean;
}) {
  const router = useRouter();
  const { voce, installazione: inst } = dettaglio;
  const raggiunto = passoRaggiunto(dettaglio);
  /* «Riconfigura» su un'integrazione già operativa: si riparte dalla
     configurazione, non dall'ultimo passo. */
  const riconfigura = !!inst && ["ACTIVE", "SYNCING", "ERROR", "DISABLED"].includes(inst.status);
  const [passo, setPasso] = useState(
    passoRichiesto !== null && passoRichiesto <= raggiunto ? passoRichiesto : riconfigura ? 2 : raggiunto,
  );
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<ErroreAzione | null>(null);

  // Quando il server fa avanzare lo stato (dopo un `refresh`), il passo segue.
  // Solo quando cambia: al primo giro vale il passo iniziale scelto sopra.
  const precedente = useRef(raggiunto);
  useEffect(() => {
    if (raggiunto !== precedente.current) {
      precedente.current = raggiunto;
      setPasso((p) => Math.max(p, raggiunto));
    }
  }, [raggiunto]);

  async function esegui<T>(chiave: string, fn: () => Promise<T>): Promise<T | null> {
    setInCorso(chiave);
    setErrore(null);
    try {
      return await fn();
    } catch (e) {
      setErrore(e instanceof ErroreAzione ? e : new ErroreAzione("Qualcosa è andato storto. Riprova.", null, 0));
      return null;
    } finally {
      setInCorso(null);
    }
  }

  const oauth = esitoOAuth ? ESITI_OAUTH[esitoOAuth] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Monogramma testo={voce.monogramma} grande />
          <div>
            <p className="t-etichetta">Installazione</p>
            <h2 className="text-display text-xl">{voce.nome}</h2>
          </div>
        </div>
        <Stepper
          steps={PASSI}
          currentStepIndex={passo}
          furthestStepIndex={raggiunto}
          onStepClick={(n) => n <= raggiunto && setPasso(n)}
          variant="compatto"
        />
      </div>

      {voce.implementazione === "IN_DEVELOPMENT" && (
        <p className="riquadro comodo flex items-start gap-2 border-accent/40 bg-accent/10 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <span>
            <strong>Anteprima.</strong> Il collegamento segue la documentazione ufficiale di {voce.fornitore}, ma non è
            ancora stato provato con un account vero. Usalo su un account di prova prima che su quello del locale.
          </span>
        </p>
      )}

      {voce.notaInstallazione && passo <= 1 && (
        <p className="riquadro comodo flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          {voce.notaInstallazione}
        </p>
      )}

      {oauth && (
        <p
          role="status"
          className={cn(
            "riquadro comodo flex items-start gap-2 text-sm",
            oauth.ok ? "border-sage/50 bg-sage/15" : "border-destructive/40 bg-destructive/10",
          )}
        >
          {oauth.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
          )}
          {oauth.testo}
        </p>
      )}

      {errore && (
        <div role="alert" className="riquadro comodo flex items-start gap-2 border-destructive/40 bg-destructive/10 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
          <div className="space-y-2">
            <p>{errore.message}</p>
            {errore.azione === "ricollega" && passo !== 1 && (
              <Button size="sm" variant="outline" onClick={() => setPasso(1)}>
                Ricollega {voce.fornitore}
              </Button>
            )}
          </div>
        </div>
      )}

      <section className="riquadro comodo space-y-4 bg-card/40 p-5 md:p-6">
        {passo === 0 && (
          <PassoInformazioni
            dettaglio={dettaglio}
            puoInstallare={puoInstallare}
            inCorso={inCorso === "installa"}
            onAvanti={async () => {
              if (!inst) {
                const ok = await esegui("installa", () => azione(slug, { azione: "installa" }));
                if (!ok) return;
                router.refresh();
              }
              setPasso(1);
            }}
          />
        )}

        {passo === 1 && (
          <PassoAutenticazione
            dettaglio={dettaglio}
            puoInstallare={puoInstallare}
            inCorso={inCorso === "autorizza" || inCorso === "connetti"}
            onAutorizza={async () => {
              const r = await esegui("autorizza", () => azione<{ url: string }>(slug, { azione: "autorizza" }));
              if (r?.url) window.location.href = r.url;
            }}
            onConnetti={async (campi) => {
              const ok = await esegui("connetti", () => azione(slug, { azione: "connetti", campi }));
              if (ok) {
                router.refresh();
                setPasso(2);
              }
            }}
            onAvanti={() => setPasso(2)}
          />
        )}

        {passo === 2 && (
          <PassoConfigurazione
            slug={slug}
            dettaglio={dettaglio}
            puoConfigurare={puoConfigurare}
            esegui={esegui}
            inCorso={inCorso}
            onSalvato={() => {
              router.refresh();
              setPasso(3);
            }}
          />
        )}

        {passo === 3 && (
          <PassoProva
            slug={slug}
            dettaglio={dettaglio}
            puoConfigurare={puoConfigurare}
            esegui={esegui}
            inCorso={inCorso === "prova"}
            onRicollega={() => setPasso(1)}
            onAvanti={() => {
              router.refresh();
              setPasso(4);
            }}
          />
        )}

        {passo === 4 && (
          <PassoCapacita
            dettaglio={dettaglio}
            puoConfigurare={puoConfigurare}
            inCorso={inCorso === "capacita"}
            onSalva={async (capacita) => {
              const ok = await esegui("capacita", () => azione(slug, { azione: "capacita", capacita }));
              if (ok) {
                router.refresh();
                setPasso(5);
              }
            }}
          />
        )}

        {passo === 5 && (
          <PassoAttivazione
            dettaglio={dettaglio}
            puoConfigurare={puoConfigurare}
            inCorso={inCorso === "attiva"}
            onAttiva={async () => {
              const ok = await esegui("attiva", () => azione(slug, { azione: "attiva" }));
              if (ok) {
                router.replace(`/settings/integrations/${slug}`);
                router.refresh();
              }
            }}
          />
        )}
      </section>

      {passo > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setPasso(passo - 1)}>
          <ArrowLeft className="h-4 w-4" /> Passo precedente
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I passi                                                                   */
/* -------------------------------------------------------------------------- */

function Elenco({ titolo, icona: Icona, voci }: { titolo: string; icona: typeof Eye; voci: string[] }) {
  if (voci.length === 0) return null;
  return (
    <div>
      <p className="t-etichetta mb-1.5 flex items-center gap-1.5">
        <Icona className="h-3.5 w-3.5" aria-hidden="true" /> {titolo}
      </p>
      <ul className="space-y-1 text-sm">
        {voci.map((v) => (
          <li key={v} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PassoInformazioni({
  dettaglio,
  puoInstallare,
  inCorso,
  onAvanti,
}: {
  dettaglio: Dettaglio;
  puoInstallare: boolean;
  inCorso: boolean;
  onAvanti: () => void;
}) {
  const v = dettaglio.voce;
  return (
    <>
      <div>
        <h3 className="t-titolo-sezione">Cosa collega</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{v.descrizione}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Elenco titolo="Legge" icona={Eye} voci={v.dati.legge} />
        <Elenco titolo="Scrive" icona={PenLine} voci={v.dati.scrive} />
        <Elenco titolo="Permessi richiesti" icona={ShieldCheck} voci={v.dati.permessi} />
      </div>
      {v.risorse.length > 0 && (
        <details className="riquadro comodo text-sm">
          <summary className="cursor-pointer font-medium">Cosa permette davvero l&apos;API di {v.fornitore}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="t-etichetta">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Risorsa</th>
                  <th className="py-1.5 pr-3 font-normal">Lettura</th>
                  <th className="py-1.5 pr-3 font-normal">Scrittura</th>
                  <th className="py-1.5 pr-3 font-normal">Webhook</th>
                  <th className="py-1.5 pr-3 font-normal">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {v.risorse.map((r) => (
                  <tr key={r.risorsa} title={r.note}>
                    <td className="py-1.5 pr-3">{r.risorsa}</td>
                    <td className="py-1.5 pr-3">{r.api.lettura ? "sì" : "—"}</td>
                    <td className="py-1.5 pr-3">{r.api.scrittura ? "sì" : "—"}</td>
                    <td className="py-1.5 pr-3">{r.api.webhook ? "sì" : "—"}</td>
                    <td className="py-1.5 pr-3">
                      {r.verifica === "NON_SUPPORTATA"
                        ? "non supportata dall'API"
                        : r.verifica === "DA_VERIFICARE"
                          ? "da verificare con un account vero"
                          : r.verifica === "VERIFICATA"
                            ? "verificata"
                            : "documentata, non provata"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="t-nota">
        Le credenziali restano cifrate su Foodtech e legate a questo locale: non tornano mai nel browser e non
        valgono per nessun altro locale, nemmeno dello stesso gruppo.
      </p>
      {v.nonInstallabile ? (
        <div className="riquadro comodo space-y-2 text-sm">
          <p className="font-medium">{v.nonInstallabile}</p>
          {v.mancaPerOperare.length > 0 && (
            <ul className="space-y-1 text-muted-foreground">
              {v.mancaPerOperare.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
          )}
        </div>
      ) : puoInstallare ? (
        <Button variant="accent" onClick={onAvanti} disabled={inCorso}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {dettaglio.installazione ? "Continua" : "Installa"} <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
        <p className="t-nota">L&apos;installazione la fa chi amministra il locale.</p>
      )}
      {v.documentazione && (
        <a
          href={v.documentazione}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-4 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Documentazione di {v.fornitore} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </>
  );
}

function PassoAutenticazione({
  dettaglio,
  puoInstallare,
  inCorso,
  onAutorizza,
  onConnetti,
  onAvanti,
}: {
  dettaglio: Dettaglio;
  puoInstallare: boolean;
  inCorso: boolean;
  onAutorizza: () => void;
  onConnetti: (campi: Record<string, string>) => void;
  onAvanti: () => void;
}) {
  const v = dettaglio.voce;
  const i = dettaglio.installazione;
  const collegato = !!i?.credenziali.presenti && i.status !== "REAUTH_REQUIRED";
  const campiSegreti = v.configurazione.filter((c) => c.tipo === "segreto" || c.fase === "autenticazione");
  const [campi, setCampi] = useState<Record<string, string>>({});

  return (
    <>
      <div>
        <h3 className="t-titolo-sezione">Autenticazione</h3>
        <p className="mt-1 text-sm text-muted-foreground">{ETICHETTA_AUTENTICAZIONE[v.autenticazione]}</p>
      </div>

      {i?.status === "REAUTH_REQUIRED" && (
        <p className="riquadro comodo border-accent/40 bg-accent/10 text-sm">
          {i.problema?.spiegazione ?? `L'accesso a ${v.fornitore} non è più valido.`}
        </p>
      )}

      {collegato && (
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" />
          Account collegato{i?.account ? `: ${i.account}` : ""}.
        </p>
      )}

      {!puoInstallare ? (
        <p className="t-nota">Il collegamento dell&apos;account lo fa chi amministra il locale.</p>
      ) : v.autenticazione === "OAUTH2" ? (
        <div className="space-y-2">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Si apre la pagina di {v.fornitore}: entri con l&apos;account del ristorante e approvi i permessi. Foodtech
            non vede la tua password.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant={collegato ? "outline" : "accent"} onClick={onAutorizza} disabled={inCorso}>
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {collegato ? `Ricollega ${v.fornitore}` : `Accedi con ${v.fornitore}`}
            </Button>
            {collegato && (
              <Button variant="accent" onClick={onAvanti}>
                Continua <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : campiSegreti.length > 0 ? (
        <form
          className="max-w-md space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onConnetti(campi);
          }}
        >
          {campiSegreti.map((c) => (
            <div key={c.chiave} className="space-y-1">
              <Label htmlFor={`campo-${c.chiave}`}>{c.etichetta}</Label>
              <Input
                id={`campo-${c.chiave}`}
                type={c.tipo === "segreto" ? "password" : "text"}
                autoComplete="off"
                value={campi[c.chiave] ?? ""}
                onChange={(e) => setCampi({ ...campi, [c.chiave]: e.target.value })}
                placeholder={collegato ? (c.tipo === "segreto" ? "Salvata · scrivi per sostituirla" : "Salvato · scrivi di nuovo per ricollegare") : ""}
              />
              {c.aiuto && <p className="t-nota">{c.aiuto}</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="accent" disabled={inCorso || !campiSegreti.every((c) => !c.obbligatorio || campi[c.chiave]?.trim())}>
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {collegato ? "Sostituisci e continua" : "Verifica e continua"}
            </Button>
            {collegato && (
              <Button type="button" variant="outline" onClick={onAvanti}>
                Continua con la chiave salvata <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="t-nota">
            La chiave si verifica subito con {v.fornitore}: se non è valida non viene salvata. Una volta salvata non si
            può più leggere, nemmeno da qui.
          </p>
        </form>
      ) : (
        <Button variant="accent" onClick={onAvanti}>
          Continua <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}

type Esegui = <T>(chiave: string, fn: () => Promise<T>) => Promise<T | null>;

function PassoConfigurazione({
  slug,
  dettaglio,
  puoConfigurare,
  esegui,
  inCorso,
  onSalvato,
}: {
  slug: string;
  dettaglio: Dettaglio;
  puoConfigurare: boolean;
  esegui: Esegui;
  inCorso: string | null;
  onSalvato: () => void;
}) {
  const v = dettaglio.voce;
  const campi = v.configurazione.filter((c) => c.tipo !== "segreto" && c.fase !== "autenticazione");
  const [valori, setValori] = useState<Record<string, string>>(dettaglio.installazione?.configurazione ?? {});
  const [opzioni, setOpzioni] = useState<Record<string, { value: string; label: string }[]> | null>(null);

  const servonoOpzioni = campi.some((c) => c.opzioniDa);
  useEffect(() => {
    if (!servonoOpzioni || opzioni) return;
    void esegui("opzioni", () =>
      azione<{ opzioni: Record<string, { value: string; label: string }[]> }>(slug, { azione: "opzioni" }),
    ).then((r) => setOpzioni(r?.opzioni ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servonoOpzioni]);

  if (campi.length === 0) {
    return (
      <>
        <h3 className="t-titolo-sezione">Configurazione</h3>
        <p className="text-sm text-muted-foreground">Nessuna configurazione da scegliere per questa integrazione.</p>
        <Button variant="accent" onClick={onSalvato}>
          Continua <ArrowRight className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const etichette: Record<string, string> = {};
        for (const c of campi) {
          const o = c.opzioniDa ? opzioni?.[c.opzioniDa]?.find((x) => x.value === valori[c.chiave]) : null;
          if (o) etichette[c.chiave] = o.label.split(" · ")[0]!;
        }
        const ok = await esegui("configura", () =>
          azione(slug, { azione: "configura", configurazione: valori, etichette }),
        );
        if (ok) onSalvato();
      }}
    >
      <div>
        <h3 className="t-titolo-sezione">Configurazione</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Le scelte arrivano da {v.fornitore}, lette adesso con l&apos;account appena collegato.
        </p>
      </div>

      {campi.map((c) => {
        /* `null` finché la risposta non è arrivata; dopo, un elenco — vuoto
           anche quando la lettura è fallita: l'errore lo dice il riquadro in
           alto, e qui non deve restare uno spinner che gira per sempre. */
        const scelte = c.opzioniDa
          ? opzioni === null
            ? null
            : opzioni[c.opzioniDa] ?? []
          : c.opzioni ?? null;
        return (
          <div key={c.chiave} className="max-w-md space-y-1">
            <Label htmlFor={`conf-${c.chiave}`}>{c.etichetta}</Label>
            {c.tipo === "scelta" ? (
              scelte === null || scelte === undefined ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Leggiamo le opzioni da {v.fornitore}…
                </p>
              ) : scelte.length === 0 ? (
                <p className="text-sm text-accent-strong">
                  {v.fornitore} non ha restituito nessuna scelta con questo account.
                </p>
              ) : (
                <Select
                  value={valori[c.chiave] ?? ""}
                  onValueChange={(x) => setValori({ ...valori, [c.chiave]: x })}
                  disabled={!puoConfigurare}
                >
                  <SelectTrigger id={`conf-${c.chiave}`}>
                    <SelectValue placeholder="Scegli" />
                  </SelectTrigger>
                  <SelectContent>
                    {scelte.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <Input
                id={`conf-${c.chiave}`}
                value={valori[c.chiave] ?? ""}
                onChange={(e) => setValori({ ...valori, [c.chiave]: e.target.value })}
                disabled={!puoConfigurare}
              />
            )}
            {c.aiuto && <p className="t-nota">{c.aiuto}</p>}
          </div>
        );
      })}

      {puoConfigurare && (
        <Button type="submit" variant="accent" disabled={inCorso === "configura" || inCorso === "opzioni"}>
          {inCorso === "configura" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salva e continua
        </Button>
      )}
    </form>
  );
}

type EsitoProva =
  | { ok: true; account: string | null; sede: string | null; avvisi: string[] }
  | { ok: false; titolo: string; spiegazione: string; azione: string | null; correlationId: string };

function PassoProva({
  slug,
  dettaglio,
  puoConfigurare,
  esegui,
  inCorso,
  onRicollega,
  onAvanti,
}: {
  slug: string;
  dettaglio: Dettaglio;
  puoConfigurare: boolean;
  esegui: Esegui;
  inCorso: boolean;
  onRicollega: () => void;
  onAvanti: () => void;
}) {
  const [esito, setEsito] = useState<EsitoProva | null>(null);
  const giaRiuscita = dettaglio.installazione?.status === "CONNECTED" && dettaglio.installazione.ultimaProvaRiuscita;

  return (
    <>
      <div>
        <h3 className="t-titolo-sezione">Prova di connessione</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Foodtech chiama davvero {dettaglio.voce.fornitore} con le credenziali salvate e la sede scelta.
        </p>
      </div>

      {puoConfigurare && (
        <Button
          variant={esito?.ok || giaRiuscita ? "outline" : "accent"}
          disabled={inCorso}
          onClick={async () => {
            const r = await esegui("prova", () => azione<EsitoProva>(slug, { azione: "prova" }));
            if (r) setEsito(r);
          }}
        >
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Testa connessione
        </Button>
      )}

      {esito?.ok && (
        <div role="status" className="riquadro comodo space-y-1 border-sage/50 bg-sage/15 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> Connessione riuscita
          </p>
          {esito.account && <p>Account: {esito.account}</p>}
          {esito.sede && <p>Sede: {esito.sede}</p>}
          {esito.avvisi.map((a) => (
            <p key={a} className="text-accent-strong">
              {a}
            </p>
          ))}
        </div>
      )}
      {esito && !esito.ok && (
        <div role="alert" className="riquadro comodo space-y-2 border-destructive/40 bg-destructive/10 text-sm">
          <p className="font-medium">{esito.titolo}</p>
          <p className="text-muted-foreground">{esito.spiegazione}</p>
          {esito.azione === "ricollega" && (
            <Button size="sm" variant="outline" onClick={onRicollega}>
              Ricollega {dettaglio.voce.fornitore}
            </Button>
          )}
          <p className="t-nota">Riferimento per l&apos;assistenza: {esito.correlationId}</p>
        </div>
      )}

      {(esito?.ok || giaRiuscita) && (
        <Button variant="accent" onClick={onAvanti}>
          Continua <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}

function PassoCapacita({
  dettaglio,
  puoConfigurare,
  inCorso,
  onSalva,
}: {
  dettaglio: Dettaglio;
  puoConfigurare: boolean;
  inCorso: boolean;
  onSalva: (capacita: string[]) => void;
}) {
  const offerte = dettaglio.voce.capacita as Capacita[];
  const [scelte, setScelte] = useState<Set<string>>(
    new Set(dettaglio.installazione?.capacitaAccese.length ? dettaglio.installazione.capacitaAccese : []),
  );

  return (
    <>
      <div>
        <h3 className="t-titolo-sezione">Cosa sincronizzare</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo ciò che {dettaglio.voce.fornitore} permette davvero. Potrai cambiarlo in ogni momento.
        </p>
      </div>
      <ul className="divide-y divide-border/60 rounded-md border border-border">
        {offerte.map((c) => (
          <li key={c} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{CAPACITA[c].label}</p>
              <p className="t-nota">{CAPACITA[c].descrizione}</p>
            </div>
            <Switch
              checked={scelte.has(c)}
              disabled={!puoConfigurare}
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
      {scelte.has("orders.write") && (
        <p className="t-nota">
          Con «Invio ordini» acceso, all&apos;attivazione Foodtech registra presso {dettaglio.voce.fornitore}{" "}
          l&apos;indirizzo a cui arrivano gli esiti. Gli ordini partiranno dalla sala quando l&apos;invio sarà
          collegato alle comande: oggi nessuna comanda viene mandata alla cassa.
        </p>
      )}
      {puoConfigurare && (
        <Button variant="accent" disabled={inCorso || scelte.size === 0} onClick={() => onSalva([...scelte])}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salva e continua
        </Button>
      )}
    </>
  );
}

function PassoAttivazione({
  dettaglio,
  puoConfigurare,
  inCorso,
  onAttiva,
}: {
  dettaglio: Dettaglio;
  puoConfigurare: boolean;
  inCorso: boolean;
  onAttiva: () => void;
}) {
  const i = dettaglio.installazione;
  const gia = i?.status === "ACTIVE" || i?.status === "SYNCING";
  return (
    <>
      <div>
        <h3 className="t-titolo-sezione">Attivazione</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          All&apos;attivazione parte la prima importazione. Poi {dettaglio.voce.fornitore} si sincronizza da solo, e
          puoi farlo anche a mano dalla pagina dell&apos;integrazione.
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
        <dt className="text-muted-foreground">Account</dt>
        <dd>{i?.account ?? "—"}</dd>
        <dt className="text-muted-foreground">Sede</dt>
        <dd>{i?.sede ?? "—"}</dd>
        <dt className="text-muted-foreground">Cosa si sincronizza</dt>
        <dd>{i?.capacitaAccese.map((c) => CAPACITA[c as Capacita]?.label ?? c).join(", ") || "—"}</dd>
      </dl>
      {dettaglio.webhook && (
        <details className="riquadro comodo" open={!dettaglio.webhook.segretoPresente}>
          <summary className="cursor-pointer text-sm font-medium">Aggiornamenti in tempo reale (facoltativo)</summary>
          <div className="mt-3">
            <WebhookManuale
              slug={dettaglio.voce.slug}
              fornitore={dettaglio.voce.nome}
              indirizzo={dettaglio.webhook.indirizzo}
              segretoPresente={dettaglio.webhook.segretoPresente}
              puo={puoConfigurare}
            />
          </div>
        </details>
      )}
      {gia ? (
        <Button asChild variant="accent">
          <Link href={`/settings/integrations/${dettaglio.voce.slug}`}>Vai all&apos;integrazione</Link>
        </Button>
      ) : puoConfigurare ? (
        <Button variant="accent" onClick={onAttiva} disabled={inCorso || i?.status !== "CONNECTED"}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Attiva integrazione
        </Button>
      ) : null}
      {!gia && i?.status !== "CONNECTED" && (
        <p className="t-nota">Serve una prova di connessione riuscita prima di attivare.</p>
      )}
    </>
  );
}
