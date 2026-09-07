"use client";

import { useState } from "react";
import { Check, Copy, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import type { PortaleConfig, WifiSignupResult } from "@/server/wifi";

/**
 * Il modulo che compila chi è appena entrato nel locale.
 *
 * Tre cose e basta: come ti chiami, dove ti troviamo, e la spunta
 * sull'informativa. Ogni campo in più è una persona in meno che arriva in
 * fondo — e qui la persona è in piedi, con una mano occupata, e vuole solo la
 * rete.
 *
 * Lo scambio è dichiarato in alto: **lasci un contatto, ricevi la password.**
 * Un modulo che chiede dei dati senza dire cosa dà in cambio è la ragione per
 * cui la gente scrive `asd@asd.it`.
 *
 * La casella del marketing è **separata e non spuntata**: è un consenso, e un
 * consenso preso di nascosto dentro un'altra spunta non è un consenso. Chi la
 * salta si collega comunque.
 */
export function WifiPortalForm({ portale }: { portale: PortaleConfig }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esito, setEsito] = useState<WifiSignupResult | null>(null);
  const [copiato, setCopiato] = useState(false);

  const accento = portale.accent ?? undefined;

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setError(null);

    const res = await fetch(`/api/public/wifi?venue=${encodeURIComponent(portale.slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        consentPrivacy: privacy,
        consentMarketing: marketing,
      }),
    });
    setInCorso(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a collegarti. Chiedi la password al personale."));
      return;
    }
    setEsito(await res.json());
  }

  async function copia(testo: string) {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      // Su un telefono senza permesso di scrittura negli appunti la password
      // resta scritta grande in pagina: si legge e si digita.
    }
  }

  if (esito) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">Rete</p>
          <p className="text-display text-2xl">{esito.networkName}</p>

          <p className="mt-4 text-sm text-muted-foreground">Password</p>
          <p className="select-all break-all font-mono text-2xl" style={{ color: accento }}>
            {esito.password}
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => copia(esito.password)}
          >
            {copiato ? (
              <>
                <Check className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Copiata
              </>
            ) : (
              <>
                <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Copia la password
              </>
            )}
          </Button>
        </div>

        {esito.coupon && (
          <div className="rounded-lg border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">E un regalo per la prossima volta</p>
            <p className="text-display text-3xl" style={{ color: accento }}>
              {esito.coupon.percent}%
            </p>
            <p className="mt-1 select-all font-mono text-lg">{esito.coupon.code}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Valido fino al{" "}
              {new Date(esito.coupon.validUntil).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . Mostralo a chi ti serve al tavolo.
            </p>
          </div>
        )}

        {/* Nessuna promessa che non possiamo mantenere: la rete la apre il
            router del locale, non questa pagina. */}
        <p className="text-center text-xs text-muted-foreground">
          Ora scegli <strong>{esito.networkName}</strong> fra le reti del telefono e incolla la password.
        </p>

        {esito.redirectUrl && (
          <Button asChild variant="accent" className="w-full">
            <a href={esito.redirectUrl}>Continua</a>
          </Button>
        )}
      </div>
    );
  }

  return (
    // `method="post"`: se qualcuno invia prima che il JavaScript sia pronto,
    // i campi non finiscono nella barra dell'indirizzo — e qui dentro ci sono
    // un nome e un'email.
    <form onSubmit={invia} method="post" className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Lascia un contatto e ricevi subito la password della rete.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="w-nome">Come ti chiami</Label>
        <Input
          id="w-nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome e cognome"
          autoComplete="name"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-email">Email</Label>
        <Input
          id="w-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@esempio.it"
          autoComplete="email"
          inputMode="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-tel">Oppure il telefono</Label>
        <Input
          id="w-tel"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="340 1234567"
          autoComplete="tel"
          inputMode="tel"
        />
      </div>

      <label className="flex items-start gap-3 text-sm" htmlFor="w-privacy">
        <input
          id="w-privacy"
          type="checkbox"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-border"
          required
        />
        <span>
          Ho letto l&apos;informativa sul trattamento dei dati.
          {portale.legal && (
            <span className="mt-1 block text-xs text-muted-foreground">{portale.legal}</span>
          )}
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm" htmlFor="w-marketing">
        <input
          id="w-marketing"
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-border"
        />
        <span>
          Voglio ricevere le novità e le offerte di {portale.venueName}.
          <span className="mt-1 block text-xs text-muted-foreground">
            Facoltativo: senza la spunta ti colleghi comunque.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        variant="accent"
        className="w-full"
        disabled={inCorso || !name.trim() || !privacy}
        style={accento ? { backgroundColor: accento } : undefined}
      >
        <Wifi className="mr-2 h-4 w-4" aria-hidden="true" />
        {inCorso ? "Un istante…" : portale.conCoupon ? "Collegati e prendi lo sconto" : "Collegati"}
      </Button>
    </form>
  );
}
