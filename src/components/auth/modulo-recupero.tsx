"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Esito =
  | { tipo: "presa_in_carico"; email: string }
  | { tipo: "avviso"; testo: string };

/**
 * Il modulo di «password dimenticata».
 *
 * La schermata di conferma **sostituisce** il modulo invece di comparirgli
 * sotto: chi ha appena scritto il proprio indirizzo e legge «controlla la
 * posta» non deve avere davanti un campo ancora pieno e un pulsante ancora
 * premibile, o lo premerà di nuovo — e il secondo link invalida il primo,
 * cioè proprio quello che nel frattempo gli è arrivato.
 */
export function ModuloRecupero() {
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setErrore(null);
    setInvio(true);
    try {
      const res = await fetch("/api/public/recupero-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const dati = (await res.json().catch(() => null)) as
        | { stato?: string; message?: string }
        | null;

      if (res.status === 429) {
        setErrore("Troppe richieste di seguito. Riprova fra qualche minuto.");
        return;
      }
      if (!res.ok) {
        setErrore(dati?.message ?? "Controlla l'indirizzo e riprova.");
        return;
      }

      if (dati?.stato === "posta_non_configurata") {
        setEsito({
          tipo: "avviso",
          testo:
            "Su questa installazione di Tavolo l'invio delle email non è attivo, quindi da qui non possiamo mandarti niente. Chiedi a un manager del locale un link di reimpostazione: lo trova nella tua scheda in Organico.",
        });
        return;
      }
      if (dati?.stato === "invio_non_riuscito") {
        setEsito({
          tipo: "avviso",
          testo:
            "Abbiamo aperto la reimpostazione ma l'email non è partita. Riprova fra qualche minuto; se non arriva, chiedi il link a un manager del locale.",
        });
        return;
      }

      setEsito({ tipo: "presa_in_carico", email });
    } catch {
      setErrore("Connessione non riuscita. Riprova.");
    } finally {
      setInvio(false);
    }
  }

  if (esito?.tipo === "presa_in_carico") {
    return (
      <div className="surface p-6">
        <h1 className="text-display text-2xl">Controlla la posta</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Se <span className="text-foreground">{esito.email}</span> ha un accesso a Tavolo, fra poco
          arriva un&apos;email con il link per scegliere una password nuova. Vale 48 ore e una volta
          sola.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Non la trovi? Guarda nella posta indesiderata prima di richiederla: ogni richiesta nuova
          annulla il link di prima.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/sign-in" className="underline">
            Torna all&apos;accesso
          </Link>
        </p>
      </div>
    );
  }

  if (esito?.tipo === "avviso") {
    return (
      <div className="surface p-6">
        <h1 className="text-display text-2xl">Da qui non si può</h1>
        <p className="mt-3 text-sm text-muted-foreground">{esito.testo}</p>
        <p className="mt-4 text-sm">
          <Link href="/sign-in" className="underline">
            Torna all&apos;accesso
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="surface space-y-5 p-6">
      <div className="space-y-1.5">
        <h1 className="text-display text-2xl leading-tight">Password dimenticata</h1>
        <p className="text-sm text-muted-foreground">
          Scrivi l&apos;indirizzo con cui entri in Tavolo: ti mandiamo un link per scegliere una
          password nuova.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nome@locale.it" />
      </div>

      <div aria-live="polite" className="sr-only">
        {invio ? "Invio in corso…" : ""}
      </div>
      {errore && (
        <p role="alert" className="text-sm text-destructive">
          {errore}
        </p>
      )}

      <Button type="submit" variant="brand" disabled={invio} className="h-11 w-full">
        {invio ? "Invio in corso…" : "Mandami il link"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-muted-foreground underline">
          Ricordi la password? Entra
        </Link>
      </p>
    </form>
  );
}
