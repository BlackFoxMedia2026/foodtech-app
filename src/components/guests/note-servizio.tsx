"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Lock, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";

/**
 * Le tre cose che il servizio scrive su un cliente, scrivibili sul posto.
 *
 * ## Perché non dentro il dialogo «Modifica ospite»
 *
 * Ci stavano già, ed è il motivo per cui restavano vuote. Aggiungere «tavolo
 * tranquillo, preferisce il Garden» voleva dire aprire un modulo con nome,
 * cognome, email, telefono, data di nascita, livello di fedeltà e consenso
 * marketing, trovare il campo giusto in fondo, e salvare **tutta**
 * l'anagrafica per una riga di testo. Nessuno lo fa mentre serve ai tavoli.
 *
 * Qui si scrive dove si legge. È lo stesso gesto del `TagEditor`, applicato
 * al testo libero.
 *
 * ## I tre campi non sono la stessa cosa
 *
 * - **Allergie** è un fatto medico. Sta prima, ha il segnale, e quello che si
 *   scrive qui riappare sulla riga del servizio e sulla prenotazione
 *   (`lib/cosa-sapere`): è l'unico campo di questa pagina che cambia il
 *   comportamento di qualcun altro.
 * - **Preferenze** è come gli piace essere accolto. Si può dire al cliente.
 * - **Note riservate** è quello che il locale pensa e non dice. Il nome del
 *   campo è una promessa verso chi scrive, e per questo porta l'icona dello
 *   scudo: chi digita deve sapere, mentre digita, che quella riga non
 *   finisce in nessuna email.
 *
 * ## Il salvataggio
 *
 * Esplicito, con un pulsante. Non automatico: un salvataggio a ogni tasto su
 * un campo che contiene un'allergia significa che un ripensamento a metà
 * frase — «crosta… no, crostacei» — resta scritto a metà nel momento in cui
 * qualcuno apre la scheda dall'altra parte della sala. Il pulsante compare
 * solo quando c'è davvero qualcosa di diverso da salvare.
 */

type Campi = { allergies: string; preferenze: string; privateNotes: string };

