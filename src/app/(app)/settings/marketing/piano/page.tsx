import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, PauseCircle } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { statoConsumo, storicoConsumo } from "@/server/dem/consumo";
import { BarraConsumo } from "@/components/dem/barra-consumo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invii } from "@/lib/dem-piani";
import { nomeCiclo } from "@/lib/dem-quota";

export const dynamic = "force-dynamic";

const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

/**
 * «Il tuo piano DEM».
 *
 * La tentazione, su una pagina che parla di consumo e di soldi, è il cruscotto:
 * sei riquadri, due grafici, una tabella di fatture. Chi apre questa pagina ha
 * una domanda sola — **quante email posso ancora mandare** — e una seconda che
 * viene dopo: se il piano che ho mi basta.
 *
 * Quindi un numero grande, una barra, una data di rinnovo, un pulsante. Lo
 * storico dei mesi sta sotto ed è un elenco, non un grafico: tre righe di
 * numeri rispondono a «sto crescendo?» meglio di una spezzata su tre punti.
 */
export default async function PianoDemPage({
  searchParams,
}: {
  searchParams?: { pagamento?: string };
}) {
  const ctx = await getActiveVenue();
  const [stato, storico] = await Promise.all([
    statoConsumo(ctx.venueId),
    storicoConsumo(ctx.venueId, 6),
  ]);

  // Il ciclo in corso non sta fra «gli ultimi mesi»: è quello che si sta
  // leggendo nella scheda qui sopra, e ripeterlo due volte con due numeri che
  // cambiano insieme fa dubitare di entrambi.
  const mesiPassati = storico.filter((p) => p.yearMonth !== stato.ciclo);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-fade-in">
      {/* La via d'uscita verso la sezione da cui si arriva, non verso la cima
          delle Impostazioni: tornare indietro e dover ricercare dove si era è
          il modo più semplice di far sembrare lunga una pagina corta. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/settings#marketing">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header>
        <h1 className="t-titolo-pagina">Il tuo piano DEM</h1>
      </header>

      {/*
        Il ritorno dal pagamento **non** dice che il pagamento è riuscito:
        quell'indirizzo lo può aprire chiunque. Dice che il cliente è tornato,
        e che il piano nuovo comparirà qui appena l'evento firmato arriva —
        cioè quasi subito, ma non per forza in questo istante.
      */}
      {searchParams?.pagamento === "ok" && (
        <div className="surface flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage-strong" aria-hidden="true" />
          <div>
            <p className="t-titolo-scheda">Grazie: stiamo registrando il pagamento</p>
            <p className="t-nota mt-1">
              Il piano nuovo compare qui appena la conferma arriva, di solito in pochi secondi.
              Ricarica la pagina se non lo vedi ancora.
            </p>
          </div>
        </div>
      )}

      {stato.sospeso && (
        <div className="surface flex items-start gap-3 p-4">
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive-soft" aria-hidden="true" />
          <div>
            <p className="t-titolo-scheda">Invii temporaneamente sospesi</p>
            <p className="t-nota mt-1">
              Abbiamo messo in pausa le spedizioni per proteggere la reputazione del tuo dominio.
              Le campagne, i contatti e le statistiche restano dove sono.
            </p>
          </div>
        </div>
      )}

      <section className="surface p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-display text-xl">{stato.pianoNome}</h2>
            {stato.pianoSlug === "incluso" && <Badge tone="info">Compreso in Foodtech</Badge>}
          </div>
          <p className="t-nota">Rinnovo il {FORMATO_DATA.format(stato.rinnovoIl)}</p>
        </div>

        <p className="text-display mt-5 text-[44px] leading-none tracking-tight tabular-nums md:text-[56px]">
          {invii(stato.usati)}
        </p>
        <p className="t-corpo mt-1.5 text-muted-foreground">
          email utilizzate questo mese, su {invii(stato.limite)} disponibili
        </p>

        <BarraConsumo
          className="mt-5"
          limite={stato.limite}
          usati={stato.usati}
          riservati={stato.riservati}
        />

        <p className="t-corpo mt-3">
          <span className="tabular-nums">{invii(stato.disponibili)}</span> email ancora disponibili
          {stato.riservati > 0 && (
            <span className="text-muted-foreground">
              {" "}
              — {invii(stato.riservati)} già impegnate da campagne programmate
            </span>
          )}
        </p>

        {stato.pianoProgrammato && (
          <p className="t-nota mt-3">
            Piano {stato.pianoProgrammato} attivo dal {FORMATO_DATA.format(stato.rinnovoIl)}.
          </p>
        )}

        <div className="mt-6">
          <Button asChild variant="accent">
            <Link href="/settings/marketing/piano/confronto">
              Gestisci piano <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="surface p-5 md:p-6">
        <h2 className="t-titolo-sezione">Ultimi mesi</h2>
        {mesiPassati.length === 0 ? (
          <p className="t-nota mt-3">
            Questo è il tuo primo mese: qui comparirà quanto hai inviato, mese per mese.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {mesiPassati.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="t-corpo capitalize">{nomeCiclo(p.yearMonth)}</span>
                <span className="t-dato tabular-nums">
                  {invii(p.used)}
                  <span className="text-muted-foreground"> / {invii(p.monthlyLimit)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="t-nota">
        Gli invii si contano per destinatario: una campagna mandata a 200 contatti vale 200 invii.
        Chi si è disiscritto, chi non ha dato il consenso e gli indirizzi che non funzionano non
        vengono contati — e nemmeno inviati.
      </p>
    </div>
  );
}
