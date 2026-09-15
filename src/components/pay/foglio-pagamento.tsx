"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { centesimiDaTesto, quotaDivisa } from "@/lib/conto-diviso";
import type { ContoTavolo } from "@/server/conto-tavolo";
import type { Modo, Scelta, Selezione } from "./paga-al-tavolo";
import { BottoneFoglio, Foglio } from "./foglio";
import { CorpoQuota } from "./corpo-quota";
import { CorpoRighe, unitaDelConto } from "./corpo-righe";
import { CorpoImporto } from "./corpo-importo";
import { CorpoMancia, manciaScelta, type SceltaMancia } from "./corpo-mancia";

/**
 * Tutta la configurazione del pagamento, in un foglio solo.
 *
 * ## Perché un foglio e non quattro schermate
 *
 * Ogni modalità aveva la sua pagina piena, e la mancia una quinta: cinque
 * cambi di schermata fra «voglio pagare» e Stripe, su una rete di ristorante.
 * Qui c'è **un** pannello che sale, cambia contenuto al suo interno e scende.
 * Il conto resta visibile dietro per tutto il tempo, e la freccia in alto a
 * sinistra riporta al passo prima senza toccare la cronologia del browser —
 * che su una pagina aperta da un QR è l'unica cosa che riporterebbe alla
 * fotocamera.
 *
 * ## Chi tiene i conti
 *
 * Questo componente raccoglie **input**, non decide incassi. Da tutto quello
 * che la persona tocca ricava due cose — una `Scelta` e la cifra che crede di
 * pagare — e le passa a chi sa cosa farne. La cifra mostrata resta
 * un'anteprima: l'importo vero lo calcola il server sul residuo dell'istante
 * in cui si preme, e se non coincide il pagamento si ferma e si ricomincia.
 *
 * ## Lo stato si azzera quando il foglio si riapre
 *
 * Il pannello resta montato anche da chiuso — serve a farlo scendere con la
 * sua animazione invece di farlo sparire — quindi senza questo azzeramento chi
 * riapre «I miei prodotti» ritroverebbe selezionata la cena di dieci secondi
 * fa.
 */