export function NoteServizio({
  guestId,
  allergies,
  preferenze,
  privateNotes,
}: {
  guestId: string;
  allergies: string | null;
  /** La nota libera dentro `Guest.preferences.note`, già estratta. */
  preferenze: string | null;
  privateNotes: string | null;
}) {
  const router = useRouter();
  const salvati: Campi = {
    allergies: allergies ?? "",
    preferenze: preferenze ?? "",
    privateNotes: privateNotes ?? "",
  };

  const [bozza, setBozza] = useState<Campi>(salvati);
  const [stato, setStato] = useState<"fermo" | "salvo" | "fatto">("fermo");
  const [errore, setErrore] = useState<string | null>(null);

  /*
    Quando il server rimanda la pagina aggiornata, la bozza torna ad essere
    quello che c'è scritto davvero. Senza, dopo un salvataggio il campo
    continuerebbe a mostrare il testo locale e «Salva» resterebbe acceso su
    modifiche già salvate.

    La dipendenza è sui tre valori e non sull'oggetto: `salvati` è un letterale
    nuovo a ogni disegno, e metterlo lì dentro azzererebbe la bozza mentre si
    scrive.
  */
  useEffect(() => {
    setBozza({
      allergies: allergies ?? "",
      preferenze: preferenze ?? "",
      privateNotes: privateNotes ?? "",
    });
  }, [allergies, preferenze, privateNotes]);

  const cambiato =
    bozza.allergies !== salvati.allergies ||
    bozza.preferenze !== salvati.preferenze ||
    bozza.privateNotes !== salvati.privateNotes;

  async function salva() {
    setStato("salvo");
    setErrore(null);
    const res = await fetch(`/api/guests/${guestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // Il vuoto è `null` e non `""`: una stringa vuota in `allergies` è
        // un'allergia dichiarata che non dice niente, e `cosa-sapere`
        // mostrerebbe un segnale senza testo.
        allergies: bozza.allergies.trim() || null,
        privateNotes: bozza.privateNotes.trim() || null,
        preferences: bozza.preferenze.trim() ? { note: bozza.preferenze.trim() } : null,
      }),
    });

    if (!res.ok) {
      setStato("fermo");
      setErrore(await readApiError(res, "Non è stato possibile salvare. Riprova."));
      return;
    }

    setStato("fatto");
    router.refresh();
    window.setTimeout(() => setStato("fermo"), 2000);
  }

  return (
    <div className="space-y-3">
      <Campo
        id="note-allergie"
        icona={AlertTriangle}
        tono="allerta"
        etichetta="Allergie e intolleranze"
        aiuto="Compare come segnale sulla prenotazione e nella riga del servizio."
        valore={bozza.allergies}
        placeholder="Nessuna registrata"
        righe={2}
        onChange={(v) => setBozza((b) => ({ ...b, allergies: v }))}
      />
      <Campo
        id="note-preferenze"
        icona={Sparkles}
        tono="gusto"
        etichetta="Preferenze"
        aiuto="Come gli piace essere accolto: la sala, il tavolo, il tipo di accoglienza."
        valore={bozza.preferenze}
        placeholder="Es. tavolo tranquillo, preferisce la sala Garden"
        righe={2}
        onChange={(v) => setBozza((b) => ({ ...b, preferenze: v }))}
      />
      <Campo
        id="note-riservate"
        icona={Lock}
        tono="riservato"
        etichetta="Note riservate"
        aiuto="Restano dentro il locale: non entrano in nessun messaggio al cliente."
        valore={bozza.privateNotes}
        placeholder="Es. il 12 agosto ha contestato il conto, risolto dal direttore"
        righe={2}
        onChange={(v) => setBozza((b) => ({ ...b, privateNotes: v }))}
      />

      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}

      {/*
        Il pulsante c'è solo quando c'è qualcosa da salvare, e lascia il posto
        alla conferma quando è fatto: una riga che dice «Salva» su una scheda
        che nessuno ha toccato è un invito a premere per niente.
      */}
      {(cambiato || stato === "fatto") && (
      <div className="flex h-9 items-center gap-3">
        {cambiato && (
          <Button type="button" size="sm" onClick={salva} disabled={stato === "salvo"}>
            {stato === "salvo" && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Salva
          </Button>
        )}
        {stato === "fatto" && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
            <Check className="h-4 w-4" aria-hidden="true" /> Salvato
          </span>
        )}
      </div>
      )}
    </div>
  );
}

/*
  Ogni campo è una scheda col suo dischetto (3 novembre 2026), non
  un'etichetta sopra un riquadro grigio: tre tinte per tre cose diverse.
  L'allergia è oro, e quando è scritta la scheda intera si accende — è
  l'unica delle tre che cambia il servizio stasera. Le preferenze sono verdi,
  le note riservate neutre col lucchetto.
*/
const TONI = {
  allerta: {
    disco: "bg-accent/25 text-accent-strong",
    scheda: "border-accent/50 bg-accent/15",
    testata: "bg-accent/10",
    pastiglia: "bg-accent/20 text-accent-strong",
    chi: "in servizio",
  },
  gusto: {
    disco: "vetro kpi-pastiglia",
    scheda: "",
    testata: "bg-card-sunken/70",
    pastiglia: "bg-secondary/70 text-foreground",
    chi: "in sala",
  },
  riservato: {
    disco: "vetro kpi-pastiglia",
    scheda: "",
    testata: "bg-card-sunken/70",
    pastiglia: "bg-secondary/70 text-muted-foreground",
    chi: "solo staff",
  },
} as const;

function Campo({
  id,
  icona: Icona,
  etichetta,
  aiuto,
  valore,
  placeholder,
  righe,
  tono,
  onChange,
}: {
  id: string;
  icona: React.ComponentType<{ className?: string; stroke?: string }>;
  etichetta: string;
  aiuto: string;
  valore: string;
  placeholder: string;
  righe: number;
  tono: keyof typeof TONI;
  onChange: (v: string) => void;
}) {
  const t = TONI[tono];
  const acceso = tono === "allerta" && valore.trim() !== "";
  /*
    Un foglietto con la sua intestazione: la riga in alto dice cos'è e chi lo
    vede (la pastiglia a destra), sotto si scrive su carta bianca, senza un
    secondo bordo dentro il primo. La spiegazione lunga sta nel suggerimento
    e per i lettori di schermo: tre paragrafi di istruzioni sopra tre campi
    erano la parte più alta della scheda.
  */
  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm transition-colors focus-within:border-border-strong ${
        acceso ? t.scheda : "border-border/70"
      }`}
    >
      <div className={`flex items-center gap-2.5 px-3 py-2 ${acceso ? "" : t.testata}`} title={aiuto}>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.disco}`}>
          <Icona
            className="h-4 w-4"
            stroke={tono === "allerta" ? "currentColor" : "url(#trattoVetro)"}
            aria-hidden="true"
          />
        </span>
        <label htmlFor={id} className="min-w-0 flex-1 text-sm font-medium leading-snug">
          {etichetta}
        </label>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.pastiglia}`}>
          {t.chi}
        </span>
      </div>
      <p id={`${id}-aiuto`} className="sr-only">
        {aiuto}
      </p>
      <Textarea
        id={id}
        rows={righe}
        value={valore}
        placeholder={placeholder}
        aria-describedby={`${id}-aiuto`}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[3.5rem] resize-y rounded-none border-0 border-t border-border/60 bg-card px-3 py-2.5 text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
