import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * **Il ritmo della Home** — il titolo di sezione e il vuoto leggero.
 *
 * Stanno insieme perché sono un solo oggetto di progettazione: quello che
 * separa una sezione dall'altra. Tenerli in due file vorrebbe dire cambiarne
 * due ogni volta che si corregge una spaziatura.
 *
 * ## Cosa è uscito da qui, e dove è andato
 *
 * - i **tasti dei tavoli** stanno in `griglia-tavoli.tsx` da quando la Sala
 *   usa la stessa griglia: il componente di due schermate non può vivere in
 *   casa di una sola;
 * - **«Da fare»** e **«Da accomodare»** sono diventati una cosa sola,
 *   `da-gestire.tsx`. Erano due elenchi di cose urgenti impilati, e per
 *   scegliere cosa fare bisognava leggerli tutti e due — che è il contrario
 *   di una coda. Il ragionamento per esteso sta in testa a quel file.
 *
 * ## La regola che resta
 *
 * **Lo stato si guarda, l'azione si legge.**
 *
 * I tavoli sono disegnati e non descritti: forma, dimensione e colore dicono
 * com'è messo il tavolo senza una parola. Le cose da fare invece sono card
 * con una frase e un tasto, perché «vai al tavolo 9, non hanno ancora
 * ordinato» non è uno stato — è una frase, e un'icona colorata non la
 * sostituisce.
 */

/* -------------------------------------------------------------------------- */
/*  Il titolo di una sezione                                                   */
/* -------------------------------------------------------------------------- */

export function Sezione({
  titolo,
  azione,
  children,
}: {
  titolo: string;
  azione?: { testo: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <h2 className="sa-sezione">{titolo}</h2>
        {azione && (
          /* Alto 44 px anche se il testo ne occupa venti: quello che si tocca
             si misura col pollice, non col carattere. Il margine negativo lo
             rimette in linea con la base del titolo. */
          <Link
            href={azione.href}
            className="-my-2 -mr-1 inline-flex min-h-[44px] shrink-0 items-center gap-0.5 px-1 text-[0.9375rem] font-medium text-accent-strong"
          >
            {azione.testo}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Il vuoto                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Il vuoto leggero.**
 *
 * Una riga sola con una strada, e soprattutto **dice cosa fare** invece di
 * limitarsi a constatare che non c'è niente.
 *
 * Adesso compare molto meno di prima, ed è il punto: si mostra solo quando
 * anche «Da gestire ora» è vuota. Sopra una coda piena, «nessun tavolo
 * assegnato» contraddiceva lo schermo — il cameriere *stava* gestendo dei
 * tavoli, semplicemente nessuno gliene aveva assegnato uno, e da quando può
 * prenderseli da solo la frase era anche un vicolo cieco.
 */
export function NessunTavolo() {
  return (
    <Link href="/staff-app/sala" className="sa-tocco sa-piano flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="sa-corpo font-medium">Nessun tavolo assegnato</p>
        <p className="sa-nota mt-0.5">Prendine uno dalla sala.</p>
      </div>
      {/*
        L'icona è uscita. In un riquadro largo 310 px, un quadratino
        decorativo a sinistra costava trentadue pixel e mandava a capo
        «Nessun tavolo assegnato» — cioè il testo che doveva accompagnare.
        Un'icona che rompe la frase che illustra non è un'icona semantica.
      */}
      <span className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-[0.8125rem] font-medium text-accent-strong">
        Apri sala
      </span>
    </Link>
  );
}
