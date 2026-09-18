import { Badge } from "@/components/ui/badge";
import { ServiziLocale } from "@/components/admin/servizi-locale";
import { NOME_FUNZIONE_CENTRALINO, type FunzioneCentralino } from "@/lib/licenza-centralino";
import { daQuando } from "@/lib/utils";
import { localiConServizi } from "@/server/admin/servizi";

export const dynamic = "force-dynamic";

/**
 * I locali e i loro servizi.
 *
 * ## Perché questa pagina esiste
 *
 * Perché il centralino si accendeva **da un altro gestionale**: si emetteva
 * una chiave firmata su ilmiocentralino, si copiava, si apriva Tavolo e la si
 * incollava. Sei gesti in due applicazioni, con due chiavi che viaggiano in
 * versi opposti — e per un cliente della nostra installazione era un giro
 * inutile: il database è nostro.
 *
 * Adesso il telefono è **un servizio di Tavolo**, che un nostro super
 * amministratore accende a chi lo compra. Il secondo gestionale resta dov'è
 * per quello che sa fare lui — le linee, i trunk, l'audio — ma non è più un
 * posto dove passare per far funzionare un cliente.
 *
 * ## La firma non è stata buttata
 *
 * Resta la strada delle installazioni che non gestiamo noi, dove un
 * interruttore nel database sarebbe un interruttore che il cliente si gira da
 * solo. Qui si dice quando c'è anche una chiave, invece di nasconderlo: due
 * verità sullo stesso telefono si scoprono male.
 */
export default async function AdminLocaliPage() {
  const locali = await localiConServizi();
  const accesi = locali.filter((l) => l.centralino.attivo).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="t-titolo-pagina">Locali e servizi</h1>
        <p className="t-nota mt-1">
          {locali.length} locali, {accesi} col centralino acceso da qui.
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
                {l.centralino.attivo ? (
                  <Badge tone="success">Centralino acceso</Badge>
                ) : l.centralino.haChiave ? (
                  /* Una chiave c'è, e non la verifichiamo riga per riga: dirla
                     «attiva» qui sarebbe dichiarare un fatto invece di
                     leggerlo, e una chiave scaduta passerebbe per accesa. */
                  <Badge tone="warning">Ha una chiave</Badge>
                ) : (
                  <Badge tone="neutral">Spento</Badge>
                )}
                {l.linee > 0 && (
                  <span className="t-nota">
                    {l.linee} {l.linee === 1 ? "linea" : "linee"}
                  </span>
                )}
                <span className="t-nota">
                  {l.ultimaChiamata
                    ? `ultima chiamata ${daQuando(l.ultimaChiamata)}`
                    : "mai una chiamata"}
                </span>
              </div>
            </div>

            <div className="mt-3 border-t border-border/60 pt-3">
              <ServiziLocale
                venueId={l.venueId}
                attivo={l.centralino.attivo}
                funzioni={l.centralino.funzioni}
                nota={l.centralino.nota}
              />
              {l.centralino.attivo && (
                <p className="t-nota mt-2">
                  {l.centralino.funzioni.length === 0
                    ? "Tutte le funzioni"
                    : l.centralino.funzioni
                        .map((f) => NOME_FUNZIONE_CENTRALINO[f as FunzioneCentralino] ?? f)
                        .join(" · ")}
                  {l.centralino.attivatoDa && ` · acceso da ${l.centralino.attivatoDa}`}
                  {l.centralino.attivatoIl && ` ${daQuando(l.centralino.attivatoIl)}`}
                  {l.centralino.haChiave && " · ha anche una chiave firmata"}
                </p>
              )}
              {l.centralino.nota && <p className="t-nota mt-1">«{l.centralino.nota}»</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
