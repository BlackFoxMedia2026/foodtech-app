"use client";

import * as React from "react";
import { Check, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gli avvisi temporanei, con **annulla**.
 *
 * ## Perché servono, e perché prima non c'erano
 *
 * Nel prodotto non esisteva nessun sistema di notifiche temporanee: zero file.
 * Quindi ogni azione era o **silenziosa** — segni un arrivo e non succede
 * niente di visibile, e resta il dubbio di aver premuto — o protetta da una
 * **conferma**, che è una domanda in più per un gesto che si fa cinquanta
 * volte a sera.
 *
 * La terza via è questa: l'azione si fa subito, e per cinque secondi si può
 * tornare indietro. È più veloce di una conferma e più sicura del silenzio,
 * perché sposta la protezione **dopo** l'errore invece di metterla prima di
 * ogni gesto giusto.
 *
 * ## Le regole
 *
 * **La conferma preventiva resta solo per ciò che non si annulla**: la
 * cancellazione dei dati di una persona, l'annullamento di una gift card, un
 * rimborso. Per tutto il resto — arrivato, seduto, libera, avvisa, assegna —
 * si agisce e si offre l'annulla.
 *
 * **Un avviso alla volta.** In sala non si leggono tre messaggi impilati: il
 * nuovo sostituisce il vecchio. Se due azioni si susseguono, quella che conta
 * è l'ultima.
 *
 * **Non copre le azioni.** Sta in basso al centro su telefono, in basso a
 * destra da `md`, e sopra la barra di navigazione: un avviso che copre il
 * pulsante appena premuto costringe ad aspettare che sparisca.
 *
 * **`aria-live="polite"`**: chi usa un lettore di schermo sente cosa è
 * successo, ma senza essere interrotto a metà di un'altra frase.
 *
 * **Cinque secondi**, non tre: tre bastano a vedere il messaggio, non a
 * decidere di annullarlo. Se c'è un annulla, l'avviso resta sette.
 */
type Avviso = {
  id: number;
  testo: string;
  annulla?: () => void | Promise<void>;
  tono: "fatto" | "problema";
};

type Contesto = {
  /** «Sofia segnata come arrivata», con l'annulla se l'azione è reversibile. */
  mostra: (testo: string, annulla?: () => void | Promise<void>) => void;
  /** Un problema: resta più a lungo e non si annulla. */
  problema: (testo: string) => void;
};

const AvvisiContext = React.createContext<Contesto | null>(null);

const DURATA_MS = 5_000;
const DURATA_CON_ANNULLA_MS = 7_000;
const DURATA_PROBLEMA_MS = 9_000;

export function AvvisiProvider({ children }: { children: React.ReactNode }) {
  const [avviso, setAvviso] = React.useState<Avviso | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const prossimoId = React.useRef(0);

  const chiudi = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setAvviso(null);
  }, []);

  const apri = React.useCallback(
    (testo: string, tono: Avviso["tono"], annulla?: () => void | Promise<void>) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++prossimoId.current;
      setAvviso({ id, testo, annulla, tono });
      const durata =
        tono === "problema" ? DURATA_PROBLEMA_MS : annulla ? DURATA_CON_ANNULLA_MS : DURATA_MS;
      timer.current = setTimeout(() => {
        setAvviso((a) => (a?.id === id ? null : a));
      }, durata);
    },
    [],
  );

  const valore = React.useMemo<Contesto>(
    () => ({
      mostra: (testo, annulla) => apri(testo, "fatto", annulla),
      problema: (testo) => apri(testo, "problema"),
    }),
    [apri],
  );

  return (
    <AvvisiContext.Provider value={valore}>
      {children}
      {/*
        Il contenitore c'è sempre, anche vuoto: un'area `aria-live` creata nel
        momento in cui arriva il messaggio spesso non viene letta dai lettori
        di schermo, perché non era lì da annunciare.
      */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))] md:inset-x-auto md:right-6 md:justify-end md:pb-6"
      >
        {avviso && (
          <div
            className={cn(
              "avviso pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-xl border px-3 py-2.5 text-sm shadow-lg backdrop-blur",
              avviso.tono === "problema"
                ? "border-destructive/40 bg-destructive/15 text-foreground"
                : "border-border bg-card/95 text-foreground",
            )}
          >
            {avviso.tono === "fatto" && (
              <Check className="h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
            )}
            <span className="min-w-0">{avviso.testo}</span>
            {avviso.annulla && (
              <button
                type="button"
                onClick={async () => {
                  const fn = avviso.annulla;
                  chiudi();
                  await fn?.();
                }}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-white/5"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Annulla
              </button>
            )}
            <button
              type="button"
              onClick={chiudi}
              aria-label="Chiudi l'avviso"
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </AvvisiContext.Provider>
  );
}

/**
 * Da usare dentro l'area operativa.
 *
 * Fuori dal provider non lancia un errore: restituisce due funzioni che non
 * fanno niente. Un componente riusato in una pagina pubblica non deve
 * schiantarsi perché là non c'è nessuno che mostri avvisi.
 */
export function useAvvisi(): Contesto {
  const ctx = React.useContext(AvvisiContext);
  return ctx ?? SILENZIO;
}

const SILENZIO: Contesto = { mostra: () => {}, problema: () => {} };
