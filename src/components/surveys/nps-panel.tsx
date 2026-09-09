import Link from "next/link";
import { Frown, Info, Meh, Smile } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDate } from "@/lib/utils";
import type { SurveyStats } from "@/server/surveys";
import type { ReviewFunnel } from "@/server/reviews";

const TONO = {
  PROMOTER: { icona: Smile, classe: "text-sage", etichetta: "Promotore" },
  PASSIVE: { icona: Meh, classe: "text-muted-foreground", etichetta: "Passivo" },
  DETRACTOR: { icona: Frown, classe: "text-accent", etichetta: "Detrattore" },
} as const;

/**
 * Cosa pensa chi è già stato qui.
 *
 * Il numero grande è l'NPS: promotori meno detrattori, in percentuale. Va da
 * -100 a +100 e non è una media di stelle — un locale con metà clienti
 * entusiasti e metà delusi fa zero, ed è l'informazione giusta.
 *
 * Il conteggio delle risposte sta sempre accanto al punteggio: un NPS su
 * quattro risposte non è un dato, è un aneddoto, e senza il numero accanto non
 * si distinguono.
 */
export function NpsPanel({
  stats,
  funnel,
  giorni,
}: {
  stats: SurveyStats;
  funnel?: ReviewFunnel | null;
  /**
   * Su quanti giorni sono contati i voti. Non coincide sempre col periodo
   * scelto in Analytics: i voti hanno un minimo di trenta giorni, perché su
   * una settimana sarebbero troppo pochi per dire qualcosa. Dichiararlo è
   * l'unico modo per non far sembrare questi numeri parte del periodo sopra.
   */
  giorni: number;
}) {
  if (stats.sent === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cosa pensano gli ospiti</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Smile} title="Nessuna richiesta ancora inviata" compact>
            Il giorno dopo ogni visita Tavolo chiede all&apos;ospite com&apos;è andata, con una domanda
            sola. Chi è contento riceve il link per la recensione pubblica; chi non lo è ti scrive in
            privato, e tu lo sai subito.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cosa pensano gli ospiti</CardTitle>
        <CardDescription>
          {stats.responses} risposte su {stats.sent} richieste
          {stats.responseRate != null && ` · ${Math.round(stats.responseRate * 100)}% ha risposto`}
          {` · ultimi ${giorni} giorni`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">NPS</p>
            <p className="mt-0.5 text-display text-3xl">
              {stats.nps != null ? (stats.nps > 0 ? `+${stats.nps}` : stats.nps) : "—"}
            </p>
            {stats.responses > 0 && stats.responses < 10 && (
              <p className="text-[11px] text-tertiary-foreground">poche risposte: indicativo</p>
            )}
          </div>
          <Conteggio icona={Smile} etichetta="Promotori" valore={stats.promoters} classe="text-sage" />
          <Conteggio icona={Meh} etichetta="Passivi" valore={stats.passives} />
          <Conteggio icona={Frown} etichetta="Detrattori" valore={stats.detractors} classe="text-accent" />
        </div>

        {stats.trend.some((t) => t.responses > 0) && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Ultime quattro settimane
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {stats.trend.map((t) => (
                <div key={t.from} className="riquadro px-2 py-1.5">
                  <p className="text-sm">
                    {t.nps != null ? (t.nps > 0 ? `+${t.nps}` : t.nps) : "—"}
                  </p>
                  <p className="text-[11px] text-tertiary-foreground">
                    {t.responses} {t.responses === 1 ? "risposta" : "risposte"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {funnel && funnel.promotori > 0 && (
          /* Il pezzo che mancava alla catena: quanti, fra chi è uscito
             contento, hanno fatto il passo successivo. Si dice quello che
             sappiamo — chi è arrivato sulla piattaforma — e si dice anche
             quello che non sappiamo, perché un clic non è una recensione. */
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Dai promotori alle recensioni
            </p>
            <p className="mt-1.5 text-sm">
              <strong className="tabular-nums">{funnel.arrivati}</strong>{" "}
              {funnel.arrivati === 1 ? "promotore è andato" : "promotori sono andati"} a scrivere una
              recensione, su <strong className="tabular-nums">{funnel.promotori}</strong>.
            </p>
            {funnel.perPiattaforma.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {funnel.perPiattaforma.map((p) => `${p.nome}: ${p.clic}`).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-[11px] text-tertiary-foreground">
              Contiamo chi è arrivato sulla piattaforma. Se poi la recensione l&apos;abbia scritta
              davvero lo sa solo Google: quel numero non ce l&apos;ha nessun gestionale.
            </p>
          </div>
        )}

        {stats.recentComments.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cosa hanno scritto</p>
            <ul className="mt-2 space-y-2">
              {stats.recentComments.map((c) => {
                const t = TONO[c.sentiment];
                const Icona = t.icona;
                return (
                  <li key={c.id} className="riquadro p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icona className={cn("h-3.5 w-3.5", t.classe)} aria-hidden="true" />
                      <span className={t.classe}>{c.score}/10</span>
                      {c.guestName && (
                        <>
                          ·{" "}
                          {c.guestId ? (
                            <Link href={`/guests/${c.guestId}`} className="underline-offset-2 hover:underline">
                              {c.guestName}
                            </Link>
                          ) : (
                            c.guestName
                          )}
                        </>
                      )}
                      <span className="ml-auto">{formatDate(new Date(c.at))}</span>
                    </div>
                    <p className="mt-1.5 text-sm">{c.comment}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          L&apos;NPS va da -100 a +100 e non è una media di voti: è la quota di promotori (9-10) meno
          quella di detrattori (0-6). Un locale con metà clienti entusiasti e metà delusi fa zero.
        </p>
      </CardContent>
    </Card>
  );
}

function Conteggio({
  icona: Icona,
  etichetta,
  valore,
  classe,
}: {
  icona: typeof Smile;
  etichetta: string;
  valore: number;
  classe?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icona className={cn("h-3 w-3", classe)} aria-hidden="true" />
        {etichetta}
      </p>
      <p className="mt-0.5 text-display text-2xl">{valore}</p>
    </div>
  );
}
