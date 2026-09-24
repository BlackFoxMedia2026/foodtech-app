"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAvvisi } from "@/components/ui/avvisi";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DettaglioCliente } from "@/server/integrations/vista-cliente";
import { azione, ErroreAzione } from "./azioni";
import { dataOra } from "./segni";

/**
 * **«Serve una mano?»** — il ristoratore chiede a Foodtech di aiutarlo con
 * un'integrazione (`server/integrations/assistenza.ts`).
 *
 * Due scelte, scritte così come sono:
 * - chiedere aiuto e basta: Foodtech guarda e verifica la connessione, e lo
 *   contatta;
 * - autorizzare Foodtech a configurare **questa** integrazione per sette
 *   giorni: sede, cosa sincronizzare, attivazione. Le credenziali restano sue:
 *   se servono, Foodtech gli manda un collegamento per inserirle da qui.
 *
 * La delega si revoca con un clic. Non si chiede mai di mandare una chiave
 * per email.
 */
export function AssistenzaCliente({ dettaglio, puo }: { dettaglio: DettaglioCliente; puo: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [aperta, setAperta] = useState(false);
  const [nota, setNota] = useState(dettaglio.assistenza?.nota ?? "");
  const [delega, setDelega] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const a = dettaglio.assistenza;
  const nome = dettaglio.voce.nome;
  if (!dettaglio.assistenzaPossibile) return null;

  async function invia() {
    setInCorso(true);
    try {
      await azione(dettaglio.voce.slug, { azione: "assistenza", nota: nota.trim() || null, delega });
      avvisi.mostra(delega ? `Richiesta inviata. Foodtech può configurare ${nome} per 7 giorni.` : "Richiesta inviata a Foodtech.");
      setAperta(false);
      router.refresh();
    } catch (e) {
      avvisi.problema(e instanceof ErroreAzione ? e.message : "Non siamo riusciti a inviare la richiesta. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  async function revoca() {
    setInCorso(true);
    try {
      await azione(dettaglio.voce.slug, { azione: "revoca_delega" });
      avvisi.mostra("Autorizzazione revocata: Foodtech non può più configurare questa integrazione.");
      router.refresh();
    } catch (e) {
      avvisi.problema(e instanceof ErroreAzione ? e.message : "Non siamo riusciti a revocare. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <section className="riquadro comodo space-y-3 bg-card/40">
      <div className="flex items-start gap-3">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="t-titolo-scheda">Serve una mano?</h2>
          {a?.delegaFinoAl ? (
            <p className="text-sm text-muted-foreground">
              Hai autorizzato Foodtech a configurare {nome} per questo locale fino al {dataOra(a.delegaFinoAl)}. Le tue
              credenziali restano tue: Foodtech non le vede.
            </p>
          ) : a?.aperta ? (
            <p className="text-sm text-muted-foreground">
              Richiesta inviata{a.richiestaIl ? ` il ${dataOra(a.richiestaIl)}` : ""}. Ti contattiamo noi. Se servono i dati di
              accesso, ti mandiamo un collegamento per inserirli qui: non mandarli per email.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              L&apos;assistenza Foodtech può controllare la connessione e, se vuoi, configurare {nome} al posto tuo.
            </p>
          )}
        </div>
      </div>

      {puo && (
        <div className="flex flex-wrap gap-2 pl-8">
          {a?.delegaFinoAl ? (
            <Button size="sm" variant="ghost" disabled={inCorso} onClick={revoca}>
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Revoca l&apos;autorizzazione
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAperta(true)}>
              {a?.aperta ? "Aggiorna la richiesta" : "Chiedi aiuto a Foodtech"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chiedi aiuto per {nome}</DialogTitle>
            <DialogDescription>Ti contatta l&apos;assistenza Foodtech. Non scrivere qui password o chiavi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="nota-assistenza" className="t-etichetta">
                Che cosa ti serve? (facoltativo)
              </label>
              <Textarea
                id="nota-assistenza"
                value={nota}
                maxLength={1000}
                rows={3}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Per esempio: non trovo la chiave, la cassa la gestisce il rivenditore…"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={delega} onChange={(e) => setDelega(e.target.checked)} />
              <span className="min-w-0 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="h-4 w-4 text-sage-strong" aria-hidden="true" />
                  Autorizzo Foodtech a configurare {nome} per 7 giorni
                </span>
                <span className="t-nota mt-1 block">
                  Sede, che cosa sincronizzare e attivazione. Foodtech non vede le tue credenziali e non può disconnettere:
                  puoi revocare quando vuoi.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAperta(false)}>
              Annulla
            </Button>
            <Button variant="accent" disabled={inCorso} onClick={invia}>
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Invia richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