export function FoglioPagamento({
  aperto,
  onApertoCambia,
  modo,
  conto,
  euro,
  email,
  onEmail,
  inCorso,
  onAvvia,
}: {
  aperto: boolean;
  onApertoCambia: (v: boolean) => void;
  modo: Modo;
  conto: ContoTavolo;
  euro: (c: number) => string;
  email: string;
  onEmail: (v: string) => void;
  inCorso: boolean;
  onAvvia: (scelta: Scelta, billCents: number, manciaCents: number) => void;
}) {
  const conMancia = conto.locale.tipsEnabled;

  const [passo, setPasso] = useState<"configura" | "mancia">("configura");
  const [parti, setParti] = useState(2);
  const [presi, setPresi] = useState<Set<string>>(new Set());
  const [testo, setTesto] = useState("");
  const [sceltaMancia, setSceltaMancia] = useState<SceltaMancia>("no");
  const [testoMia, setTestoMia] = useState("");

  useEffect(() => {
    if (!aperto) return;
    setPasso(modo === "tutto" ? "mancia" : "configura");
    setParti(2);
    setPresi(new Set());
    setTesto("");
    setSceltaMancia("no");
    setTestoMia("");
  }, [aperto, modo]);

  /* ---------------------------------------------------------------------- */
  /*  Dalla configurazione alla cifra                                       */
  /* ---------------------------------------------------------------------- */

  const unita = unitaDelConto(conto);
  const scelte = unita.filter((u) => presi.has(u.chiave));
  const sommaRighe = scelte.reduce((s, u) => s + u.prezzoCents, 0);
  const centesimiScritti = centesimiDaTesto(testo);

  const minimoCents = Math.min(conto.locale.minPaymentCents, conto.residuoCents);
  const problemaImporto =
    testo.trim() === ""
      ? null
      : centesimiScritti === null
        ? "Scrivi una cifra, per esempio 25,00"
        : centesimiScritti > conto.residuoCents
          ? `Non puoi pagare più di ${euro(conto.residuoCents)}`
          : centesimiScritti < minimoCents
            ? `Il minimo è ${euro(minimoCents)}`
            : null;

  const billCents =
    modo === "tutto"
      ? conto.residuoCents
      : modo === "quota"
        ? quotaDivisa(conto.residuoCents, parti)
        : modo === "righe"
          ? sommaRighe
          : (centesimiScritti ?? 0);

  const configurato =
    modo === "righe"
      ? sommaRighe > 0
      : modo === "importo"
        ? centesimiScritti !== null && !problemaImporto && centesimiScritti > 0
        : true;

  const tipCents = passo === "mancia" ? manciaScelta(sceltaMancia, testoMia) : 0;

  function scelta(): Scelta {
    if (modo === "quota") return { modo: "quota", parti };
    if (modo === "importo") return { modo: "importo", importoCents: billCents };
    if (modo === "righe") {
      // Le unità si raggruppano per riga: al server interessa «due di questa
      // riga», non quali due.
      const perRiga = new Map<string, number>();
      for (const u of scelte) perRiga.set(u.orderItemId, (perRiga.get(u.orderItemId) ?? 0) + 1);
      const selezione: Selezione[] = [...perRiga].map(([orderItemId, quantity]) => ({
        orderItemId,
        quantity,
      }));
      return { modo: "righe", selezione };
    }
    return { modo: "tutto" };
  }

  function avanti() {
    if (passo === "configura" && conMancia) setPasso("mancia");
    else onAvvia(scelta(), billCents, tipCents);
  }

  /* ---------------------------------------------------------------------- */

  const titolo =
    passo === "mancia"
      ? "Lasci una mancia?"
      : modo === "quota"
        ? "Dividi il conto"
        : modo === "righe"
          ? "Cosa vuoi pagare?"
          : "Quanto vuoi pagare?";

  const sottotitolo =
    passo === "mancia"
      ? undefined
      : modo === "quota"
        ? `Restano ${euro(conto.residuoCents)} da dividere.`
        : modo === "righe"
          ? "Tocca le tue portate. Quelle già pagate non si possono scegliere."
          : undefined;

  const etichetta = !configurato
    ? modo === "righe"
      ? "Scegli almeno una portata"
      : "Scrivi un importo"
    : inCorso
      ? "Un momento…"
      : passo === "configura" && conMancia
        ? `Continua con ${euro(billCents)}`
        : `Paga ${euro(billCents + tipCents)}`;

  return (
    <Foglio
      aperto={aperto}
      onApertoCambia={onApertoCambia}
      titolo={titolo}
      sottotitolo={sottotitolo}
      indietro={
        passo === "mancia" && modo !== "tutto" ? (
          <button
            type="button"
            onClick={() => setPasso("configura")}
            aria-label="Torna indietro"
            className="-ml-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : undefined
      }
      piede={
        <div className="space-y-2.5">
          {modo === "righe" && passo === "configura" && (
            <div className="flex items-baseline justify-between text-[15px]">
              <span className="text-muted-foreground">
                {scelte.length === 0
                  ? "Niente selezionato"
                  : `${scelte.length} ${scelte.length === 1 ? "portata" : "portate"}`}
              </span>
              <span className="text-display text-[22px] tabular-nums">{euro(sommaRighe)}</span>
            </div>
          )}
          <BottoneFoglio disabilitato={!configurato || inCorso} onClick={avanti}>
            {etichetta}
          </BottoneFoglio>
        </div>
      }
    >
      {passo === "mancia" ? (
        <CorpoMancia
          billCents={billCents}
          currency={conto.locale.currency}
          euro={euro}
          scelta={sceltaMancia}
          onScelta={setSceltaMancia}
          tipCents={tipCents}
          testoMia={testoMia}
          onTestoMia={setTestoMia}
          email={email}
          onEmail={onEmail}
        />
      ) : modo === "quota" ? (
        <CorpoQuota residuoCents={conto.residuoCents} euro={euro} parti={parti} onParti={setParti} />
      ) : modo === "righe" ? (
        <CorpoRighe
          unita={unita}
          euro={euro}
          presi={presi}
          onCommuta={(chiave) =>
            setPresi((prima) => {
              const dopo = new Set(prima);
              if (dopo.has(chiave)) dopo.delete(chiave);
              else dopo.add(chiave);
              return dopo;
            })
          }
        />
      ) : (
        <CorpoImporto
          residuoCents={conto.residuoCents}
          minimoCents={minimoCents}
          currency={conto.locale.currency}
          euro={euro}
          testo={testo}
          onTesto={setTesto}
          problema={problemaImporto}
        />
      )}
    </Foglio>
  );
}
