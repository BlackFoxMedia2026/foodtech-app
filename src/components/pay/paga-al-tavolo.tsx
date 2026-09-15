"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, UtensilsCrossed } from "lucide-react";
import type { ContoTavolo } from "@/server/conto-tavolo";
import { formatCurrency } from "@/lib/utils";
import { Foglio } from "./foglio";
import { FoglioConto } from "./foglio-conto";
import { FoglioPagamento } from "./foglio-pagamento";
import { SceltaModalita } from "./scelta-modalita";
import { AvanzamentoConto, RigaConto, SaldoTavolo } from "./riepilogo-conto";

/**
 * Il flusso di pagamento, dall'apertura del QR alla pagina di Stripe.
 *
 * ## Una schermata, e pannelli che salgono
 *
 * Era una sequenza di pagine piene: il conto, la scelta, la configurazione, la
 * mancia. Corretta e lenta — quattro cambi di schermata su una rete di
 * ristorante, e a ogni cambio spariva la cifra che si stava per pagare. Qui
 * c'è **una** schermata: chi, quanto, e quattro riquadri per decidere come.
 * Tutto il resto sale dal basso e riscende, lasciando il conto visibile
 * dietro.
 *
 * La differenza non è di gusto. Una pagina che si sostituisce è il gesto di un
 * sito e si legge come tale; un pannello che sale è il gesto che la gente ha
 * nelle dita da dieci anni di telefoni, e non va insegnato a nessuno.
 *
 * ## La cifra sullo schermo non è la cifra che si paga
 *
 * Tutto quello che si vede qui è un'anteprima. L'importo vero lo calcola il
 * server quando si preme «paga», sul residuo di quell'istante: fra quando
 * Giulia sceglie «dividi in quattro» e quando conferma, Mario può aver già
 * pagato. Quando succede, il server risponde «il conto è cambiato» e questo
 * componente **rifà il conto invece di insistere** — vedi `mostraCambiato`.
 *
 * ## Perché il conto si aggiorna da solo
 *
 * Una sonda ogni cinque secondi, ferma quando la scheda è nascosta. È lo stesso
 * principio della sala (`lib/use-servizio-vivo.ts`), ma qui non si può
 * riusarne il codice: quello interroga un indirizzo protetto da sessione, e chi
 * è a tavola non ha una sessione. Le regole però restano le stesse — una
 * richiesta alla volta, niente richieste a schermo spento.
 */

export type Modo = "tutto" | "quota" | "righe" | "importo";

export type Selezione = { orderItemId: string; quantity: number };

export type Scelta =
  | { modo: "tutto" }
  | { modo: "quota"; parti: number }
  | { modo: "righe"; selezione: Selezione[] }
  | { modo: "importo"; importoCents: number };

/** Ogni quanto si chiede al server se il conto è cambiato. */
const SONDA_MS = 5_000;

/**
 * La forma che risponde `GET /api/public/pay/[token]/stato`.
 *
 * **Non è un `ContoTavolo`**, ed è deliberato: quell'indirizzo è pubblico e
 * spoglia la risposta di tutto quello che non deve uscire da un locale —
 * identificativi interni compresi. Quindi le impostazioni di pagamento
 * arrivano srotolate in cima (`currency`, `mancia`, `minimoCents`) invece che
 * dentro `locale`, e `locale` porta solo le tre cose che si vedono in testata.
 *
 * Va dichiarata perché la fusione qui sotto **non può essere uno spread**: un
 * `{...prima, ...fresco}` sostituirebbe `conto.locale` intero con la versione
 * ridotta, e da lì in poi la valuta, le mance e il minimo non esisterebbero
 * più. Il difetto era silenzioso — compariva cinque secondi dopo l'apertura,
 * e si vedeva solo come un passo mancia che smetteva di comparire.
 */
type RispostaStato = {
  stato: ContoTavolo["stato"];
  tavolo: string;
  locale: { nome: string; logoUrl: string | null; accento: string | null };
  currency: string;
  mancia: { attiva: boolean; percentuali: number[] };
  minimoCents: number;
  totaleCents: number;
  scontiCents: number;
  daPagareCents: number;
  pagatoCents: number;
  inCorsoCents: number;
  residuoCents: number;
  righe: {
    id: string;
    nome: string;
    prezzoUnitarioCents: number;
    quantita: number;
    pagate: number;
    disponibili: number;
  }[];
};

