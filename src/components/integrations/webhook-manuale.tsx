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
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-muted-foreground">
        Per vedere subito ordini, scontrini e modifiche al menu, senza aspettare la sincronizzazione: nel pannello di{" "}
        {fornitore} aggiungi un webhook con questo indirizzo, poi incolla qui il codice di sicurezza che {fornitore} ti
        mostra.
      </p>
      <div className="flex min-w-0 items-center gap-2">
        <code className="block min-w-0 flex-1 truncate rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs">
          {indirizzo}
        </code>
        <CopyButton value={indirizzo} variant="outline" size="sm">
          Copia
        </CopyButton>
      </div>
      <p className="flex items-center gap-2 text-sm">
        {segretoPresente ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-sage-strong" aria-hidden="true" /> Aggiornamenti istantanei attivi.
          </>
        ) : (
          <span className="text-muted-foreground">Non ancora attivi: Foodtech legge i dati con la sincronizzazione.</span>
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
              setEsito({ ok: true, testo: "Codice salvato." });
              router.refresh();
            } catch (err) {
              setEsito({ ok: false, testo: err instanceof ErroreAzione ? err.message : "Non salvato." });
            } finally {
              setInCorso(false);
            }
          }}
        >
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor={`segreto-${slug}`}>Codice di sicurezza</Label>
            <Input
              id={`segreto-${slug}`}
              type="password"
              autoComplete="off"
              value={segreto}
              onChange={(e) => setSegreto(e.target.value)}
              placeholder={segretoPresente ? "Salvato · scrivilo di nuovo per sostituirlo" : ""}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={inCorso || !segreto.trim()}>
            {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salva codice
          </Button>
        </form>
      )}
      {esito && <p className={esito.ok ? "text-sm text-sage-strong" : "text-sm text-destructive-soft"}>{esito.testo}</p>}
    </div>
  );
}
