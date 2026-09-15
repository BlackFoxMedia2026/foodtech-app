"use client";

import { ChevronRight, ReceiptText } from "lucide-react";
import type { ContoTavolo } from "@/server/conto-tavolo";

/**
 * La cifra, e nient'altro.
 *
 * ## Niente contenitore
 *
 * Il riepilogo era una card alta con un elenco di voci incolonnate. Il
 * riquadro è sparito del tutto: un bordo intorno a un numero lo fa sembrare
 * **un dato fra i dati**, una riga di tabella con la cornice. Senza, la cifra
 * galleggia sul fondo ed è l'unica cosa sulla pagina che non ha bisogno di
 * essere contenuta — è la pagina.
 *
 * ## Due righe, e basta
 *
 * Qui sotto sono passate, una alla volta, quattro metriche affiancate, poi il
 * totale del conto, poi una barra di avanzamento. Ognuna difendibile da sola,
 * e tutte con lo stesso effetto: un numero che deve dominare non può avere
 * qualcosa attaccato sotto. Lo spazio vuoto sotto una cifra **è** il modo in
 * cui quella cifra si legge come importante; riempirlo la declassa a voce di
 * un elenco.
 *
 * Il totale e l'avanzamento non sono spariti: stanno più in basso, accanto
 * alla riga del conto, che è il posto dove hanno senso — lì si sta guardando
 * il conto, non decidendo quanto pagare. Vedi `AvanzamentoConto`.
 *
 * La cifra viene prima e l'etichetta dopo. Un'etichetta sopra si legge per
 * prima e prepara a un numero; sotto si legge solo se serve, e il numero
 * arriva senza preamboli.
 */
export function SaldoTavolo({ conto, euro }: { conto: ContoTavolo; euro: (c: number) => string }) {
  return (
    <section className="pb-2 pt-8 text-center">
      <p className="text-display text-[48px] leading-none tracking-tight">
        {euro(conto.residuoCents)}
      </p>
      <p className="mt-3.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Da pagare
      </p>
    </section>
  );
}

/**
 * Quanto è stato pagato finora, sotto la riga del conto.
 *
 * ## Perché quaggiù
 *
 * Stava sotto la cifra grande, e lì raccontava la cosa sbagliata: attaccata al
 * numero da pagare sembrava misurare **quel** numero, mentre misura il conto
 * del tavolo. Qui sta accanto alla riga che apre il conto, ed è la stessa
 * conversazione: *a che punto siamo*. Chi è arrivato per pagare e basta non ci
 * passa nemmeno con l'occhio.
 *
 * ## Su cosa si misura
 *
 * Su `daPagareCents` — quello che il tavolo deve davvero — e non su
 * `totaleCents`, che è quanto è stato consumato. Senza sconti i due numeri
 * coincidono e la frase si legge come ci si aspetta; con uno sconto in punti o
 * una gift card, misurare sul consumato darebbe una barra che non arriva mai
 * in fondo nemmeno a conto saldato. Il testo dice lo stesso numero della
 * barra, sempre: due cifre diverse a due centimetri di distanza sono un
 * errore, non una sfumatura.
 *
 * Il pezzo più chiaro in coda è quello che qualcun altro sta pagando
 * **adesso**: denaro non ancora incassato, che riempito come incassato farebbe
 * sembrare il residuo sbagliato.
 *
 * A zero non compare: una barra vuota sotto la scritta «0,00 € pagati» occupa
 * spazio per dire che non è successo niente.
 *
 * ## Visibile
 *
 * Il primo tentativo era alto tre pixel col fondo `bg-forest`, che su questo
 * sfondo è quasi lo stesso colore: la parte non pagata spariva e restava un
 * trattino verde sospeso nel nulla. Una barra di avanzamento senza il suo
 * binario non è discreta, è rotta — non si capisce più su cosa stia
 * avanzando. Otto pixel e `bg-border`, che qui è l'unico grigio-verde
 * pensato per essere visto senza gridare.
 *
 * Le due cifre stanno sulla stessa riga dell'etichetta, a destra, e non
 * pesano uguale: quella pagata è il dato, il totale è il contesto. Scritte
 * «32,00 € pagati su 122,00 €» pesavano identiche ed erano una frase da
 * leggere; così sono due numeri da confrontare, che è quello che si fa
 * davvero con loro.
 */
export function AvanzamentoConto({
  conto,
  euro,
}: {
  conto: ContoTavolo;
  euro: (c: number) => string;
}) {
  if (conto.pagatoCents <= 0 && conto.inCorsoCents <= 0) return null;

  const base = Math.max(conto.daPagareCents, 1);
  const quotaPagata = Math.min(100, (conto.pagatoCents / base) * 100);
  const quotaInCorso = Math.min(100 - quotaPagata, (conto.inCorsoCents / base) * 100);

  return (
    <section className="px-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">Pagato dal tavolo</span>
        <span className="text-[15px] font-semibold tabular-nums">
          {euro(conto.pagatoCents)}
          <span className="font-normal text-muted-foreground">
            {" / "}
            {euro(conto.daPagareCents)}
          </span>
        </span>
      </div>
      <div
        className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${euro(conto.pagatoCents)} pagati su ${euro(conto.daPagareCents)}`}
      >
        <span className="h-full rounded-full bg-sage-strong" style={{ width: `${quotaPagata}%` }} />
        <span className="h-full bg-sage-strong/35" style={{ width: `${quotaInCorso}%` }} />
      </div>
    </section>
  );
}

/**
 * «Il conto — 8 prodotti · 90,00 €», e una freccia.
 *
 * L'elenco dei piatti apriva sempre, sempre lungo, sempre sotto la scelta:
 * serve a controllare, e controllare è la cosa che fa **una persona su
 * dieci**. Ridotto a una riga diventa quello che è — una porta — e quando si
 * apre lo fa in un foglio, dove può essere lungo quanto vuole senza rubare
 * niente a chi voleva solo pagare.
 */
export function RigaConto({
  conto,
  euro,
  onApri,
}: {
  conto: ContoTavolo;
  euro: (c: number) => string;
  onApri: () => void;
}) {
  const pezzi = conto.righe.reduce((s, r) => s + r.disponibili, 0);
  const quanti = pezzi > 0 ? pezzi : conto.righe.reduce((s, r) => s + r.quantita, 0);

  return (
    <button
      type="button"
      onClick={onApri}
      className="surface flex w-full items-center gap-3 rounded-[20px] px-4 py-3.5 text-left transition duration-200 hover:border-accent/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ReceiptText className="h-5 w-5 shrink-0 text-accent-strong" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight">Il conto</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">
          {quanti} {quanti === 1 ? "prodotto" : "prodotti"} · {euro(conto.residuoCents)}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
