import { Badge } from "@/components/ui/badge";
import { NOME_PASSO, passoValido } from "@/lib/voice-recupero";
import { telefonoLeggibile } from "@/lib/telefono";

export type InterrottaRiga = {
  id: string;
  numero: string;
  nome: string | null;
  persone: number | null;
  /** ISO: un componente client non riceve `Date`, e questo passa da un server. */
  quando: string | null;
  passo: string | null;
  invio: "DA_MANDARE" | "MANDATO" | "SENZA_CANALE" | "NON_RIUSCITO";
  daRichiamare: boolean;
};

/**
 * Le telefonate finite a metà, e cosa ne è stato.
 *
 * ## Perché sta fra le cose da fare
 *
 * Perché una di queste persone voleva un tavolo e **non sa se l'ha avuto**. Se
 * il link è partito sta decidendo; se non è partito sta aspettando senza
 * saperlo, e allora è una telefonata da fare — non una riga di storico.
 *
 * Per questo quelle a cui non è partito niente stanno **prima**, e lo dicono
 * con le parole: «nessun canale per mandarlo» non è un errore tecnico da
 * nascondere, è la ragione per cui quel cliente non ha ricevuto un messaggio.
 * Nasconderla vorrebbe dire un ristoratore che crede di aver recuperato una
 * prenotazione che nessuno ha mai contattato.
 */
export function Interrotte({ righe, fuso }: { righe: InterrottaRiga[]; fuso: string }) {
  if (righe.length === 0) return null;

  const quando = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });

  return (
    <section aria-label="Telefonate interrotte" className="space-y-2">
      <p className="t-etichetta">Interrotte a metà</p>

      <ul className="space-y-2">
        {righe.map((r) => {
          const passo = passoValido(r.passo);
          return (
            <li key={r.id} className="riquadro p-3">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium">
                  {r.nome ?? telefonoLeggibile(r.numero) ?? r.numero}
                </span>
                {r.nome && (
                  <span className="t-nota font-mono">
                    {telefonoLeggibile(r.numero) ?? r.numero}
                  </span>
                )}
                {r.daRichiamare ? (
                  <Badge tone="warning">Da richiamare</Badge>
                ) : (
                  <Badge tone="neutral">Link mandato</Badge>
                )}
              </p>

              {/* Cosa voleva: è quello che serve a chi la richiama, e sta sulla
                  riga perché aprire un dettaglio per tre dati è un clic in più
                  in un momento in cui non ce n'è tempo. */}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  r.quando ? quando.format(new Date(r.quando)) : null,
                  r.persone ? `${r.persone} ${r.persone === 1 ? "persona" : "persone"}` : null,
                  passo ? `si è interrotta: ${NOME_PASSO[passo].toLowerCase()}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "non ha detto ancora niente"}
              </p>

              {r.invio === "SENZA_CANALE" && (
                <p className="t-nota mt-1">
                  Il link non è partito: su questa installazione non c&apos;è un canale per mandare
                  messaggi. Richiamala tu.
                </p>
              )}
              {r.invio === "NON_RIUSCITO" && (
                <p className="t-nota mt-1">
                  L&apos;invio del link non è riuscito. Richiamala tu.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
