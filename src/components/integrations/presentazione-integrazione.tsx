import { Check } from "lucide-react";
import type { DettaglioCliente } from "@/server/integrations/vista-cliente";
import { AiutoCredenziali } from "./aiuto-credenziali";
import { Monogramma, PillolaStato, giorno } from "./segni";
import { PulsanteAzione } from "./pulsante-azione";

/**
 * **La pagina di un'integrazione non ancora collegata.** Poche righe e un
 * pulsante: che cosa fa, «Collega», che cosa servirà. Il resto — perché è
 * un'anteprima, che cosa è stato provato — non è una domanda del cliente.
 *
 * Quattro varianti, decise dal server (`statoPerIlCliente`):
 * - collegabile → «Collega», che apre direttamente il wizard;
 * - anteprima senza accesso → «Richiedi attivazione»;
 * - Foodtech non ha ancora ciò che serve dalla sua parte → «in fase di
 *   attivazione», «Richiedi accesso»: il modulo non si mostra;
 * - senza adattatore → «prossimamente», «Avvisami».
 */
export function PresentazioneIntegrazione({ dettaglio, puoCollegare }: { dettaglio: DettaglioCliente; puoCollegare: boolean }) {
  const { voce } = dettaglio;
  const collegabile = dettaglio.azione === "COLLEGA";
  const prossimamente = dettaglio.stato === "PROSSIMAMENTE";

  const frase = prossimamente
    ? `L'integrazione con ${voce.nome} sarà disponibile prossimamente.`
    : dettaglio.inAttivazione
      ? "Questa integrazione è in fase di attivazione."
      : collegabile
        ? voce.descrizione
        : "Stiamo aprendo questa integrazione un ristorante alla volta. Chiedi l'attivazione: ti scriviamo appena è pronta per il tuo locale.";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section className="riquadro comodo space-y-6 bg-card/50 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Monogramma testo={voce.monogramma} grande />
          <div className="min-w-0">
            <h1 className="text-display text-2xl">{voce.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="t-nota">{voce.categoria}</span>
              <PillolaStato stato={dettaglio.stato} etichetta={dettaglio.etichettaStato} />
            </div>
          </div>
        </div>

        <p className="text-base">{frase}</p>

        {!prossimamente && voce.vantaggi.length > 0 && (
          <div>
            <p className="t-etichetta mb-2">Con questa integrazione puoi</p>
            <ul className="space-y-2">
              {voce.vantaggi.map((v) => (
                <li key={v} className="flex items-center gap-2.5 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3 border-t border-border/60 pt-5">
          {puoCollegare ? (
            <PulsanteAzione
              slug={voce.slug}
              nome={voce.nome}
              azione={dettaglio.azione}
              hrefNativa={voce.hrefNativa}
              puoRichiedere
              size="default"
              inAttivazione={dettaglio.inAttivazione}
            />
          ) : (
            <p className="t-nota">Il collegamento lo fa chi amministra il locale.</p>
          )}

          {dettaglio.richiestaIl && (
            <p className="t-nota">
              {prossimamente ? "Ti avviseremo appena è disponibile." : `Richiesta inviata il ${giorno(dettaglio.richiestaIl)}. Ti scriviamo appena è attiva.`}
            </p>
          )}

          {collegabile && voce.credenziali && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{voce.credenziali}</p>
              {voce.aiuto && <AiutoCredenziali aiuto={voce.aiuto} etichetta="Non le hai? Scopri dove trovarle" />}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
