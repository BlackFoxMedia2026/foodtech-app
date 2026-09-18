"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Phone, PhoneOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { COSA_CHIEDERE, OPERATORI, operatoreDa } from "@/lib/operatori-telefonici";
import { PermessoMicrofono } from "@/components/telefono/permesso-microfono";
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

/** La vista di `src/server/voice/ingresso.ts`, con le date gia in stringa. */
export type IngressoVista = {
  ingresso: "GATEWAY" | "DEVIAZIONE" | null;
  numeroPubblico: string | null;
  operatore: string | null;
  squilliChiesti: number | null;
  numeroTavolo: string | null;
  provata: boolean;
};

type Passo = {
  /**
   * L'ordine, **non** il numero mostrato.
   *
   * Il numero a schermo si calcola dopo, sui passi che restano: la strada
   * della scatoletta ne ha uno in meno di quella della deviazione, e un
   * elenco che va da 1 a 4 e poi salta a 6 sembra rotto — chi lo legge cerca
   * il cinque.
   */
  numero: number;
  titolo: string;
  /** Cosa fare, in una riga. */
  cosa: string;
  fatto: boolean;
  /** Il contenuto: il campo, il pulsante, il valore da copiare. */
  corpo: React.ReactNode;
  /**
   * Non entra nel conto dei passi, e la nota dice perché.
   *
   * Uno solo ce l'ha: rispondere dentro Tavolo. È **il modo** in cui questo
   * prodotto vuole che si risponda — il centralino consegna le chiamate e non
   * risponde più a niente — ma un locale che sceglie di rispondere
   * dall'apparecchio non è un locale «incompleto», e contarlo come mancante
   * gli lascerebbe addosso un «4 di 5» per sempre.
   */
  nota?: string;
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
  ingresso,
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
  ingresso: IngressoVista;
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

  /* --- passo 1 e 5: da dove entrano le chiamate ------------------------- */
  const [numeroPubblico, setNumeroPubblico] = useState(ingresso.numeroPubblico ?? "");
  const [operatore, setOperatore] = useState(ingresso.operatore ?? "");
  const [squilli, setSquilli] = useState(String(ingresso.squilliChiesti ?? 4));
  const [erroreIngresso, setErroreIngresso] = useState<string | null>(null);
  const [salvatoIngresso, setSalvatoIngresso] = useState(false);

  async function salvaIngresso(corpo: Record<string, unknown>) {
    setInCorso(true);
    setErroreIngresso(null);
    setSalvatoIngresso(false);
    const res = await fetch("/api/venue/centralino/ingresso", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setInCorso(false);
    if (!res.ok) {
      setErroreIngresso(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    setSalvatoIngresso(true);
    router.refresh();
  }

  const deviazione = ingresso.ingresso === "DEVIAZIONE";
  const opScelto = operatoreDa(operatore);

  /* --------------------------------------------------------------------- */

  const passi: Passo[] = [
    {
      numero: 1,
      titolo: "Dimmi come ti arrivano le telefonate",
      cosa: "È la prima cosa da sapere: le due strade chiedono gesti diversi, e partire da quella sbagliata ti fa fare lavoro per niente.",
      fatto: ingresso.ingresso != null,
      corpo: (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                id: "DEVIAZIONE" as const,
                titolo: "Un cellulare",
                riga: "Il numero resta il tuo. Chiedi al tuo operatore di deviare a noi quando non rispondi o sei occupato.",
              },
              {
                id: "GATEWAY" as const,
                titolo: "Un telefono fisso",
                riga: "Colleghiamo una scatoletta alla linea. Niente operatore da chiamare, e Tavolo vede anche le chiamate che prendi tu.",
              },
            ].map((scelta) => {
              const attiva = ingresso.ingresso === scelta.id;
              return (
                <button
                  key={scelta.id}
                  type="button"
                  onClick={() => salvaIngresso({ ingresso: scelta.id })}
                  disabled={inCorso || !canManage}
                  aria-pressed={attiva}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    attiva
                      ? "border-accent-strong/50 bg-accent-strong/10"
                      : "border-border hover:border-accent-strong/40"
                  } ${inCorso || !canManage ? "opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {attiva && <Check className="h-4 w-4 text-sage-strong" aria-hidden="true" />}
                    {scelta.titolo}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {scelta.riga}
                  </span>
                </button>
              );
            })}
          </div>
          {/* La differenza che conta, detta una volta e non ripetuta a ogni
              passo: con la deviazione Tavolo conosce solo le telefonate che
              l'operatore gli manda, e quelle che prendi tu non le conta. Chi
              guarda le analitiche del telefono deve saperlo prima, non
              scoprirlo davanti a un numero più basso del vero. */}
          {deviazione && (
            <p className="t-nota">
              Con la deviazione, Tavolo conosce solo le telefonate che ti vengono deviate: quelle
              a cui rispondi tu non passano da qui e non finiscono nei conteggi.
            </p>
          )}
          {erroreIngresso && <p className="text-xs text-destructive">{erroreIngresso}</p>}
        </div>
      ),
    },
    {
      numero: 2,
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
      numero: 3,
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
      numero: 4,
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
                  /* Detto per posizione e non per numero: i passi non sono
                     sempre gli stessi — con la scatoletta ce n'e uno in meno
                     che con la deviazione — e un «passo 2» scritto a mano
                     diventa falso il giorno che se ne aggiunge uno sopra. */
                  <span className="t-nota">
                    Prima serve la chiave: è il passo qui sopra.
                  </span>
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
    ...(deviazione
      ? [
          {
            numero: 5,
            titolo: "Chiedi la deviazione al tuo operatore",
            cosa: "La deviazione la imposta l'operatore telefonico, non Tavolo: noi possiamo dirti cosa chiedere e verificare che funzioni.",
            /* Fatto quando i dati ci sono. La **prova** e il passo dopo: qui
               si dichiara di aver chiamato l'operatore, la telefonata vera
               dice se ha funzionato. Due passi e non uno perche fra i due
               possono passare giorni — l'operatore non sempre attiva subito. */
            fatto: !!ingresso.numeroPubblico && !!ingresso.operatore,
            corpo: (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium">Il numero a cui far deviare</p>
                  {ingresso.numeroTavolo ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="select-all rounded bg-muted px-2 py-1 font-mono text-sm">
                        {ingresso.numeroTavolo}
                      </code>
                      <CopyButton value={ingresso.numeroTavolo} />
                    </div>
                  ) : (
                    /* Niente numero finto, e niente campo da riempire a mano:
                       il numero lo assegniamo noi, e un segnaposto qui
                       finirebbe detto all'operatore. */
                    <p className="mt-1 text-xs text-muted-foreground">
                      Non te l&apos;abbiamo ancora assegnato. Scrivici: è un numero nostro, lo
                      colleghiamo a questo locale e compare qui.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Cosa chiedere</p>
                  <ul className="space-y-1">
                    {COSA_CHIEDERE.map((riga) => (
                      <li key={riga} className="flex gap-2 text-xs leading-relaxed">
                        <span aria-hidden="true" className="text-accent-strong">
                          →
                        </span>
                        <span>{riga}</span>
                      </li>
                    ))}
                  </ul>
                  {/* I codici da comporre sulla SIM **non si scrivono qui**
                      finche non li abbiamo provati con una SIM di quel
                      operatore: un codice sbagliato non fa perdere le nostre
                      chiamate, fa perdere le sue. Vedi
                      `src/lib/operatori-telefonici.ts`. */}
                  {opScelto?.provato && opScelto.istruzioni ? (
                    <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                      {opScelto.istruzioni.passi.map((passo) => (
                        <li key={passo}>{passo}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="t-nota">
                      Chiamalo tu: i codici da comporre cambiano da operatore a operatore, e non
                      te ne scriviamo uno che non abbiamo provato — se sbagli, perdi le telefonate
                      dei tuoi clienti.
                    </p>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void salvaIngresso({
                      ingresso: "DEVIAZIONE",
                      numeroPubblico: numeroPubblico.trim() || undefined,
                      operatore: operatore || undefined,
                      squilliChiesti: Number(squilli) || undefined,
                    });
                  }}
                  className="space-y-3 border-t border-border/60 pt-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="voice-numero">Il numero che chiamano i tuoi clienti</Label>
                      <Input
                        id="voice-numero"
                        value={numeroPubblico}
                        onChange={(e) => setNumeroPubblico(e.target.value)}
                        inputMode="tel"
                        autoComplete="off"
                        disabled={!canManage}
                      />
                    </div>
                    <div>
                      <Label htmlFor="voice-operatore">Il tuo operatore</Label>
                      <select
                        id="voice-operatore"
                        value={operatore}
                        onChange={(e) => setOperatore(e.target.value)}
                        disabled={!canManage}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="">Scegli…</option>
                        {OPERATORI.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="max-w-[10rem]">
                    <Label htmlFor="voice-squilli">Dopo quanti squilli</Label>
                    <Input
                      id="voice-squilli"
                      type="number"
                      min={2}
                      max={10}
                      value={squilli}
                      onChange={(e) => setSquilli(e.target.value)}
                      disabled={!canManage}
                    />
                    {/* Detto qui, dove si digita: il campo serve a ricordarsi
                        cosa si e chiesto, non a comandare la rete. */}
                    <p className="t-nota mt-1">
                      Lo imposta l&apos;operatore, non Tavolo: lo teniamo scritto per ricordarti
                      cosa hai chiesto.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={inCorso || !canManage}
                    >
                      {inCorso ? "Salvo…" : "Salva"}
                    </Button>
                    {salvatoIngresso && !erroreIngresso && (
                      <span className="t-nota">Salvato.</span>
                    )}
                    {erroreIngresso && (
                      <span className="text-xs text-destructive">{erroreIngresso}</span>
                    )}
                  </div>
                </form>
              </div>
            ),
          } satisfies Passo,
        ]
      : []),
    {
      numero: 7,
      titolo: "Prova con una telefonata",
      cosa: deviazione
        ? "Chiama il numero del locale da un altro telefono e lascialo squillare senza rispondere: dopo gli squilli la telefonata deve comparire qui sotto."
        : "Chiama il numero del locale dal tuo cellulare: qui sotto deve comparire.",
      /*
        Due prove diverse, e non per pignoleria.

        Con la scatoletta basta che una telefonata sia arrivata: la strada e
        una sola. Con la deviazione no — una telefonata arrivata **prima**
        della richiesta all'operatore non prova niente, e lascerebbe una
        spunta verde su una deviazione che nessuno ha mai attivato. Quindi si
        chiede una telefonata **dopo** quella data (`provata`).
      */
      fatto: deviazione ? ingresso.provata : ultimaChiamata != null,
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
          {deviazione && ultimaChiamata && !ingresso.provata && (
            /* Il caso che senza questa riga sembra un guasto: una telefonata
               c'e, ma e piu vecchia della richiesta all'operatore. */
            <span className="t-nota">
              è arrivata prima che chiedessi la deviazione: serve una telefonata nuova.
            </span>
          )}
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
      numero: 6,
      titolo: "Rispondi dentro Tavolo",
      cosa: "Con questi dati il telefono squilla dentro Tavolo, su qualunque pagina, e si risponde da lì. Te li mandiamo insieme alla chiave.",
      nota: "se rispondi dall'apparecchio, salta",
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

          {/* Il permesso del microfono, **qui e non alla prima chiamata**.

              Il browser lo concede solo dopo un gesto: chiederlo al
              caricamento di una pagina lo fa bloccare in silenzio, e allora
              l'unica strada resta le impostazioni di Chrome — dove un
              ristoratore non va. Questo pulsante è il gesto, e sta nel punto
              della procedura in cui si sta configurando il telefono. */}
          <div className="border-t border-border/60 pt-3">
            <PermessoMicrofono />
          </div>
        </form>
      ),
    },
  ];

  /* L'ordine è quello in cui si fanno, e il conto salta quello che è una
     scelta: rispondere dentro Tavolo o dall'apparecchio è una scelta del
     locale, non un passo rimasto a metà. */
  const inOrdine = [...passi].sort((a, b) => a.numero - b.numero);
  const obbligatori = inOrdine.filter((p) => !p.nota);
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
        {inOrdine.map((passo, i) => (
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
                {/* Il numero mostrato e la posizione fra i passi che ci
                    sono, non la chiave d'ordine: con la scatoletta il passo
                    della deviazione non esiste, e un elenco 1-2-3-4-6-7 manda
                    a cercare il cinque. */}
                {passo.fatto ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{passo.titolo}</span>
                  {passo.nota && <span className="t-nota">{passo.nota}</span>}
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