export function PagaAlTavolo({
  token,
  iniziale,
  locale,
}: {
  token: string;
  iniziale: ContoTavolo;
  locale: { nome: string; logoUrl: string | null; accento: string | null };
}) {
  const [conto, setConto] = useState(iniziale);
  const [foglio, setFoglio] = useState<null | "conto" | "pagamento">(null);
  // La modalità resta impostata anche a foglio chiuso: senza, il pannello si
  // svuoterebbe a metà della discesa.
  const [modo, setModo] = useState<Modo>("tutto");
  const [email, setEmail] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [cambiato, setCambiato] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [invio, setInvio] = useState(false);

  /* ---------------------------------------------------------------------- */
  /*  La sonda                                                              */
  /* ---------------------------------------------------------------------- */

  const inVolo = useRef(false);

  const ricarica = useCallback(async (): Promise<RispostaStato | null> => {
    if (inVolo.current) return null;
    inVolo.current = true;
    try {
      const res = await fetch(`/api/public/pay/${token}/stato`, { cache: "no-store" });
      if (!res.ok) return null;
      const fresco = (await res.json()) as RispostaStato;
      setConto((prima) => {
        // Il residuo è sceso mentre la persona sta scegliendo: si avverte,
        // invece di lasciarle premere un pulsante con una cifra vecchia.
        if (fresco.residuoCents !== prima.residuoCents) setCambiato(true);
        return {
          ...prima,
          stato: fresco.stato,
          tavolo: fresco.tavolo,
          totaleCents: fresco.totaleCents,
          scontiCents: fresco.scontiCents,
          daPagareCents: fresco.daPagareCents,
          pagatoCents: fresco.pagatoCents,
          inCorsoCents: fresco.inCorsoCents,
          residuoCents: fresco.residuoCents,
          locale: {
            ...prima.locale,
            ...fresco.locale,
            currency: fresco.currency,
            tipsEnabled: fresco.mancia.attiva,
            tipPresets: fresco.mancia.percentuali,
            minPaymentCents: fresco.minimoCents,
          },
          // `impegnate` non viaggia — si ricava, ed è l'unico campo di una
          // riga che la risposta pubblica non dice.
          righe: fresco.righe.map((r) => ({
            ...r,
            impegnate: r.quantita - r.pagate - r.disponibili,
          })),
        };
      });
      return fresco;
    } catch {
      // Rete che salta: si tiene la fotografia che c'è. Svuotare lo schermo di
      // chi sta pagando sarebbe il modo peggiore di raccontare un problema di
      // rete.
      return null;
    } finally {
      inVolo.current = false;
    }
  }, [token]);

  useEffect(() => {
    // A pagamento avviato non si interroga più: la persona è su Stripe.
    if (invio) return;

    const tic = setInterval(() => {
      if (document.visibilityState === "visible") void ricarica();
    }, SONDA_MS);
    const sveglia = () => {
      if (document.visibilityState === "visible") void ricarica();
    };
    document.addEventListener("visibilitychange", sveglia);
    return () => {
      clearInterval(tic);
      document.removeEventListener("visibilitychange", sveglia);
    };
  }, [ricarica, invio]);

  /* ---------------------------------------------------------------------- */
  /*  Andare avanti                                                         */
  /* ---------------------------------------------------------------------- */

  const euro = (c: number) => formatCurrency(c, conto.locale.currency);

  function scegli(m: Modo) {
    setErrore(null);
    setModo(m);
    // «Paga tutto» senza mance non ha niente da chiedere: si va dritti a
    // Stripe invece di aprire un pannello con dentro un solo pulsante.
    if (m === "tutto" && !conto.locale.tipsEnabled) void avvia({ modo: "tutto" }, conto.residuoCents, 0);
    else setFoglio("pagamento");
  }

  async function avvia(s: Scelta, bill: number, mancia: number) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/public/pay/${token}/avvia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...s,
          manciaCents: mancia,
          email: email.trim() || undefined,
          // Quello che la persona crede di pagare. Se il server calcola
          // diverso, si ferma tutto e si rifà il conto.
          attesoCents: bill,
        }),
      });

      const dati = await res.json();

      if (!res.ok) {
        setInCorso(false);
        setFoglio(null);
        if (dati.errore === "conto_cambiato" || dati.errore === "righe_non_disponibili") {
          await ricarica();
          setCambiato(true);
          return;
        }
        setErrore(dati.messaggio ?? "Non siamo riusciti ad aprire il pagamento. Riprova.");
        return;
      }

      // Da qui in poi comanda Stripe. Non si torna indietro da soli: se la
      // persona annulla, Stripe la riporta su questa pagina.
      setInvio(true);
      window.location.href = dati.url;
    } catch {
      setInCorso(false);
      setFoglio(null);
      setErrore("Connessione persa. Controlla la rete e riprova.");
    }
  }

  /* ---------------------------------------------------------------------- */

  const saldato = conto.residuoCents <= 0 && conto.pagatoCents > 0;

  return (
    <main className="min-h-[100dvh] bg-background px-5 pb-6 pt-7 text-foreground">
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-5">
        <Testata locale={locale} tavolo={conto.tavolo} />

        {cambiato && (
          <button
            type="button"
            onClick={() => setCambiato(false)}
            className="rounded-2xl border border-accent/40 bg-accent/15 px-4 py-3 text-left text-[13px] leading-snug text-foreground"
          >
            <strong className="font-semibold">Il conto è appena stato aggiornato.</strong>{" "}
            Qualcun altro ha pagato una parte. Tocca per continuare.
          </button>
        )}

        {errore && (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-[13px] leading-snug text-foreground"
          >
            {errore}
          </p>
        )}

        {saldato ? (
          <ContoSaldato euro={euro} conto={conto} />
        ) : (
          // Il saldo e la domanda stanno più stretti fra loro che con il
          // resto: sono un gesto solo — «devo novanta euro, come li pago» — e
          // uno spazio uguale a tutti gli altri li faceva leggere come due
          // sezioni indipendenti.
          <div className="flex flex-col gap-3">
            <SaldoTavolo conto={conto} euro={euro} />
            <SceltaModalita
              residuoCents={conto.residuoCents}
              euro={euro}
              haRighe={conto.righe.some((r) => r.disponibili > 0)}
              onScegli={scegli}
            />
          </div>
        )}

        {/* Il conto e il suo avanzamento sono la stessa conversazione — «a che
            punto siamo» — e stanno stretti fra loro come il saldo e la
            domanda. La barra qui sotto misura il conto del tavolo, non la
            cifra in cima: attaccata a quella sembrava misurare lei. */}
        {/* Senza righe e senza pagamenti qui non c'è niente da mostrare, e un
            contenitore vuoto lascerebbe quaranta pixel di vuoto fra le
            modalità e la nota di Stripe. */}
        {(conto.righe.length > 0 || conto.pagatoCents > 0 || conto.inCorsoCents > 0) && (
          <div className="flex flex-col gap-3">
            {conto.righe.length > 0 && (
              <RigaConto conto={conto} euro={euro} onApri={() => setFoglio("conto")} />
            )}
            <AvanzamentoConto conto={conto} euro={euro} />
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Pagamento sicuro con Stripe
        </p>
      </div>

      <Foglio
        aperto={foglio === "conto"}
        onApertoCambia={(v) => setFoglio(v ? "conto" : null)}
        titolo="Il conto"
        sottotitolo={`Tavolo ${conto.tavolo}`}
      >
        <FoglioConto conto={conto} euro={euro} />
      </Foglio>

      <FoglioPagamento
        aperto={foglio === "pagamento"}
        onApertoCambia={(v) => setFoglio(v ? "pagamento" : null)}
        modo={modo}
        conto={conto}
        euro={euro}
        email={email}
        onEmail={setEmail}
        inCorso={inCorso}
        onAvvia={avvia}
      />

      {invio && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/95 px-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-accent-strong" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Ti stiamo portando al pagamento sicuro…</p>
        </div>
      )}
    </main>
  );
}

