"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { azione, ErroreAzione } from "./azioni";

/**
 * **I webhook che il ristoratore configura dal pannello del fornitore.**
 *
 * Alcuni fornitori (Cassa in Cloud) non lasciano registrare i webhook via
 * API: si creano nel loro pannello, con l'indirizzo che diamo noi, e il
 * fornitore genera un segreto con cui firma ogni chiamata. Qui si mostrano
 * l'indirizzo da copiare e il campo in cui riportare il segreto.
 *
 * Il segreto, come ogni segreto, non torna indietro: si vede solo *se* c'è.
 * Senza segreto Foodtech rifiuta ogni chiamata (401): meglio nessun evento
 * che eventi di chiunque.
 */
export function WebhookManuale({
  slug,
  fornitore,
  indirizzo,
  segretoPresente,
  puo,
}: {
  slug: string;
  fornitore: string;
  indirizzo: string;
  segretoPresente: boolean;
  puo: boolean;
}) {
  const router = useRouter();
  const [segreto, setSegreto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Per ricevere da {fornitore} gli aggiornamenti di ordini, scontrini e catalogo senza aspettare la
        sincronizzazione, crea un webhook nelle impostazioni del pannello di {fornitore} con questo indirizzo, poi
        incolla qui il segreto che {fornitore} mostra nel dettaglio del webhook.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 max-w-full truncate rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs">
          {indirizzo}
        </code>
        <CopyButton value={indirizzo} variant="outline" size="sm">
          Copia
        </CopyButton>
      </div>
      <p className="flex items-center gap-2 text-sm">
        {segretoPresente ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> Segreto del webhook salvato, cifrato.
          </>
        ) : (
          <span className="text-accent-strong">Nessun segreto salvato: gli eventi di {fornitore} vengono rifiutati.</span>
        )}
      </p>
      {puo && (
        <form
          className="flex max-w-lg flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setInCorso(true);
            setEsito(null);
            try {
              await azione(slug, { azione: "segreto_webhook", segreto });
              setSegreto("");
              setEsito({ ok: true, testo: "Segreto salvato." });
              router.refresh();
            } catch (err) {
              setEsito({ ok: false, testo: err instanceof ErroreAzione ? err.message : "Non salvato." });
            } finally {
              setInCorso(false);
            }
          }}
        >
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor={`segreto-${slug}`}>Segreto del webhook</Label>
            <Input
              id={`segreto-${slug}`}
              type="password"
              autoComplete="off"
              value={segreto}
              onChange={(e) => setSegreto(e.target.value)}
              placeholder={segretoPresente ? "Salvato · scrivi per sostituirlo" : ""}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={inCorso || !segreto.trim()}>
            {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salva segreto
          </Button>
        </form>
      )}
      {esito && <p className={esito.ok ? "text-sm text-sage-strong" : "text-sm text-destructive-soft"}>{esito.testo}</p>}
    </div>
  );
}
