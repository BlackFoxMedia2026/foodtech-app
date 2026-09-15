import { clientiDem, margineDelMese } from "@/server/dem/piattaforma";
import { inviiVersoChiunque, sesAttivo } from "@/server/dem/ses";
import { AzioniCliente } from "@/components/dem/azioni-cliente";
import { Badge } from "@/components/ui/badge";
import { ETICHETTA_REPUTAZIONE } from "@/lib/dem-reputazione";
import { invii } from "@/lib/dem-piani";

export const dynamic = "force-dynamic";

const DATA = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const USD = new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD" });
const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/**
 * I clienti DEM, tutti su una schermata.
 *
 * Su schermo largo è una tabella, perché il confronto fra righe è tutto il
 * punto: si scorre la colonna «utilizzo» e si vede subito chi sta finendo.
 * Sotto il breakpoint la tabella diventa un elenco di schede — una tabella a
 * dieci colonne su un telefono è una riga che scorre di lato, cioè un dato che
 * nessuno legge.
 */
export default async function AdminDemPage() {
  const [clienti, margine, versoChiunque] = await Promise.all([
    clientiDem(),
    margineDelMese(),
    inviiVersoChiunque(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Clienti DEM</h1>
        <p className="t-nota mt-1">{clienti.length} con il modulo attivo.</p>
      </header>

      {/*
        Lo stato dell'account di invio, e sta qui e non nelle schermate del
        cliente per una ragione sola: è un fatto di infrastruttura, e il
        cliente non deve sapere che esiste un'infrastruttura.

        Ma **noi** dobbiamo saperlo, e prima di accendere il modulo a qualcuno:
        un account ancora in prova accetta solo destinatari verificati a mano,
        quindi una campagna partirebbe, scalerebbe il credito del cliente e
        verrebbe rifiutata destinatario per destinatario. Il dato si chiede
        ogni volta invece di ricordarlo: l'attivazione arriva quando arriva, e
        una riga salvata sarebbe vecchia proprio il giorno che conta.
      */}
      {!sesAttivo() ? (
        <section className="surface p-4">
          <p className="t-titolo-scheda">Invio con dominio proprio non attivo</p>
          <p className="t-nota mt-1">
            Manca <code className="font-mono">DEM_SES_ENABLED</code> o la regione. Le campagne
            passano ancora dal fornitore esterno.
          </p>
        </section>
      ) : versoChiunque === false ? (
        <section className="surface border-accent/40 p-4">
          <p className="t-titolo-scheda">Account in modalità di prova</p>
          <p className="t-nota mt-1">
            Si può scrivere solo a indirizzi verificati a mano. Una campagna vera partirebbe,
            scalerebbe il credito e verrebbe rifiutata: chiedere l&apos;attivazione completa prima
            di accendere il modulo a un cliente.
          </p>
        </section>
      ) : versoChiunque === null ? (
        <section className="surface p-4">
          <p className="t-titolo-scheda">Stato dell&apos;account non leggibile</p>
          <p className="t-nota mt-1">
            Non siamo riusciti a chiedere se l&apos;account può scrivere a chiunque. Di solito sono
            i permessi della chiave: serve <code className="font-mono">ses:GetAccount</code>.
          </p>
        </section>
      ) : null}

      {/*
        Il riquadro dei costi sta qui e **solo** qui: al cliente non compare da
        nessuna parte, e il prezzo che paga non dipende da questo numero. Le
        due valute restano separate: convertirle richiederebbe un tasso di
        cambio, e uno inventato produrrebbe un margine che sembra un dato.
      */}
      <section className="surface grid gap-4 p-5 sm:grid-cols-3">
        <Dato etichetta="Email inviate questo mese" valore={invii(margine.inviate)} />
        <Dato etichetta="Costo infrastruttura stimato" valore={USD.format(margine.costoStimatoUsd)} />
        <Dato etichetta="Ricavo piani attivi" valore={`${EUR.format(margine.ricavoCents / 100)}/mese`} />
      </section>

      {clienti.length === 0 ? (
        <p className="surface p-8 text-center text-sm text-muted-foreground">
          Nessun locale ha ancora attivato il modulo DEM.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Cliente</Th>
                  <Th>Piano</Th>
                  <Th>Utilizzo</Th>
                  <Th>Dominio</Th>
                  <Th>Stato</Th>
                  <Th>Reputazione</Th>
                  <Th>Ultimo invio</Th>
                  <Th>Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {clienti.map((c) => (
                  <tr key={c.venueId} className="border-b border-border/50">
                    <Td>{c.locale}</Td>
                    <Td>{c.piano}</Td>
                    <Td>
                      <span className="tabular-nums">
                        {invii(c.usati)} / {invii(c.limite)}
                      </span>
                      <span className="t-nota block">{c.percentuale}%</span>
                    </Td>
                    <Td>{c.dominio ?? <span className="text-muted-foreground">—</span>}</Td>
                    <Td>
                      <Badge tone={c.statoInvio === "Attivo" ? "success-soft" : c.statoInvio === "Sospeso" ? "danger" : "neutral"}>
                        {c.statoInvio}
                      </Badge>
                    </Td>
                    <Td>
                      <span>{ETICHETTA_REPUTAZIONE[c.reputazione]}</span>
                      {c.tassoRimbalzi !== null && (
                        <span className="t-nota block tabular-nums">
                          {c.tassoRimbalzi}% · {c.tassoSegnalazioni}%
                        </span>
                      )}
                    </Td>
                    <Td>{c.ultimoInvio ? DATA.format(c.ultimoInvio) : "—"}</Td>
                    <Td>
                      <AzioniCliente venueId={c.venueId} sospeso={c.statoInvio === "Sospeso"} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {clienti.map((c) => (
              <li key={c.venueId} className="surface space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="t-titolo-scheda">{c.locale}</p>
                  <Badge tone={c.statoInvio === "Attivo" ? "success-soft" : c.statoInvio === "Sospeso" ? "danger" : "neutral"}>
                    {c.statoInvio}
                  </Badge>
                </div>
                <p className="text-sm tabular-nums">
                  {c.piano} — {invii(c.usati)} / {invii(c.limite)} ({c.percentuale}%)
                </p>
                <p className="t-nota">{c.dominio ?? "Dominio non configurato"}</p>
                <p className="t-nota">
                  Reputazione {ETICHETTA_REPUTAZIONE[c.reputazione]}
                  {c.ultimoInvio ? ` · ultimo invio ${DATA.format(c.ultimoInvio)}` : ""}
                </p>
                <AzioniCliente venueId={c.venueId} sospeso={c.statoInvio === "Sospeso"} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-3 align-top">{children}</td>;
}

function Dato({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className="text-display mt-0.5 text-xl tabular-nums">{valore}</p>
    </div>
  );
}
