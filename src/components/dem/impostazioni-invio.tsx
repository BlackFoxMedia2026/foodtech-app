"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Copy, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type RecordDns = { tipo: string; nome: string; valore: string; priorita?: number };

export type StatoInvioVista = {
  configurato: boolean;
  dominioInvio: string | null;
  mittente: string | null;
  replyTo: string | null;
  stato: "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED";
  dkim: string;
  spf: string;
  dmarc: string;
  dmarcPolitica: string | null;
  record: RecordDns[];
  dmarcSuggerito: RecordDns | null;
  ultimoControllo: string | null;
};

/**
 * «Impostazioni invio»: tre passi, e nessuna parola che il cliente debba
 * andare a cercare.
 *
 * La cosa difficile di questa schermata non è tecnica, è di linguaggio. Quello
 * che sta succedendo sotto — identità, chiavi di firma, Return-Path, insiemi
 * di configurazione — è roba da sistemisti, e un ristoratore non deve
 * incontrarla. Quello che deve capire è: «Foodtech manderà le mie newsletter
 * da news.ilmiolocale.it, e per farlo devo aggiungere tre righe dove tengo il
 * dominio».
 *
 * Quindi: «firma del dominio» e non DKIM in prima riga, «pronto per l'invio» e
 * non «VerifiedForSendingStatus», e le sigle solo nella tabella dei record —
 * dove servono per davvero, perché è quello che il pannello del suo fornitore
 * gli chiederà.
 *
 * Il terzo passo non dice mai «fatto» finché non lo è: gli stati arrivano da
 * un controllo vero, e «in attesa» per qualche ora è la verità di come
 * funziona il DNS.
 */
export function ImpostazioniInvio({ iniziale }: { iniziale: StatoInvioVista }) {
  const [stato, setStato] = useState(iniziale);
  const [dominio, setDominio] = useState("");
  const [replyTo, setReplyTo] = useState(iniziale.replyTo ?? "");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [controllato, setControllato] = useState(false);

  const proposto = dominio.trim() ? `news.${pulisci(dominio)}` : "news.iltuodominio.it";

  async function configura() {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/dem/dominio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dominio, ...(replyTo && { replyTo }) }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a preparare il dominio."));
      return;
    }
    await aggiorna();
  }

  async function verifica() {
    setBusy(true);
    setErrore(null);
    const res = await fetch("/api/dem/dominio/verifica", { method: "POST" });
    setBusy(false);
    setControllato(true);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a controllare il dominio."));
      return;
    }
    setStato((await res.json()) as StatoInvioVista);
  }

  async function aggiorna() {
    const res = await fetch("/api/dem/dominio");
    if (res.ok) setStato((await res.json()) as StatoInvioVista);
  }

  if (!stato.configurato) {
    return (
      <section className="surface space-y-4 p-6">
        <div>
          <p className="t-etichetta">Passo 1 di 3</p>
          <h2 className="t-titolo-sezione mt-1">Il dominio delle tue newsletter</h2>
          <p className="t-corpo mt-2 text-muted-foreground">
            Le newsletter partiranno da un indirizzo che porta il nome del tuo locale. Usiamo un
            sottodominio dedicato: il tuo sito e la tua posta aziendale non vengono toccati.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dominio">Il dominio del tuo locale</Label>
          <Input
            id="dominio"
            placeholder="ilmiolocale.it"
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            autoComplete="off"
          />
          <p className="t-nota">
            Manderemo le newsletter da <strong className="text-foreground">{proposto}</strong>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="replyTo">Dove vuoi ricevere le risposte</Label>
          <Input
            id="replyTo"
            type="email"
            placeholder="info@ilmiolocale.it"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
          />
          <p className="t-nota">
            Chi risponde a una newsletter scrive qui. Se lo lasci vuoto usiamo l&apos;email del locale.
          </p>
        </div>

        {errore && <p className="text-sm text-destructive-soft">{errore}</p>}

        <Button variant="accent" disabled={busy || dominio.trim().length < 3} onClick={configura}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Un istante…
            </>
          ) : (
            "Continua"
          )}
        </Button>
      </section>
    );
  }

  const pronto = stato.stato === "VERIFIED";

  return (
    <div className="space-y-5">
      <section className={cn("surface p-6", pronto && "border-sage/50")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="t-etichetta">Dominio di invio</p>
            <p className="text-display mt-1 text-xl">{stato.dominioInvio}</p>
          </div>
          <Badge tone={pronto ? "success" : stato.stato === "FAILED" ? "danger" : "info"}>
            {pronto ? "Pronto per l'invio" : stato.stato === "FAILED" ? "Da controllare" : "In attesa"}
          </Badge>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Riga
            etichetta="Firma del dominio"
            spiegazione="Dimostra che le email sono davvero tue."
            stato={stato.dkim}
          />
          <Riga
            etichetta="Autorizzazione all'invio"
            spiegazione="Dice ai provider che possiamo spedire per te."
            stato={stato.spf}
          />
          <Riga
            etichetta="Regola anti-contraffazione"
            spiegazione={
              stato.dmarcPolitica
                ? `Impostata sul tuo dominio (${stato.dmarcPolitica}).`
                : "Consigliata, non obbligatoria."
            }
            stato={stato.dmarc}
          />
          <Riga
            etichetta="Risposte"
            spiegazione={stato.replyTo ?? "Useremo l'email del locale."}
            stato={stato.replyTo ? "OK" : "UNKNOWN"}
          />
        </dl>
      </section>

      {!pronto && (
        <section className="surface space-y-4 p-6">
          <div>
            <p className="t-etichetta">Passo 2 di 3</p>
            <h2 className="t-titolo-sezione mt-1">Aggiungi queste righe al tuo dominio</h2>
            <p className="t-corpo mt-2 text-muted-foreground">
              Si aggiungono dove tieni il dominio — il pannello di chi te l&apos;ha registrato. Non
              cambiano nulla di quello che hai già: sono nomi nuovi, che prima non esistevano.
            </p>
          </div>

          <TabellaRecord record={stato.record} />

          {stato.dmarcSuggerito && (
            <div className="riquadro space-y-2 p-4">
              <p className="t-titolo-scheda">Consigliata, non obbligatoria</p>
              <p className="t-nota">
                Il tuo dominio non ha ancora una regola che impedisca ad altri di spedire a tuo
                nome. Non la aggiungiamo noi: se hai altri servizi che mandano email per te,
                metterla senza controllare potrebbe bloccarli.
              </p>
              <TabellaRecord record={[stato.dmarcSuggerito]} />
            </div>
          )}

          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" disabled={busy} onClick={verifica}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sto controllando…
                </>
              ) : (
                "Ho configurato i DNS"
              )}
            </Button>
            {controllato && !pronto && !errore && (
              <p className="t-nota flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Non risulta ancora. I cambi al dominio possono metterci qualche ora: ti avvisiamo
                appena è pronto.
              </p>
            )}
          </div>
        </section>
      )}

      {pronto && (
        <section className="surface space-y-3 p-6">
          <p className="t-etichetta">Passo 3 di 3</p>
          <h2 className="t-titolo-sezione flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-sage-strong" aria-hidden="true" />
            Tutto pronto
          </h2>
          <p className="t-corpo text-muted-foreground">
            Le tue newsletter partiranno da <strong className="text-foreground">{stato.mittente}</strong>.
            Puoi creare la prima campagna quando vuoi.
          </p>
        </section>
      )}
    </div>
  );
}

