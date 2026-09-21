import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TipoVoce, VoceStoria } from "@/server/storia-prenotazione";

/**
 * Cos'è successo a questa prenotazione.
 *
 * ## Perché serviva
 *
 * La pagina di una prenotazione diceva **com'è adesso** e niente di come ci è
 * arrivata. Le domande che si fanno davanti a un cliente al telefono sono
 * sempre le stesse: «chi l'ha spostata?», «la conferma è partita?», «l'ha
 * disdetta lui o l'abbiamo disdetta noi?». Le risposte erano nel database da
 * mesi — nel registro delle azioni, nei messaggi mandati, nella telefonata
 * collegata — e non c'era **nessuna schermata** che le mettesse in fila.
 *
 * ## Non è un registro di sistema
 *
 * Nessun nome di campo, nessuna differenza fra parentesi graffe, nessun
 * identificativo. Frasi: «Anna ha spostato da ven 19 set, 20:00 a ven 19 set,
 * 21:00». Un registro che si legge solo sapendo com'è fatto il database è un
 * registro che si guarda una volta.
 *
 * E l'esito dei messaggi fa parte del racconto: «conferma mandata» su un
 * messaggio non partito è la bugia che fa dire «ma io gliel'ho scritto».
 */

const SEGNO: Record<TipoVoce, string> = {
  nascita: "bg-sage-strong",
  telefonata: "bg-accent-strong",
  messaggio: "bg-muted-foreground",
  modifica: "bg-muted-foreground",
  stato: "bg-foreground",
  disdetta: "bg-destructive",
};

export function StoriaPrenotazione({
  voci,
  fuso,
}: {
  voci: VoceStoria[];
  fuso: string;
}) {
  /* Vuota non compare.
  
     Una prenotazione appena nata ha una voce sola — la nascita — e quella c'è
     sempre, letta dalla riga stessa. Quindi qui dentro non si arriva mai a
     zero: se succede, è perché la prenotazione non è di questo locale, e una
     scheda vuota col titolo «Cos'è successo» sarebbe l'unica cosa che dice
     qualcosa di sbagliato. */
  if (voci.length === 0) return null;

  const quando = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden="true" /> Cos&apos;è successo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {voci.map((v) => (
            <li key={v.id} className="flex gap-3">
              {/* Il filo verticale e il punto: si capisce che è una sequenza
                  senza scrivere «poi». */}
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEGNO[v.tipo]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {v.chi && <span className="font-medium">{v.chi} </span>}
                  {v.chi ? minuscola(v.cosa) : v.cosa}
                </p>
                <p className="t-nota tabular-nums">
                  {quando.format(new Date(v.quando))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/**
 * «Anna ha spostato», non «Anna Ha spostato».
 *
 * Le frasi arrivano scritte per stare da sole — «Disdetta», «Coperti da 4 a
 * 6» — e quando davanti c'è un nome la maiuscola diventa un errore di
 * stampa. Si abbassa solo la prima lettera: «Tavolo T10» dentro la frase resta
 * com'è, e «Segnata «seduta»» pure.
 */
function minuscola(testo: string): string {
  return testo.charAt(0).toLowerCase() + testo.slice(1);
}
