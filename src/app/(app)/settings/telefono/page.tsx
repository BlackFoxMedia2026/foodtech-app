import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquareText, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { risposteDelLocale } from "@/server/voice/conoscenza";
import { saluteVoice } from "@/server/voice/salute";
import { RisposteTelefono } from "@/components/settings/risposte-telefono";

export const dynamic = "force-dynamic";

/**
 * Cosa rispondere al telefono.
 *
 * ## Perché una pagina sua
 *
 * Perché è l'unica parte del telefono che si **scrive**, e scrivere dieci
 * frasi con le parole per trovarle non sta in una riga di Impostazioni accanto
 * a un interruttore. Il resto del telefono — la chiave, il collegamento, le
 * credenziali — sono valori: si leggono e si incollano.
 *
 * ## Il risponditore automatico non è qui, e non c'è
 *
 * Questa è la base di conoscenza che un risponditore leggerebbe, e serve già
 * da sola: la cerca chi risponde al telefono mentre parla, e la legge
 * l'assistente quando gli si chiede cosa dire. Il risponditore che **parla**
 * ha bisogno di un fornitore che sappia far parlare una voce, e quello di oggi
 * non lo sa fare: lo dice la riga «Cosa non fa ancora» in Impostazioni →
 * Telefono, e qui non c'è nessun interruttore spento ad aspettarlo.
 *
 * Quando ci sarà, questa pagina non cambia: cambia chi legge queste frasi.
 */
export default async function RisposteTelefonoPage() {
  const ctx = await getActiveVenue();
  const stato = await statoCentralino(ctx.venueId);
  /* Come la pagina del telefono: 404 senza licenza e senza il permesso. La
     voce che porta qui non c'è in nessuno dei due casi. */
  if (!stato.attivo || !can(ctx.role, "use_phone")) notFound();

  const [risposte, salute] = await Promise.all([
    risposteDelLocale(ctx.venueId),
    saluteVoice(ctx.venueId),
  ]);

  const puoScrivere = can(ctx.role, "manage_phone");

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-3xl gap-4">
      <div className="fissa">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings?sez=sistema">
            <ArrowLeft className="h-4 w-4" /> Torna alle impostazioni
          </Link>
        </Button>
      </div>

      <header className="fissa">
        <p className="t-etichetta">Telefono</p>
        <h1 className="text-display text-2xl">Cosa rispondere</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le domande che arrivano venti volte al giorno, con la risposta che il
          locale ha deciso. Si cercano dalla pagina Telefono mentre si parla, e
          le legge anche l&apos;assistente.
        </p>
      </header>

      <div className="fill-scroll space-y-4 pr-0.5">
        <RisposteTelefono risposte={risposte} canManage={puoScrivere} />

        {!puoScrivere && (
          <p className="t-nota">
            Le risposte le scrive chi gestisce il telefono del locale. Tu le
            puoi leggere e cercare dalla pagina Telefono.
          </p>
        )}

        {/*
          Quello che il telefono non sa fare, detto qui perché è qui che uno
          si chiede «e il risponditore automatico?». Non un interruttore
          spento: una frase.
        */}
        {salute.nonSannoFare.length > 0 && (
          <div className="riquadro p-3">
            <p className="flex items-center gap-2 t-etichetta">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              Cosa non fa ancora questa linea
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {salute.nonSannoFare.join(", ")}. I comandi che la linea non sa
              eseguire non compaiono da nessuna parte: un pulsante che non
              trasferisce è peggio della sua assenza.
            </p>
            <p className="mt-2 flex items-start gap-2 t-nota">
              <MessageSquareText
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Il giorno in cui la linea saprà far parlare una voce, sarà questa
              la base di conoscenza che leggerà. Quello che si scrive adesso non
              si riscrive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