function Riga({
  etichetta,
  spiegazione,
  stato,
}: {
  etichetta: string;
  spiegazione: string;
  stato: string;
}) {
  const ok = stato === "OK";
  const guasto = stato === "FAILED" || stato === "MISSING";
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
      ) : guasto ? (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive-soft" aria-hidden="true" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <dt className="text-sm">{etichetta}</dt>
        <dd className="t-nota">{spiegazione}</dd>
      </div>
    </div>
  );
}

/**
 * I record, leggibili anche su un telefono.
 *
 * Una tabella a quattro colonne con dentro stringhe di sessanta caratteri su
 * uno schermo da 390 px non è una tabella: è una riga che scorre di lato e che
 * nessuno copia giusta. Sotto il breakpoint diventano schede, una per record,
 * con il valore su una riga sua e il pulsante per copiarlo — che è l'unico
 * gesto che uno fa davvero qui.
 */
function TabellaRecord({ record }: { record: RecordDns[] }) {
  return (
    <ul className="space-y-2">
      {record.map((r, i) => (
        <li key={`${r.tipo}-${r.nome}-${i}`} className="riquadro p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{r.tipo}</Badge>
            {r.priorita !== undefined && <span className="t-nota">priorità {r.priorita}</span>}
          </div>
          <Campo etichetta="Nome" valore={r.nome} />
          <Campo etichetta="Valore" valore={r.valore} />
        </li>
      ))}
    </ul>
  );
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <div className="mt-2">
      <p className="t-etichetta">{etichetta}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{valore}</code>
        <button
          type="button"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label={`Copia ${etichetta.toLowerCase()}`}
          onClick={async () => {
            await navigator.clipboard.writeText(valore);
            setCopiato(true);
            setTimeout(() => setCopiato(false), 1500);
          }}
        >
          {copiato ? (
            <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function pulisci(valore: string): string {
  return valore
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
