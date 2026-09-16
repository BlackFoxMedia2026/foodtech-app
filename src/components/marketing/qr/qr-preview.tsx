"use client";

import { ExternalLink, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { disegnoInSvg } from "@/lib/qr-svg";
import type { DisegnoQr } from "@/lib/qr-disegno";
import type { Avvertenza } from "@/lib/qr-validazione";

/**
 * L'anteprima, e perché sta su una superficie chiara.
 *
 * Tutto il prodotto è scuro, e un QR appoggiato sul verde del prodotto si
 * giudica male: il fondo del codice si confonde con quello della pagina, e la
 * zona di quiete — che è la parte che decide se un telefono lo prende —
 * diventa invisibile. Qui sotto c'è quindi un piano crema, come il cartoncino
 * su cui quel codice finirà davvero.
 *
 * L'SVG si inserisce nel documento invece di passare per un `<img>`: un SVG
 * caricato **come immagine** non ha il permesso di andare a prendere niente
 * fuori da sé, e il logo del locale — che è un indirizzo — semplicemente non
 * comparirebbe. Il markup non arriva da fuori: lo scrive `qr-svg.ts`, che
 * protegge ogni testo che ci finisce dentro.
 */
export function QrPreview({
  disegno,
  avvisi,
  link,
  trasparente = false,
  compatta = false,
  className,
}: {
  disegno: DisegnoQr | null;
  avvisi?: Avvertenza[];
  /** L'indirizzo da aprire con «Testa QR». Nullo per Wi-Fi e testo libero. */
  link?: string | null;
  /**
   * Il disegno non porta il suo fondo: sotto va messa la scacchiera.
   *
   * È un'informazione che il `DisegnoQr` non può dare — un disegno senza
   * fondo e uno con un fondo bianco sono due elenchi di forme, e da qui si
   * distinguono solo contandole. Arriva quindi dal disegno **scelto**, che è
   * il posto in cui quella decisione è stata presa.
   */
  trasparente?: boolean;
  compatta?: boolean;
  className?: string;
}) {
  /*
    «Manca la destinazione» non è un avviso: è lo stato in cui l'editor si apre
    sempre, e mostrarlo in rosso vuol dire accogliere chi arriva con un errore
    per non aver ancora fatto niente. Resta come blocco al salvataggio, e
    intanto lo dice il riquadro vuoto — al presente, non come un guasto.
  */
  const gravi = (avvisi ?? []).filter((a) => a.grave && a.chiave !== "vuoto");
  const lievi = (avvisi ?? []).filter((a) => !a.grave);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "riquadro flex items-center justify-center",
          /* La scacchiera prende il posto della carta, non le si appoggia
             sopra: due fondi sovrapposti direbbero che ce n'è ancora uno. */
          trasparente ? "scacchiera" : "bg-sand-100",
          compatta ? "p-4" : "p-4 md:p-6",
        )}
      >
        {disegno ? (
          <div
            /* Sul telefono il codice si tiene più piccolo: a piena larghezza
               occupa lo schermo intero e le linguette del modulo restano sotto
               la piega, cioè si vede benissimo una cosa che non si può ancora
               cambiare. */
            className="w-full max-w-[15rem] animate-fade-in sm:max-w-[20rem] [&>svg]:h-auto [&>svg]:w-full"
            /* Vedi la nota in cima: il markup è generato qui accanto, non
               ricevuto, ed è l'unico modo perché il logo si veda. */
            dangerouslySetInnerHTML={{ __html: disegnoInSvg(disegno) }}
          />
        ) : (
          /* Il riquadro vuoto non tiene il posto del codice a grandezza
             naturale: su un telefono sarebbe mezzo schermo di niente prima di
             arrivare ai campi da riempire. */
          <div className="flex w-full max-w-[20rem] flex-col items-center justify-center gap-2 py-10 text-center">
            <QrCode className="h-10 w-10 text-clay-ink/30" aria-hidden="true" />
            <p className="text-sm text-clay-ink/60">
              {gravi.length > 0 ? gravi[0].messaggio : "Il codice compare appena scegli la destinazione."}
            </p>
          </div>
        )}
      </div>

      {!compatta && (
        <div className="space-y-2 text-center">
          <p className="t-etichetta">Anteprima QR</p>
          <p className="t-nota">Inquadralo col telefono per provarlo davvero.</p>
          {link && (
            <Button variant="outline" size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Testa QR
              </a>
            </Button>
          )}
        </div>
      )}

      {(gravi.length > 0 || lievi.length > 0) && (
        <div className="space-y-2">
          {[...gravi, ...lievi].map((a) => (
            <p
              key={a.chiave}
              className={cn(
                "flex items-start gap-2 text-xs leading-relaxed",
                a.grave ? "font-medium text-destructive-soft" : "text-accent-strong",
              )}
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{a.messaggio}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
