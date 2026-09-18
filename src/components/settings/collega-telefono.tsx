"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Phone, PhoneOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { daQuando } from "@/lib/utils";
import type { StatoSipVista } from "./centralino";

/**
 * Collegare il telefono, un passo per volta.
 *
 * ## Perché serviva
 *
 * Per collegare un locale servivano **sei gesti in due applicazioni diverse**,
 * in un ordine preciso, con **due chiavi che viaggiano in versi opposti** e un
 * codice da copiare in mezzo. Niente diceva a che punto fossi: la scheda del
 * telefono mostrava dodici righe tutte contemporaneamente — la chiave, i dati
 * SIP, il codice del locale, la chiave di collegamento — e chi la guardava
 * doveva sapere già cosa fare per capire dove mettere le mani. Luca: «è troppo
 * incasinato».
 *
 * ## Come funziona questo, e la scelta che conta
 *
 * **A che passo sei non lo decide un pulsante «avanti»: lo dicono i dati.**
 * C'è la licenza? Allora il passo due è fatto. C'è una chiave di
 * collegamento? Il tre è fatto. È arrivata una chiamata? Il quattro è fatto.
 *
 * È la differenza fra un wizard che si può abbandonare e uno che no: chiudi la
 * pagina a metà, torna domani, la apre un tuo collega da un altro computer —
 * e il passo giusto è sempre quello giusto. Un wizard che si ricorda dove
 * eravamo con uno stato suo, la prima volta che quello stato non combacia con
 * la realtà, manda a rifare una cosa già fatta o a saltarne una da fare.
 *
 * Per la stessa ragione **i passi fatti non si nascondono**: si chiudono a una
 * riga con la spunta, e restano premibili. Rifare un passo è un caso normale —
 * una chiave scaduta, un centralino cambiato — e nasconderlo vorrebbe dire
 * tornare a cercarlo fra dodici righe.
 */

type Passo = {
  numero: number;
  titolo: string;
  /** Cosa fare, in una riga. */
  cosa: string;
  fatto: boolean;
  /** Il contenuto: il campo, il pulsante, il valore da copiare. */
  corpo: React.ReactNode;
  facoltativo?: boolean;
};