/**
 * Chi sei e dove sei, in una riga.
 *
 * Era una testata centrata con il logo sopra il nome sopra il tavolo: bella, e
 * alta quanto un quarto di telefono per dire una cosa che nessuno è lì a
 * leggere. In orizzontale costa una riga e dice le stesse tre cose — ed è la
 * forma che ha la testata di ogni app che si apre per fare qualcosa.
 */
function Testata({
  locale,
  tavolo,
}: {
  locale: { nome: string; logoUrl: string | null };
  tavolo: string;
}) {
  return (
    <header className="flex items-center gap-3">
      {locale.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={locale.logoUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl object-contain"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-forest">
          <UtensilsCrossed className="h-5 w-5 text-accent-strong" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-display truncate text-[20px] leading-tight">{locale.nome}</h1>
        <p className="text-[13px] leading-tight text-muted-foreground">Tavolo {tavolo}</p>
      </div>
    </header>
  );
}

/** Quando non c'è più niente da pagare: si dice, e si smette di chiedere. */
function ContoSaldato({ euro, conto }: { euro: (c: number) => string; conto: ContoTavolo }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-forest/70 px-5 py-6 text-center">
      <Check className="mx-auto h-9 w-9 text-sage-strong" aria-hidden="true" />
      <p className="text-display mt-2 text-[20px] leading-tight">Il conto è saldato</p>
      <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">
        Sono stati pagati {euro(conto.pagatoCents)}. Non serve altro: potete andare quando volete.
      </p>
    </div>
  );
}
