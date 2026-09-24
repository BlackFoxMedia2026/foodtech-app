"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, PartyPopper, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CampoCliente } from "@/server/integrations/cliente";
import type { DettaglioCliente } from "@/server/integrations/vista-cliente";
import { azione, ErroreAzione } from "./azioni";
import { AiutoCredenziali } from "./aiuto-credenziali";
import { Logo } from "./segni";

/**
 * **Il wizard di collegamento: cinque passi, uno per schermata.**
 *
 * 1. **Accesso** — la chiave (o l'accesso con l'account del fornitore). La
 *    chiave si verifica subito: se non vale, non si salva.
 * 2. **Verifica** — Foodtech legge davvero dal fornitore ciò che serve per il
 *    passo dopo, e lo dice: riuscita, o «non siamo riusciti a collegarci».
 * 3. **Sede** — il punto vendita, con le scelte arrivate dal fornitore. Al
 *    «Continua» parte la prova di connessione vera, con la sede scelta.
 * 4. **Sincronizzazione** — pochi interruttori, solo per ciò che il fornitore
 *    offre davvero; all'ultimo clic l'integrazione si attiva.
 * 5. **Pronta.**
 *
 * Dietro ci sono le stesse azioni del servizio di sempre (`installa`,
 * `connetti`, `opzioni`, `configura`, `prova`, `gruppi`, `attiva`), con le
 * stesse regole: il wizard cambia che cosa si vede, non che cosa si può fare.
 * Il passo di partenza lo decide lo stato sul server: chi chiude a metà
 * riparte da dove era.
 */

type Opzione = { value: string; label: string };
type Opzioni = Record<string, Opzione[]>;
type Problema = { titolo: string | null; testo: string; ricollega: boolean };

const ESITI_OAUTH: Record<string, string> = {
  rifiutato: "L'accesso non è stato confermato. Riprova quando vuoi.",
  scaduto: "Il collegamento è scaduto prima del ritorno. Riprova.",
  non_valido: "Non abbiamo riconosciuto il ritorno dalla pagina di accesso. Riprova da questo browser.",
  contesto: "Nel frattempo è cambiato il locale attivo. Riprova da qui.",
  sessione: "La sessione è scaduta. Rientra e riprova.",
  incompleto: "L'accesso non si è completato. Riprova.",
  scambio: "L'accesso non è stato confermato. Riprova fra qualche minuto.",
};

