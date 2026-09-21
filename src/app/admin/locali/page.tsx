import { Badge } from "@/components/ui/badge";
import { NOME_FUNZIONE_CENTRALINO, type FunzioneCentralino } from "@/lib/licenza-centralino";
import { daQuando } from "@/lib/utils";
import { localiConServizi } from "@/server/admin/servizi";

export const dynamic = "force-dynamic";

/**
 * I locali e il loro telefono: **si guarda, non si tocca**.
 *
 * ## Perché qui non ci sono pulsanti
 *
 * Perché in questo prodotto Tavolo non si configura. Il telefono si accende
 * con una **chiave firmata** che solo ilmiocentralino può fabbricare, e la
 * linea — trunk, numeri, deviazioni — vive dove arrivano le telefonate.
 * Accendere un cliente da due posti diversi vuol dire due verità su un
 * telefono, e due posti in cui cercare quando la risposta è «non funziona».
 *
 * Per un giorno i pulsanti c'erano, ed erano stati costruiti bene: sono stati
 * togliuti insieme alle credenziali di servizio che li facevano funzionare —
 * un segreto in meno da custodire.
 *
 * ## Cosa resta, e perché serve
 *
 * Quello che questa pagina risponde è una domanda sola: **chi ha il telefono
 * acceso, da quando, e su quali linee.** È l'unico posto da cui si vede
 * insieme a tutti i clienti, e serve prima di rispondere a «al Nomad
 * funziona?». Guardare non è configurare.
 */
export default async function AdminLocaliPage() {
  const locali = await localiConServizi();
  const conChiave = locali.filter((l) => l.centralino.haChiave).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Locali e telefono</h1>
        <p className="t-nota mt-1">
          {locali.length} locali, {conChiave} con una chiave del centralino. Si accende e si
          configura da ilmiocentralino: qui si guarda.
        </p>
      </header>

      <div className="space-y-3">
        {locali.map((l) => (
          <section key={l.venueId} className="surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{l.nome}</span>
                  <span className="t-nota">{l.organizzazione}</span>
                </p>
                <p className="t-nota mt-0.5 font-mono">{l.venueId}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* «Ha una chiave», non «attivo»: la firma non si riverifica
                    riga per riga su una schermata che elenca tutti i locali, e
                    dichiararlo acceso farebbe passare una chiave scaduta per un
                    telefono che funziona. Lo stato vero lo dice la scheda del
                    locale, dove la chiave viene verificata. */}
                {l.centralino.haChiave ? (
                  <Badge tone="success">Ha una chiave</Badge>
                ) : (
                  <Badge tone="neutral">Telefono spento</Badge>
                )}
                <span className="t-nota">
                  {l.ultimaChiamata
                    ? `ultima chiamata ${daQuando(l.ultimaChiamata)}`
                    : "mai una chiamata"}
                </span>
              </div>
            </div>

            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="t-etichetta mb-1.5">Le linee</p>
              {l.linee.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {l.linee.map((linea) => (
                    <li
                      key={linea.numero}
                      className="rounded-full border border-border px-2.5 py-1 font-mono text-xs"
                    >
                      {linea.numero}
                      {linea.etichetta && (
                        <span className="ml-1.5 font-sans text-muted-foreground">
                          {linea.etichetta}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-nota">
                  Nessuna linea dichiarata dal centralino. Finché non gliene assegni una là, nella
                  procedura di collegamento non compare nessun numero da dettare all&apos;operatore.
                </p>
              )}

              {l.centralino.funzioni.length > 0 && (
                <p className="t-nota mt-2">
                  {l.centralino.funzioni
                    .map((f) => NOME_FUNZIONE_CENTRALINO[f as FunzioneCentralino] ?? f)
                    .join(" · ")}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
