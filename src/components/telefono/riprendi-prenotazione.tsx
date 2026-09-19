"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";

/**
 * «Riprendiamo da dove eravamo.»
 *
 * ## Perché non è il modulo di prenotazione normale
 *
 * Perché questa persona **ha già detto tutto a voce**, e il modulo pubblico
 * ricomincerebbe da zero chiedendole anche un'email che non ci ha dato. Qui i
 * campi arrivano pieni con quello che il risponditore aveva capito, e l'unica
 * cosa che manca davvero è il nome.
 *
 * Il concorrente, di queste telefonate, consegna al ristoratore **un elenco da
 * scaricare**. Questa schermata è la differenza.
 *
 * ## I campi restano modificabili
 *
 * Il risponditore può aver capito male — un orario letto da una sequenza di
 * tasti, un «per sei» detto in mezzo al rumore — e obbligare a tenere un dato
 * sbagliato vorrebbe dire una prenotazione falsa, che è peggio di nessuna
 * prenotazione. Quindi si mostrano già scritti, e si possono correggere.
 */
export function RiprendiPrenotazione({
  token,
  nomeLocale,
  nome,
  persone,
  quando,
}: {
  token: string;
  nomeLocale: string;
  nome: string | null;
  persone: number | null;
  /** Data e ora che il risponditore aveva capito, in ISO. */
  quando: string | null;
}) {
  const iniziale = quando ? new Date(quando) : null;
  const [giorno, setGiorno] = useState(iniziale ? isoGiorno(iniziale) : "");
  const [ora, setOra] = useState(iniziale ? isoOra(iniziale) : "");
  const [quanti, setQuanti] = useState(String(persone ?? 2));
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatta, setFatta] = useState<{ quando: string; persone: number } | null>(null);

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrore(null);
    setInCorso(true);

    const res = await fetch("/api/public/riprendi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        nome: String(fd.get("nome") ?? "").trim(),
        cognome: String(fd.get("cognome") ?? "").trim() || undefined,
        /* L'istante si compone qui dai due campi, nel fuso di chi guarda: è la
           stessa cosa che fa il modulo pubblico. */
        startsAt: new Date(`${giorno}T${ora}`).toISOString(),
        persone: Number(quanti),
        note: String(fd.get("note") ?? "").trim() || undefined,
      }),
    });
    setInCorso(false);

    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a completare la prenotazione."));
      return;
    }
    const dati = (await res.json()) as { quando: string; persone: number };
    setFatta({ quando: dati.quando, persone: dati.persone });
  }

  if (fatta) {
    return (
      <div className="surface p-6 text-center">
        <h1 className="text-display text-2xl">Ci siamo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La richiesta è arrivata a {nomeLocale}: {leggibile(fatta.quando)} per {fatta.persone}{" "}
          {fatta.persone === 1 ? "persona" : "persone"}.
        </p>
        {/* Non si dice «confermata»: le prenotazioni che arrivano da fuori le
            conferma il locale, e dire il contrario farebbe presentare qualcuno
            a un tavolo che non c'è. */}
        <p className="t-nota mt-3">
          Il ristorante la conferma appena può. Se serve prima, una telefonata resta la strada più
          breve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="surface space-y-4 p-6">
      <div>
        <h1 className="text-display text-2xl leading-tight">Riprendiamo da dove eravamo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La telefonata con {nomeLocale} si è interrotta. Quello che avevi già detto è qui sotto:
          controlla e completa.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="r-giorno">Giorno</Label>
          <Input
            id="r-giorno"
            type="date"
            value={giorno}
            onChange={(e) => setGiorno(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="r-ora">Ora</Label>
          <Input
            id="r-ora"
            type="time"
            value={ora}
            onChange={(e) => setOra(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="r-persone">Persone</Label>
          <Input
            id="r-persone"
            type="number"
            min={1}
            max={50}
            value={quanti}
            onChange={(e) => setQuanti(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="r-nome">Nome</Label>
          <Input id="r-nome" name="nome" defaultValue={nome ?? ""} required maxLength={80} />
        </div>
        <div>
          <Label htmlFor="r-cognome">Cognome</Label>
          <Input id="r-cognome" name="cognome" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="r-note">Qualcosa da dirgli</Label>
          <Input id="r-note" name="note" maxLength={500} placeholder="Allergie, seggiolone…" />
        </div>
      </div>

      {/* Il numero non si chiede e non si mostra come campo: è quello da cui è
          arrivata la telefonata, e viene dal link. Un campo in più da compilare
          su una cosa che sappiamo già è un motivo in più per chiudere la
          pagina. */}
      {errore && <p className="text-sm text-destructive">{errore}</p>}

      <Button type="submit" variant="brand" disabled={inCorso} className="h-11 w-full">
        {inCorso ? "Mando…" : "Completa la prenotazione"}
      </Button>
    </form>
  );
}

function isoGiorno(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoOra(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function leggibile(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
