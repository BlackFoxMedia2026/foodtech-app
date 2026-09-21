"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";
import { GruppoImpostazioni, RigaLibera } from "@/components/settings/righe-impostazioni";

/**
 * Gli SMS di questo locale: accesi o spenti.
 *
 * ## Perché è un interruttore e non una cosa che funziona da sola
 *
 * Perché un SMS **si paga** e arriva sul telefono di un cliente vero. Il
 * canale si configura per installazione — una chiave, un mittente — ma la
 * decisione di spendere è del ristorante.
 *
 * Il 21 settembre 2026, accendendo il canale in produzione, il controllo prima
 * di partire ha trovato una prenotazione di quella sera di un locale
 * **vetrina**: dati inventati, ospite con solo il numero. Il promemoria
 * sarebbe partito verso un numero finto — che però può essere il numero di
 * qualcuno. Da lì questo interruttore, spento per difetto.
 *
 * ## Perché dice cosa manda, prima di accendersi
 *
 * Perché «attiva SMS» non è un'informazione: chi legge deve sapere **quali**
 * messaggi partiranno e a chi, o l'interruttore è una scommessa. E se il
 * canale non è configurato su questa installazione lo dice, invece di
 * mostrare un interruttore che non può funzionare — un pulsante che non può
 * riuscire è peggio di un pulsante che non c'è.
 */
export function SmsPromemoria({
  attivi,
  canaleDisponibile,
  canManage,
}: {
  attivi: boolean;
  /** Se su questa installazione esiste un fornitore di SMS. */
  canaleDisponibile: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [acceso, setAcceso] = useState(attivi);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambia(valore: boolean) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch("/api/venue/sms", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attivi: valore }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non siamo riusciti a salvare."));
      const dati = (await res.json()) as { attivi: boolean };
      setAcceso(dati.attivi);
      router.refresh();
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <GruppoImpostazioni
      titolo="Messaggi via SMS"
      descrizione="Per chi ha lasciato solo il numero di telefono: la mail, quando c'è, resta la prima scelta."
    >
      <RigaLibera>
        <div className="riquadro flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Manda SMS ai clienti di questo locale</p>
            <p className="text-xs text-muted-foreground">
              Da acceso partono tre messaggi: il <strong>promemoria</strong> a chi ha lasciato solo
              il numero (con il link per annullare in un tocco), la <strong>conferma</strong> a chi
              ha prenotato parlando col risponditore, e il <strong>link per riprendere</strong> una
              telefonata interrotta a metà. Il mittente è il nome del locale.
            </p>
            <p className="text-xs text-muted-foreground">
              Ogni SMS si paga. Chi ha lasciato l&apos;email riceve quella e non l&apos;SMS: due
              promemoria per la stessa cena sono un fastidio, e il secondo costa.
            </p>
            {!canaleDisponibile && (
              <p className="text-xs text-muted-foreground">
                Su questa installazione il canale SMS non è ancora configurato: da acceso, i
                messaggi restano nel registro con scritto che non sono partiti.
              </p>
            )}
          </div>
          <Switch
            checked={acceso}
            disabled={!canManage || inCorso}
            onCheckedChange={(v) => void cambia(v)}
            aria-label="Manda SMS ai clienti di questo locale"
          />
        </div>
        {errore && <p className="mt-2 text-sm text-destructive">{errore}</p>}
      </RigaLibera>
    </GruppoImpostazioni>
  );
}
