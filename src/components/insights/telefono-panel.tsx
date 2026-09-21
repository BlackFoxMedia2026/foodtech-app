"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NOME_ESITO, TONO_ESITO, type EsitoChiamata } from "@/lib/voice-esiti";

/**
 * I numeri del telefono, dentro le analitiche.
 *
 * ## La domanda a cui risponde, e che nessuna schermata sapeva
 *
 * **A che ora squilla, e in quelle ore c'è qualcuno che risponde?** Un locale
 * che perde cinque chiamate fra le 20 e le 21 non ha un problema di telefono:
 * ha una persona in meno in quella fascia. Si vede solo mettendo le ore in
 * fila, e per questo il grafico è a barre sovrapposte — risposte e perse nella
 * stessa colonna, perché il rapporto fra le due è l'informazione, non i due
 * numeri separati.
 *
 * ## Il numero che si commenta da sé
 *
 * «Il 12% delle telefonate diventa una prenotazione» è vero e può voler dire
 * due cose diverse, e la differenza la fa quante chiamate **nessuno ha
 * chiuso**. Se su cento ce ne sono quaranta senza esito, quel 12% è un
 * campione, non un risultato — e lo si scrive accanto, invece di lasciare che
 * passi per una misura.
 *
 * ## Aggregati, e basta
 *
 * Nessun nome e nessun numero di telefono: conteggi. Chi legge i numeri del
 * locale non sta leggendo i clienti — lo storico con nomi e numeri resta
 * dietro il suo permesso, nella pagina del telefono.
 */

export type NumeriTelefonoVista = {
  totale: number;
  risposte: number;
  perse: number;
  prenotazioni: number;
  conversione: number | null;
  senzaEsito: number;
  esiti: { esito: EsitoChiamata; quante: number }[];
  ore: { ora: number; risposte: number; perse: number }[];
  oraPeggiore: { ora: number; perse: number } | null;
};

export function TelefonoPanel({
  numeri,
  periodoGiorni,
}: {
  numeri: NumeriTelefonoVista;
  periodoGiorni: number;
}) {
  if (numeri.totale === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Il telefono</CardTitle>
          <CardDescription>
            Nessuna chiamata negli ultimi {periodoGiorni} giorni. Quando il
            centralino consegna le prime, qui si legge a che ora squilla e
            quante diventano prenotazioni.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  /* Solo le ore in cui è squillato: ventiquattro colonne di cui sedici vuote
     fanno sembrare il telefono morto, e schiacciano le quattro che contano.
     Si tiene la fascia dalla prima all'ultima ora con qualcosa dentro, così i
     buchi **dentro** il servizio restano visibili — un'ora a zero fra due ore
     piene è un'informazione. */
  const attive = numeri.ore.filter((o) => o.risposte + o.perse > 0);
  const prima = attive[0]?.ora ?? 0;
  const ultima = attive[attive.length - 1]?.ora ?? 23;
  const dati = numeri.ore
    .filter((o) => o.ora >= prima && o.ora <= ultima)
    .map((o) => ({
      ora: `${String(o.ora).padStart(2, "0")}`,
      Risposte: o.risposte,
      Perse: o.perse,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Il telefono</CardTitle>
        <CardDescription>
          {numeri.totale === 1 ? "Una chiamata" : `${numeri.totale} chiamate`}{" "}
          negli ultimi {periodoGiorni} giorni
          {numeri.conversione != null && (
            <>
              {" · "}
              <strong className="text-foreground">
                {numeri.conversione}% è diventata una prenotazione
              </strong>
            </>
          )}
          {/* La base del numero, accanto al numero: senza, una percentuale
              calcolata su un campione passa per una misura. */}
          {numeri.senzaEsito > 0 && (
            <>
              {" — "}
              {numeri.senzaEsito === 1
                ? "una chiamata non è stata chiusa"
                : `${numeri.senzaEsito} chiamate non sono state chiuse`}
              {", quindi di quelle non si sa com'è andata."}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Numero valore={numeri.risposte} etichetta="con risposta" />
          <Numero
            valore={numeri.perse}
            etichetta="senza risposta"
            allarme={numeri.perse > 0}
          />
          <Numero valore={numeri.prenotazioni} etichetta="hanno prenotato" />
        </div>

        {/* Il consiglio, **solo se c'è**: un'ora peggiore ricavata da una
            chiamata persa sola è un caso, e un consiglio ricavato da un caso
            fa perdere fiducia in tutti gli altri. */}
        {numeri.oraPeggiore && (
          <p className="riquadro bg-card/40 p-3 text-sm">
            Fra le {String(numeri.oraPeggiore.ora).padStart(2, "0")}:00 e le{" "}
            {String((numeri.oraPeggiore.ora + 1) % 24).padStart(2, "0")}:00 se
            ne perdono{" "}
            <strong>
              {numeri.oraPeggiore.perse === 1
                ? "una"
                : numeri.oraPeggiore.perse}
            </strong>
            : è la fascia in cui vale la pena che qualcuno stia vicino
            all&apos;apparecchio.
          </p>
        )}

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dati}
              margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="ora"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Sovrapposte e non affiancate: quello che si guarda è **quanta
                  parte** di un'ora è andata perduta. */}
              <Bar
                dataKey="Risposte"
                stackId="ora"
                fill="#cfad03"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="Perse"
                stackId="ora"
                fill="hsl(var(--destructive))"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {numeri.esiti.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {numeri.esiti.map((e) => (
              <Badge key={e.esito} tone={TONO_ESITO[e.esito]}>
                {NOME_ESITO[e.esito]}
                <span className="ml-1.5 tabular-nums">{e.quante}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Numero({
  valore,
  etichetta,
  allarme = false,
}: {
  valore: number;
  etichetta: string;
  allarme?: boolean;
}) {
  return (
    <div className="riquadro bg-card/40 p-3">
      <p
        className={`text-display text-2xl tabular-nums ${allarme ? "text-destructive-soft" : ""}`}
      >
        {valore}
      </p>
      <p className="mt-0.5 t-etichetta">{etichetta}</p>
    </div>
  );
}