export function CollegaTelefono({
  venueId,
  indirizzo,
  licenzaAttiva,
  chiaveLeggibile,
  motivoSpento,
  collegamentoAttivo,
  ultimaChiamata,
  sip,
  canManage,
}: {
  venueId: string;
  /** L'indirizzo di questa installazione: è quello che va dato al centralino. */
  indirizzo: string;
  licenzaAttiva: boolean;
  chiaveLeggibile: string | null;
  motivoSpento: "scaduta" | "non_piu_valida" | null;
  collegamentoAttivo: boolean;
  ultimaChiamata: string | null;
  sip: StatoSipVista;
  canManage: boolean;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);

  /* --- passo 2: la chiave della licenza --------------------------------- */
  const [chiave, setChiave] = useState("");
  const [erroreChiave, setErroreChiave] = useState<string | null>(null);

  async function attiva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setErroreChiave(null);
    const res = await fetch("/api/venue/centralino", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chiave }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErroreChiave(
        await readApiError(res, "Non siamo riusciti ad attivare il telefono."),
      );
      return;
    }
    setChiave("");
    router.refresh();
  }

  async function spegni() {
    setInCorso(true);
    const res = await fetch("/api/venue/centralino", { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) {
      setErroreChiave(
        await readApiError(res, "Non siamo riusciti a togliere la chiave."),
      );
      return;
    }
    router.refresh();
  }

  /* --- passo 3: la chiave di collegamento ------------------------------- */
  const [chiaveEmessa, setChiaveEmessa] = useState<string | null>(null);
  const [erroreCollegamento, setErroreCollegamento] = useState<string | null>(
    null,
  );

  async function emetti() {
    setInCorso(true);
    setErroreCollegamento(null);
    const res = await fetch("/api/venue/centralino/collegamento", {
      method: "POST",
    });
    setInCorso(false);
    if (!res.ok) {
      setErroreCollegamento(
        await readApiError(res, "Non siamo riusciti a creare la chiave."),
      );
      return;
    }
    const { chiave: emessa } = (await res.json()) as { chiave: string };
    setChiaveEmessa(emessa);
    router.refresh();
  }

  /* --- passo facoltativo: rispondere dal browser ------------------------ */
  const [server, setServer] = useState(sip.server ?? "");
  const [utente, setUtente] = useState(sip.utente ?? "");
  const [password, setPassword] = useState("");
  const [erroreSip, setErroreSip] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  async function salvaSip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setErroreSip(null);
    setSalvato(false);
    const res = await fetch("/api/venue/centralino/sip", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        server: server.trim() || null,
        utente: utente.trim() || null,
        /* Vuota significa «non cambiarla»: un salvataggio che la cancellasse
           per averla lasciata vuota scollegherebbe il telefono a chi voleva
           solo correggere l'utenza. */
        ...(password ? { password } : {}),
      }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErroreSip(
        await readApiError(res, "Non siamo riusciti a salvare i dati."),
      );
      return;
    }
    setPassword("");
    setSalvato(true);
    router.refresh();
  }

  /* --------------------------------------------------------------------- */

  const passi: Passo[] = [
    {
      numero: 1,
      titolo: "Mandaci il codice di questo locale",
      cosa: "Serve a noi per fabbricare la chiave. Non è il nome del locale: è un codice.",
      /* Fatto quando la licenza c'è: se abbiamo potuto fabbricare una chiave
         per questo locale, il codice ce l'hanno mandato. Nessuna casella da
         spuntare a mano — una spunta che dichiara un fatto invece di
         leggerlo è la prima cosa che diventa falsa. */
      fatto: licenzaAttiva,
      corpo: (
        <div className="flex flex-wrap items-center gap-2">
          <code className="select-all rounded-md border border-border bg-black/20 px-2 py-1.5 font-mono text-xs">
            {venueId}
          </code>
          <CopyButton value={venueId} size="sm" variant="outline" />
        </div>
      ),
    },
    {
      numero: 2,
      titolo: "Incolla la chiave che ti abbiamo mandato",
      cosa: "Accende il telefono dentro Tavolo. Vale solo per questo locale.",
      fatto: licenzaAttiva,
      corpo: (
        <div className="space-y-2">
          {licenzaAttiva ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="t-nota">
                Chiave inserita:{" "}
                <code className="font-mono">{chiaveLeggibile}</code>
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={spegni}
                  disabled={inCorso}
                >
                  <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Togli la chiave
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={attiva} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="chiave-licenza" className="sr-only">
                  La chiave
                </Label>
                <Input
                  id="chiave-licenza"
                  value={chiave}
                  onChange={(e) => setChiave(e.target.value)}
                  placeholder="tvlc1.…"
                  className="font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!canManage}
                />
              </div>
              <Button
                type="submit"
                variant="accent"
                size="sm"
                disabled={inCorso || !canManage || chiave.trim().length < 10}
              >
                {inCorso ? "Attivo…" : "Attiva"}
              </Button>
            </form>
          )}
          {motivoSpento === "scaduta" && (
            <p className="t-nota">
              La chiave è scaduta. Le prenotazioni già prese al telefono
              restano: si è spento il telefono, non la storia.
            </p>
          )}
          {motivoSpento === "non_piu_valida" && (
            <p className="t-nota">
              La chiave inserita non è più valida. Scrivici: te ne mandiamo una
              nuova.
            </p>
          )}
          {erroreChiave && (
            <p className="text-xs text-destructive">{erroreChiave}</p>
          )}
        </div>
      ),
    },
    {
      numero: 3,
      titolo: "Apri la strada alle chiamate",
      cosa: "Queste due cose vanno date a chi configura il centralino: senza, qui non arriverà nessuna telefonata.",
      fatto: collegamentoAttivo,
      corpo: (
        <div className="space-y-3">
          <div>
            <p className="t-etichetta">Indirizzo da dare al centralino</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="select-all break-all rounded-md border border-border bg-black/20 px-2 py-1.5 font-mono text-xs">
                {indirizzo}
              </code>
              <CopyButton value={indirizzo} size="sm" variant="outline" />
            </div>
          </div>

          <div>
            <p className="t-etichetta">Chiave di collegamento</p>
            {chiaveEmessa ? (
              /* Si vede **una volta sola**: è una chiave viva, e una schermata
                 che la ripete a ogni ricaricamento è una chiave che finisce in
                 uno screenshot. */
              <div className="mt-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="select-all break-all rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 font-mono text-xs">
                    {chiaveEmessa}
                  </code>
                  <CopyButton value={chiaveEmessa} size="sm" variant="accent" />
                </div>
                <p className="t-nota">
                  Copiala adesso: quando esci da questa pagina non si rivede.
                </p>
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button
                  variant={collegamentoAttivo ? "outline" : "accent"}
                  size="sm"
                  onClick={emetti}
                  disabled={inCorso || !canManage || !licenzaAttiva}
                >
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {collegamentoAttivo
                    ? "Emettine un'altra"
                    : "Emetti la chiave"}
                </Button>
                {collegamentoAttivo && (
                  <span className="t-nota">
                    {
                      "Una chiave è già stata emessa. Emetterne un'altra non spegne la prima."
                    }
                  </span>
                )}
                {!licenzaAttiva && (
                  <span className="t-nota">Prima serve il passo 2.</span>
                )}
              </div>
            )}
          </div>

          {erroreCollegamento && (
            <p className="text-xs text-destructive">{erroreCollegamento}</p>
          )}
        </div>
      ),
    },
    {
      numero: 4,
      titolo: "Prova con una telefonata",
      cosa: "Chiama il numero del locale dal tuo cellulare: qui sotto deve comparire.",
      fatto: ultimaChiamata != null,
      corpo: (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            Ultima chiamata:{" "}
            <strong>
              {ultimaChiamata
                ? daQuando(new Date(ultimaChiamata))
                : "mai arrivata"}
            </strong>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            disabled={inCorso}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Controlla
          </Button>
        </div>
      ),
    },
    {
      numero: 5,
      titolo: "Rispondere dal browser",
      cosa: "Serve solo se vuoi rispondere dentro Tavolo invece che dall'apparecchio. Te li mandiamo con la chiave.",
      facoltativo: true,
      fatto: sip.pronto,
      corpo: (
        <form onSubmit={salvaSip} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sip-server">Indirizzo del centralino</Label>
              <Input
                id="sip-server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="wss://…"
                className="mt-1 font-mono text-xs"
                autoComplete="off"
                disabled={!canManage}
              />
            </div>
            <div>
              <Label htmlFor="sip-utente">Utenza</Label>
              <Input
                id="sip-utente"
                value={utente}
                onChange={(e) => setUtente(e.target.value)}
                className="mt-1"
                autoComplete="off"
                disabled={!canManage}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="sip-password">
              Password{" "}
              {sip.passwordPresente && (
                <span className="t-nota">— già salvata, lasciala vuota</span>
              )}
            </Label>
            <Input
              id="sip-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              autoComplete="new-password"
              disabled={!canManage}
            />
          </div>
          {!sip.sottoChiave && (
            <p className="t-nota">
              Su questa installazione non è configurata una chiave di cifratura:
              la password resta leggibile nel database. Scrivici se vuoi che la
              mettiamo sotto chiave.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={inCorso || !canManage}
            >
              {inCorso ? "Salvo…" : "Salva"}
            </Button>
            {salvato && !erroreSip && <span className="t-nota">Salvato.</span>}
            {erroreSip && (
              <span className="text-xs text-destructive">{erroreSip}</span>
            )}
          </div>
        </form>
      ),
    },
  ];

  const obbligatori = passi.filter((p) => !p.facoltativo);
  const fatti = obbligatori.filter((p) => p.fatto).length;

  return (
    <div className="space-y-4">
      {/* Dove sei, in una riga: quattro passi, quanti fatti. Senza questo, un
          elenco di cinque riquadri è ancora un elenco. */}
      <div className="riquadro flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="text-sm">
          {fatti === obbligatori.length ? (
            <>
              <Check
                className="mr-1.5 inline h-4 w-4 text-sage-strong"
                aria-hidden="true"
              />
              Il telefono è collegato e funziona.
            </>
          ) : (
            <>
              <Phone
                className="mr-1.5 inline h-4 w-4 text-accent-strong"
                aria-hidden="true"
              />
              Passo {fatti + 1} di {obbligatori.length}
            </>
          )}
        </p>
        <span className="t-nota">
          {fatti} di {obbligatori.length} fatti
        </span>
      </div>

      <ol className="space-y-3">
        {passi.map((passo) => (
          <li
            key={passo.numero}
            className={`riquadro p-4 ${passo.fatto ? "opacity-80" : ""}`}
          >
            <div className="flex gap-3">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  passo.fatto
                    ? "border-sage-strong/40 bg-sage-strong/15 text-sage-strong"
                    : "border-border bg-muted/60 text-foreground"
                }`}
              >
                {passo.fatto ? <Check className="h-4 w-4" /> : passo.numero}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{passo.titolo}</span>
                  {passo.facoltativo && (
                    <span className="t-nota">facoltativo</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {passo.cosa}
                </p>
                <div className="mt-3">{passo.corpo}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
