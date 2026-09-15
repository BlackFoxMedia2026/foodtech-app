import type { RisultatiCampagna } from "@/server/dem/statistiche";

const NUM = new Intl.NumberFormat("it-IT");
const DATA = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Com'è andata una campagna.
 *
 * Sette numeri e sette percentuali, e ogni percentuale ha sotto il numero da
 * cui viene: «42%» da solo non si può controllare, «42% — 6.840 su 12.312» sì.
 * È la differenza fra un cruscotto e un rendiconto.
 *
 * Le percentuali che non si possono ancora calcolare non diventano zero:
 * diventano un trattino. Una campagna partita dieci minuti fa non ha «0% di
 * aperture», ha aperture che non sono ancora arrivate — e scrivere zero è una
 * bocciatura inventata, che è il modo più veloce di far smettere qualcuno di
 * usare il marketing.
 */
export function RisultatiDem({ r }: { r: RisultatiCampagna }) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Dato etichetta="Inviate" numero={r.inviate} />
        <Dato etichetta="Consegnate" numero={r.consegnate} quota={r.tassoConsegna} />
        <Dato etichetta="Aperture" numero={r.aperte} quota={r.tassoApertura} />
        <Dato etichetta="Click" numero={r.click} quota={r.tassoClick} />
        <Dato etichetta="Non recapitate" numero={r.rimbalzi} quota={r.tassoRimbalzo} />
        <Dato etichetta="Disiscrizioni" numero={r.disiscrizioni} quota={r.tassoDisiscrizione} />
        <Dato etichetta="Segnalate come spam" numero={r.segnalazioni} />
        <Dato etichetta="Non riuscite" numero={r.nonRiuscite} />
      </dl>

      {r.linkPiuCliccati.length > 0 && (
        <section>
          <h3 className="t-etichetta">Link più cliccati</h3>
          <ul className="mt-2 space-y-1.5">
            {r.linkPiuCliccati.map((l) => (
              <li key={l.url} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">{l.url}</span>
                <span className="shrink-0 tabular-nums">{NUM.format(l.click)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.tappe.length > 0 && (
        <section>
          <h3 className="t-etichetta">Cronologia</h3>
          <ol className="mt-2 space-y-1.5">
            {r.tappe.map((t) => (
              <li key={t.etichetta} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{t.etichetta}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{DATA.format(t.quando)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/*
        L'onestà sulle aperture, scritta dove la si legge.

        I programmi di posta che proteggono la privacy caricano da soli
        l'immagine che misura l'apertura, e chi legge con le immagini spente
        non risulta mai. Il numero è utile per confrontare due campagne, non
        per dire quante persone hanno letto — e chi lo usa per decidere ha
        diritto di saperlo.
      */}
      <p className="t-nota">
        Le aperture sono una stima: alcuni programmi di posta le contano da soli, altri non le
        segnalano affatto. Servono per confrontare una campagna con l&apos;altra, non come conteggio
        esatto di chi ha letto.
      </p>
    </div>
  );
}

function Dato({
  etichetta,
  numero,
  quota,
}: {
  etichetta: string;
  numero: number;
  quota?: number | null;
}) {
  return (
    <div>
      <dt className="t-etichetta">{etichetta}</dt>
      <dd className="text-display mt-0.5 text-xl tabular-nums">{NUM.format(numero)}</dd>
      {quota !== undefined && (
        <p className="t-nota tabular-nums">
          {quota === null ? "—" : `${quota.toLocaleString("it-IT")}%`}
        </p>
      )}
    </div>
  );
}