export function WizardCollegamento({
  dettaglio,
  esitoOAuth,
  passoRichiesto,
}: {
  dettaglio: DettaglioCliente;
  esitoOAuth: string | null;
  passoRichiesto: "accesso" | "sede" | null;
}) {
  const router = useRouter();
  const { voce, installazione: inst } = dettaglio;
  const slug = voce.slug;
  const pagina = `/settings/integrations/${slug}`;

  const PASSI = useMemo(
    () => [
      { id: "accesso", label: "Accesso" },
      { id: "verifica", label: "Verifica" },
      // Nello stepper la forma corta («Sede e revenue center» → «Sede»): va su una riga.
      { id: "sede", label: voce.titoloSede.split(" e ")[0]! },
      { id: "sync", label: "Sincronizzazione" },
      { id: "pronta", label: "Pronta" },
    ],
    [voce.titoloSede],
  );

  const dalServer = inst?.passo ?? 0;
  const [passo, setPasso] = useState(() =>
    passoRichiesto === "accesso" ? 0 : passoRichiesto === "sede" ? Math.min(1, dalServer) : dalServer,
  );
  const [piuLontano, setPiuLontano] = useState(Math.max(dalServer, passo));
  const vai = (n: number) => {
    setPasso(n);
    setPiuLontano((p) => Math.max(p, n));
    setProblema(null);
  };

  const [valori, setValori] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const c of [...voce.campiAccesso, ...voce.campiSede]) {
      if (c.tipo === "segreto") continue;
      const scelto = inst?.configurazione[c.chiave] ?? c.predefinito;
      if (scelto) v[c.chiave] = scelto;
    }
    return v;
  });
  const [opzioni, setOpzioni] = useState<Opzioni | null>(null);
  const [problema, setProblema] = useState<Problema | null>(
    esitoOAuth && ESITI_OAUTH[esitoOAuth] ? { titolo: null, testo: ESITI_OAUTH[esitoOAuth]!, ricollega: true } : null,
  );
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [daAttivare, setDaAttivare] = useState(inst?.condizione === "in_configurazione");

  async function esegui<T>(chiave: string, fn: () => Promise<T>): Promise<T | null> {
    setInCorso(chiave);
    setProblema(null);
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof ErroreAzione ? e : null;
      setProblema({ titolo: null, testo: err?.message ?? "Qualcosa è andato storto. Riprova.", ricollega: err?.azione === "ricollega" });
      return null;
    } finally {
      setInCorso(null);
    }
  }

  /** Il primo gesto crea l'installazione; i successivi la riusano. */
  async function assicuraInstallata() {
    if (!inst) await azione(slug, { azione: "installa" });
  }

  const ricollega = voce.accesso === "oauth" ? "Accedi di nuovo" : "Controlla i dati di accesso";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Logo src={voce.logo} testo={voce.monogramma} />
        <div className="min-w-0 flex-1">
          <p className="t-etichetta">Collega</p>
          <h1 className="truncate text-display text-xl">{voce.nome}</h1>
        </div>
      </div>

      {/* Desktop: lo stepper compatto. Telefono: una riga che si legge. */}
      <div className="hidden sm:block">
        <Stepper
          steps={PASSI}
          currentStepIndex={passo}
          furthestStepIndex={piuLontano}
          onStepClick={(n) => n < passo && passo < 4 && vai(n)}
          variant="compatto"
        />
      </div>
      <p className="t-nota sm:hidden" aria-live="polite">
        Passaggio {passo + 1} di {PASSI.length} · {PASSI[passo]!.label}
      </p>

      <section className="riquadro comodo space-y-5 bg-card/50 p-5 md:p-7">
        {problema && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
            <div className="min-w-0 space-y-2">
              {problema.titolo && <p className="font-medium">{problema.titolo}</p>}
              <p>{problema.testo}</p>
              {problema.ricollega && passo !== 0 && passo !== 1 && (
                <Button size="sm" variant="outline" onClick={() => vai(0)}>
                  {ricollega}
                </Button>
              )}
            </div>
          </div>
        )}

        {passo === 0 && (
          <PassoAccesso
            dettaglio={dettaglio}
            ricollegare={passoRichiesto === "accesso" || inst?.condizione === "da_ricollegare"}
            inCorso={inCorso === "accesso"}
            valori={valori}
            setValori={setValori}
            onOAuth={async () => {
              const r = await esegui("accesso", async () => {
                await assicuraInstallata();
                return azione<{ url: string }>(slug, { azione: "autorizza" });
              });
              if (r?.url) window.location.href = r.url;
            }}
            onConnetti={async (campi) => {
              const ok = await esegui("accesso", async () => {
                await assicuraInstallata();
                return azione(slug, { azione: "connetti", campi });
              });
              if (ok) {
                setOpzioni(null);
                router.refresh();
                vai(1);
              }
            }}
            onContinua={() => vai(1)}
          />
        )}

        {passo === 1 && (
          <PassoVerifica
            dettaglio={dettaglio}
            opzioni={opzioni}
            inCorso={inCorso === "verifica"}
            fallita={!!problema}
            onVerifica={async () => {
              const serve = voce.campiSede.some((c) => c.opzioniDa);
              if (!serve) {
                setOpzioni({});
                return;
              }
              const r = await esegui("verifica", () => azione<{ opzioni: Opzioni }>(slug, { azione: "opzioni" }));
              if (r) setOpzioni(r.opzioni ?? {});
            }}
            onRicollega={() => vai(0)}
            etichettaRicollega={ricollega}
            onContinua={() => vai(2)}
          />
        )}

        {passo === 2 && (
          <PassoSede
            dettaglio={dettaglio}
            opzioni={opzioni ?? {}}
            valori={valori}
            setValori={setValori}
            inCorso={inCorso === "sede"}
            onIndietro={() => vai(1)}
            onContinua={async () => {
              const etichette: Record<string, string> = {};
              for (const c of voce.campiSede) {
                const o = c.opzioniDa ? opzioni?.[c.opzioniDa]?.find((x) => x.value === valori[c.chiave]) : null;
                if (o) etichette[c.chiave] = o.label.split(" · ")[0]!;
              }
              const esito = await esegui("sede", async () => {
                await azione(slug, { azione: "configura", configurazione: valori, etichette });
                return azione<
                  | { ok: true; avvisi: string[]; daControllare: boolean }
                  | { ok: false; titolo: string; spiegazione: string; azione: string | null }
                >(slug, { azione: "prova" });
              });
              if (!esito) return;
              if (!esito.ok) {
                setProblema({ titolo: esito.titolo, testo: esito.spiegazione, ricollega: esito.azione === "ricollega" });
                router.refresh();
                return;
              }
              setAvvisi([
                ...esito.avvisi,
                ...(esito.daControllare ? [voce.portaDati
                    ? `La connessione funziona, ma ${voce.nome} segnala qualcosa da controllare sulla cassa. Se gli ordini non arrivano, scrivici.`
                    : `La connessione funziona, ma ${voce.nome} segnala qualcosa da controllare. Se hai dubbi, scrivici.`] : []),
              ]);
              setDaAttivare(true);
              router.refresh();
              vai(3);
            }}
          />
        )}

        {passo === 3 && (
          <PassoSincronizzazione
            dettaglio={dettaglio}
            avvisi={avvisi}
            inCorso={inCorso === "sync"}
            daAttivare={daAttivare}
            onConferma={async (gruppi) => {
              const ok = await esegui("sync", async () => {
                await azione(slug, { azione: "gruppi", gruppi });
                if (daAttivare) await azione(slug, { azione: "attiva" });
                return true;
              });
              if (ok) {
                router.refresh();
                vai(4);
              }
            }}
          />
        )}

        {passo === 4 && (
          <div className="space-y-4 py-2 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-accent-strong" aria-hidden="true" />
            <div>
              <h2 className="t-titolo-sezione">Pronta</h2>
              <p className="mt-1 text-sm text-muted-foreground">{voce.nome} è collegata a Foodtech.</p>
              <p className="t-nota mt-1">
                {voce.portaDati ? "Stiamo leggendo i dati dalla cassa: ci vorrà qualche minuto." : "Da qui in poi Foodtech controlla che resti collegata."}
              </p>
            </div>
            <Button
              variant="accent"
              onClick={() => {
                router.replace(pagina);
                router.refresh();
              }}
            >
              Fine
            </Button>
          </div>
        )}
      </section>

      {passo < 4 && (
        <Button asChild variant="ghost" size="sm">
          <Link href={inst && inst.condizione !== "in_configurazione" ? pagina : "/settings/integrations"}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {inst && inst.condizione !== "in_configurazione" ? "Torna all'integrazione" : "Esci, riprendi dopo"}
          </Link>
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I passi                                                                   */
/* -------------------------------------------------------------------------- */

function Titolo({ titolo, testo }: { titolo: string; testo?: string | null }) {
  return (
    <div>
      <h2 className="t-titolo-sezione">{titolo}</h2>
      {testo && <p className="mt-1 text-sm text-muted-foreground">{testo}</p>}
    </div>
  );
}

function PassoAccesso({
  dettaglio,
  ricollegare,
  inCorso,
  valori,
  setValori,
  onOAuth,
  onConnetti,
  onContinua,
}: {
  dettaglio: DettaglioCliente;
  ricollegare: boolean;
  inCorso: boolean;
  valori: Record<string, string>;
  setValori: (v: Record<string, string>) => void;
  onOAuth: () => void;
  onConnetti: (campi: Record<string, string>) => void;
  onContinua: () => void;
}) {
  const { voce, installazione: inst } = dettaglio;
  const [segreti, setSegreti] = useState<Record<string, string>>({});
  const [cambia, setCambia] = useState(false);
  const collegato = !!inst?.credenzialiPresenti && !ricollegare && !cambia;

  if (voce.accesso === "oauth") {
    return (
      <>
        <Titolo
          titolo={ricollegare ? `Accedi di nuovo a ${voce.nome}` : `Collega ${voce.nome}`}
          testo={`Si apre la pagina di ${voce.nome}: entri con il tuo account e confermi. Foodtech non vede la tua password.`}
        />
        {collegato ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> Account collegato
            </p>
            <Button variant="accent" onClick={onContinua}>
              Continua
            </Button>
          </div>
        ) : (
          <Button variant="accent" onClick={onOAuth} disabled={inCorso}>
            {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            Accedi con {voce.nome}
          </Button>
        )}
      </>
    );
  }

  const visibili = voce.campiAccesso.filter((c) => !c.avanzato);
  const avanzati = voce.campiAccesso.filter((c) => c.avanzato);
  const completo = voce.campiAccesso.every((c) =>
    !c.obbligatorio ? true : c.tipo === "segreto" ? !!segreti[c.chiave]?.trim() : !!valori[c.chiave]?.trim(),
  );
  const unico = visibili.length === 1 ? visibili[0] : null;

  if (collegato) {
    return (
      <>
        <Titolo titolo={`Collega ${voce.nome}`} />
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> I dati di accesso sono già salvati.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" onClick={onContinua}>
            Continua
          </Button>
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setCambia(true)}>
            Usa altri dati di accesso
          </button>
        </div>
      </>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const campi: Record<string, string> = {};
        for (const c of voce.campiAccesso) {
          const v = c.tipo === "segreto" ? segreti[c.chiave] : valori[c.chiave];
          if (v !== undefined && v !== "") campi[c.chiave] = v;
        }
        onConnetti(campi);
      }}
    >
      <Titolo
        titolo={ricollegare ? `Ricollega ${voce.nome}` : `Collega ${voce.nome}`}
        testo={
          unico
            ? `Inserisci ${unico.etichetta === "API Key" ? "la API Key associata" : `il ${unico.etichetta.toLowerCase()} associato`} al tuo account.`
            : voce.credenziali
        }
      />
      <div className="space-y-4">
        {visibili.map((c) => (
          <CampoTesto
            key={c.chiave}
            campo={c}
            valore={c.tipo === "segreto" ? segreti[c.chiave] ?? "" : valori[c.chiave] ?? ""}
            onChange={(v) => (c.tipo === "segreto" ? setSegreti({ ...segreti, [c.chiave]: v }) : setValori({ ...valori, [c.chiave]: v }))}
            autoFocus={c === visibili[0]}
          />
        ))}
        {avanzati.length > 0 && (
          <details className="rounded-lg border border-border/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Altre opzioni</summary>
            <div className="mt-3 space-y-4 pb-1">
              {avanzati.map((c) =>
                c.opzioni ? (
                  <SceltaRadio
                    key={c.chiave}
                    nome={c.chiave}
                    etichetta={c.etichetta}
                    opzioni={c.opzioni}
                    valore={valori[c.chiave] ?? ""}
                    onChange={(v) => setValori({ ...valori, [c.chiave]: v })}
                  />
                ) : (
                  <CampoTesto key={c.chiave} campo={c} valore={valori[c.chiave] ?? ""} onChange={(v) => setValori({ ...valori, [c.chiave]: v })} />
                ),
              )}
            </div>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button type="submit" variant="accent" disabled={inCorso || !completo}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Continua
        </Button>
        {voce.aiuto && <AiutoCredenziali aiuto={voce.aiuto} />}
      </div>
    </form>
  );
}

function CampoTesto({
  campo: c,
  valore,
  onChange,
  autoFocus,
}: {
  campo: CampoCliente;
  valore: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`campo-${c.chiave}`}>{c.etichetta}</Label>
      <Input
        id={`campo-${c.chiave}`}
        type={c.tipo === "segreto" ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={valore}
        placeholder={c.segnaposto ?? undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {c.aiuto && <p className="t-nota">{c.aiuto}</p>}
    </div>
  );
}

function PassoVerifica({
  dettaglio,
  opzioni,
  inCorso,
  fallita,
  onVerifica,
  onRicollega,
  etichettaRicollega,
  onContinua,
}: {
  dettaglio: DettaglioCliente;
  opzioni: Opzioni | null;
  inCorso: boolean;
  fallita: boolean;
  onVerifica: () => void;
  onRicollega: () => void;
  etichettaRicollega: string;
  onContinua: () => void;
}) {
  const { voce, installazione: inst } = dettaglio;
  const avviata = useRef(false);
  useEffect(() => {
    if (!avviata.current && opzioni === null) {
      avviata.current = true;
      onVerifica();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sede = voce.campiSede.find((c) => c.opzioniDa === "locations");
  const trovate = sede && opzioni ? opzioni.locations ?? [] : [];
  const account = inst?.account ?? trovate[0]?.label.split(" · ")[0] ?? null;

  if (fallita && !inCorso) {
    return (
      <>
        <Titolo titolo="Verifica connessione" />
        <p className="text-sm font-medium">Non siamo riusciti a collegarci.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={onRicollega}>
            {etichettaRicollega}
          </Button>
          <Button variant="outline" onClick={onVerifica}>
            Riprova
          </Button>
        </div>
      </>
    );
  }

  if (opzioni === null || inCorso) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-accent-strong" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Verifichiamo la connessione con {voce.nome}…</p>
      </div>
    );
  }

  if (sede && trovate.length === 0) {
    return (
      <>
        <Titolo titolo="Verifica connessione" />
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> Connessione riuscita
        </p>
        <p className="text-sm text-muted-foreground">
          Però questo account non ha nessun {voce.titoloSede.toLowerCase()} da collegare. Controlla su {voce.nome} che sia attivo, poi riprova.
        </p>
        <Button variant="outline" onClick={onVerifica}>
          Riprova
        </Button>
      </>
    );
  }

  return (
    <>
      <Titolo titolo="Verifica connessione" />
      <div className="flex items-start gap-3 rounded-lg border border-sage/50 bg-sage/15 p-4" role="status">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage-strong" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium">Connessione riuscita</p>
          {account && <p className="mt-0.5 text-muted-foreground">Account: {account}</p>}
        </div>
      </div>
      <Button variant="accent" onClick={onContinua} autoFocus>
        Continua
      </Button>
    </>
  );
}

function PassoSede({
  dettaglio,
  opzioni,
  valori,
  setValori,
  inCorso,
  onIndietro,
  onContinua,
}: {
  dettaglio: DettaglioCliente;
  opzioni: Opzioni;
  valori: Record<string, string>;
  setValori: (v: Record<string, string>) => void;
  inCorso: boolean;
  onIndietro: () => void;
  onContinua: () => void;
}) {
  const { voce } = dettaglio;
  const campi = voce.campiSede;

  // Una scelta sola: già fatta. Nessuno deve cliccare l'unica opzione che c'è.
  useEffect(() => {
    const n = { ...valori };
    let cambiato = false;
    for (const c of campi) {
      const scelte = scelteDi(c, opzioni, n);
      if (c.tipo === "scelta" && scelte.length === 1 && n[c.chiave] !== scelte[0]!.value) {
        n[c.chiave] = scelte[0]!.value;
        cambiato = true;
      }
    }
    if (cambiato) setValori(n);
  });

  if (campi.length === 0 && !inCorso) {
    return (
      <>
        <Titolo titolo={voce.titoloSede} testo="Non c'è niente da scegliere: continuiamo." />
        <Button variant="accent" onClick={onContinua}>
          Continua
        </Button>
      </>
    );
  }

  const completo = campi.every((c) => !c.obbligatorio || !!valori[c.chiave]?.trim());

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onContinua();
      }}
    >
      <Titolo titolo={`Scegli ${voce.titoloSede === "Sede e revenue center" ? "sede e revenue center" : `il ${voce.titoloSede.toLowerCase()}`}`} />
      <div className="space-y-5">
        {campi.map((c) => {
          if (c.tipo !== "scelta") {
            return <CampoTesto key={c.chiave} campo={c} valore={valori[c.chiave] ?? ""} onChange={(v) => setValori({ ...valori, [c.chiave]: v })} />;
          }
          const scelte = scelteDi(c, opzioni, valori);
          if (c.dividi) {
            return (
              <SceltaDivisa
                key={c.chiave}
                campo={c}
                opzioni={scelte}
                valore={valori[c.chiave] ?? ""}
                onChange={(v) => {
                  // Cambiare sede azzera le scelte che dipendono da lei (il tipo di servizio).
                  const n = { ...valori, [c.chiave]: v };
                  for (const d of campi) if (d.filtraPer === c.chiave && !(n[d.chiave] ?? "").startsWith(`${v}:`)) delete n[d.chiave];
                  setValori(n);
                }}
              />
            );
          }
          if (c.filtraPer && !valori[c.filtraPer]) return null;
          return (
            <SceltaRadio
              key={c.chiave}
              nome={c.chiave}
              etichetta={c.etichetta}
              aiuto={c.aiuto}
              opzioni={scelte.map((o) => ({ value: o.value, label: c.filtraPer ? o.label.split(" — ").pop() ?? o.label : o.label }))}
              valore={valori[c.chiave] ?? ""}
              onChange={(v) => setValori({ ...valori, [c.chiave]: v })}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={inCorso || !completo}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {inCorso ? "Verifichiamo…" : "Continua"}
        </Button>
        <Button type="button" variant="ghost" onClick={onIndietro} disabled={inCorso}>
          Indietro
        </Button>
      </div>
    </form>
  );
}

function scelteDi(c: CampoCliente, opzioni: Opzioni, valori: Record<string, string>): Opzione[] {
  const tutte = c.opzioniDa ? opzioni[c.opzioniDa] ?? [] : c.opzioni ?? [];
  if (!c.filtraPer) return tutte;
  const padre = valori[c.filtraPer];
  return padre ? tutte.filter((o) => o.value.startsWith(`${padre}:`)) : [];
}

/** Oltre otto voci un elenco di pulsanti diventa una lista da scorrere: meglio un menu. */
const MASSIMO_RADIO = 8;

function SceltaRadio({
  nome,
  etichetta,
  aiuto,
  opzioni,
  valore,
  onChange,
}: {
  nome: string;
  etichetta: string;
  aiuto?: string | null;
  opzioni: Opzione[];
  valore: string;
  onChange: (v: string) => void;
}) {
  if (opzioni.length > MASSIMO_RADIO) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`scelta-${nome}`}>{etichetta}</Label>
        <Select value={valore} onValueChange={onChange}>
          <SelectTrigger id={`scelta-${nome}`}>
            <SelectValue placeholder="Scegli" />
          </SelectTrigger>
          <SelectContent>
            {opzioni.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aiuto && <p className="t-nota">{aiuto}</p>}
      </div>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">{etichetta}</legend>
      <div className="grid gap-2">
        {opzioni.map((o) => (
          <label
            key={o.value}
            className={cn(
              "tocco-comodo flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-colors",
              valore === o.value ? "border-accent/70 bg-accent/15" : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name={nome}
              value={o.value}
              checked={valore === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-accent"
            />
            <span className="min-w-0 flex-1">{o.label}</span>
          </label>
        ))}
      </div>
      {aiuto && <p className="t-nota">{aiuto}</p>}
    </fieldset>
  );
}

/** «Torino · Sala» diventa due domande: prima la sede, poi il revenue center di quella sede. */
function SceltaDivisa({ campo, opzioni, valore, onChange }: { campo: CampoCliente; opzioni: Opzione[]; valore: string; onChange: (v: string) => void }) {
  const [primo, secondo] = campo.dividi!;
  const parti = (o: Opzione) => {
    const i = o.label.indexOf(" · ");
    return i < 0 ? [o.label, o.label] : [o.label.slice(0, i), o.label.slice(i + 3)];
  };
  const sedi = [...new Set(opzioni.map((o) => parti(o)[0]!))];
  const scelta = opzioni.find((o) => o.value === valore);
  const [sede, setSede] = useState(scelta ? parti(scelta)[0]! : sedi.length === 1 ? sedi[0]! : "");
  const figli = opzioni.filter((o) => parti(o)[0] === sede).map((o) => ({ value: o.value, label: parti(o)[1]! }));

  return (
    <div className="space-y-5">
      <SceltaRadio nome={`${campo.chiave}-sede`} etichetta={primo} opzioni={sedi.map((s) => ({ value: s, label: s }))} valore={sede} onChange={setSede} />
      {sede && <SceltaRadio nome={campo.chiave} etichetta={secondo} opzioni={figli} valore={valore} onChange={onChange} />}
    </div>
  );
}

function PassoSincronizzazione({
  dettaglio,
  avvisi,
  inCorso,
  daAttivare,
  onConferma,
}: {
  dettaglio: DettaglioCliente;
  avvisi: string[];
  inCorso: boolean;
  daAttivare: boolean;
  onConferma: (gruppi: string[]) => void;
}) {
  const { voce, installazione: inst } = dettaglio;
  const [scelti, setScelti] = useState<Set<string>>(
    // Le scelte del cliente, anche di prima di una disconnessione; tutto acceso solo al primo collegamento.
    new Set(inst?.gruppiAccesi.length ? inst.gruppiAccesi : inst?.gruppiScelti ?? voce.gruppi.map((g) => g.chiave)),
  );

  return (
    <>
      <Titolo titolo="Cosa vuoi sincronizzare?" testo="Potrai cambiarlo quando vuoi." />
      {avvisi.map((a) => (
        <p key={a} className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          {a}
        </p>
      ))}
      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {voce.gruppi.map((g) => (
          <li key={g.chiave}>
            <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
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
      <Button variant="accent" disabled={inCorso || scelti.size === 0} onClick={() => onConferma([...scelti])}>
        {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {daAttivare ? `Collega ${voce.nome}` : "Salva"}
      </Button>
      {scelti.size === 0 && <p className="t-nota">Scegli almeno una cosa da sincronizzare.</p>}
    </>
  );
}
