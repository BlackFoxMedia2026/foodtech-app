"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readApiError } from "@/lib/api-client";

/**
 * «Esci da tutti i dispositivi.»
 *
 * Un accesso in un ristorante si lascia aperto: il tablet del leggio, il
 * telefono di un collega, il computer dell'ufficio. Nessuno si ricorda dove, e
 * fino a oggi non c'era niente da fare — un token firmato non si cancella.
 *
 * Adesso si può dire «tutto quello che è aperto adesso, chiudilo». Non è un
 * blocco: si rientra con la propria password, qui e altrove. È la stessa cosa
 * che un manager può fare per una persona del team, applicata a sé — e per sé
 * non serve essere manager.
 */
export function MieiDispositivi() {
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function esci() {
    setErrore(null);
    setInCorso(true);
    try {
      const res = await fetch("/api/account/sessioni", { method: "DELETE" });
      if (!res.ok) {
        setErrore(await readApiError(res, "Non siamo riusciti a chiudere le sessioni."));
        return;
      }
      /*
        Ricaricare, non navigare: questa sessione è appena stata chiusa insieme
        alle altre, quindi la prossima richiesta al server non è più
        autenticata e il redirect verso l'accesso lo fa il server. Mandare
        altrove da qui sarebbe indovinare dove.
      */
      window.location.reload();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>I tuoi dispositivi</CardTitle>
        <CardDescription>
          Se hai lasciato l&apos;accesso aperto da qualche parte e non sai dove
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Chiude tutte le sessioni aperte col tuo account, su ogni dispositivo — compreso questo. Non
          perdi niente: rientri con la tua password. Gli accessi scadono comunque da soli dopo sette
          giorni di inattività.
        </p>
        <Button variant="outline" size="sm" onClick={esci} disabled={inCorso}>
          <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          {inCorso ? "Chiudo…" : "Esci da tutti i dispositivi"}
        </Button>
        {errore && <p className="text-sm text-destructive">{errore}</p>}
      </CardContent>
    </Card>
  );
}
