"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";

/**
 * Montare una linea dell'operatore e darla a un locale, in un modulo solo.
 *
 * ## Perché un modulo e non due
 *
 * Perché chi compra una linea non pensa «prima il collegamento all'operatore,
 * poi il numero»: pensa **«ho comprato questo numero, è di questo
 * ristorante»**. I due gesti sul centralino restano due, ma l'ordine e il
 * collegamento fra loro non sono un problema di chi vende.
 *
 * ## La password si scrive una volta e non torna più
 *
 * Non la conserviamo: passa al centralino, finisce nel file di configurazione
 * di PJSIP e in Tavolo non resta. Per questo il campo si svuota dopo il
 * salvataggio e non si ripropone riempito — mostrare pallini al posto di una
 * password che non abbiamo sarebbe dire una cosa falsa. Dove ritrovarla è
 * l'area clienti dell'operatore.
 */
export function MontaLinea({
  locali,
}: {
  locali: { venueId: string; nome: string; organizzazione: string }[];
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);
  const [avvisi, setAvvisi] = useState<{ messaggio: string; rimedio: string }[]>([]);

  async function monta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setInCorso(true);
    setErrore(null);
    setFatto(null);
    setAvvisi([]);

    const res = await fetch("/api/admin/linee", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: String(fd.get("nome") ?? "").trim(),
        host: String(fd.get("host") ?? "").trim(),
        porta: Number(fd.get("porta")) || undefined,
        trasporto: String(fd.get("trasporto") ?? "UDP"),
        utente: String(fd.get("utente") ?? "").trim() || undefined,
        password: String(fd.get("password") ?? "") || undefined,
        numero: String(fd.get("numero") ?? "").trim(),
        venueId: String(fd.get("venueId") ?? ""),
      }),
    });
    setInCorso(false);

    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a montare la linea."));
      return;
    }

    const dati = (await res.json()) as {
      numero: string;
      montata: boolean;
      avvisi?: { messaggio: string; rimedio: string }[];
    };
    setFatto(
      dati.montata
        ? `Linea montata e numero ${dati.numero} assegnato.`
        : `Numero ${dati.numero} assegnato, ma la linea non è stata applicata sul centralino: le telefonate non arriveranno ancora.`,
    );
    setAvvisi(dati.avvisi ?? []);
    e.currentTarget.reset();
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAperto(true)}>
        Monta una linea dell&apos;operatore
      </Button>
    );
  }

  return (
    <form onSubmit={monta} className="surface space-y-3 p-4">
      <div>
        <p className="text-sm font-medium">Una linea nuova</p>
        <p className="t-nota mt-0.5">
          I dati te li dà il tuo operatore telefonico. La password non la conserviamo: va nel
          centralino e resta lì.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="linea-nome">Operatore</Label>
          <Input id="linea-nome" name="nome" required maxLength={60} placeholder="Come si chiama" />
        </div>
        <div>
          <Label htmlFor="linea-host">Server SIP</Label>
          <Input id="linea-host" name="host" required maxLength={200} placeholder="sip.operatore.it" />
        </div>
        <div>
          <Label htmlFor="linea-utente">Utenza</Label>
          <Input id="linea-utente" name="utente" maxLength={120} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="linea-password">Password</Label>
          <Input
            id="linea-password"
            name="password"
            type="password"
            maxLength={200}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label htmlFor="linea-numero">Il numero</Label>
          <Input id="linea-numero" name="numero" required maxLength={40} inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="linea-venue">Di quale locale</Label>
          <select
            id="linea-venue"
            name="venueId"
            required
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Scegli…</option>
            {locali.map((l) => (
              <option key={l.venueId} value={l.venueId}>
                {l.nome} · {l.organizzazione}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="linea-porta">Porta</Label>
          <Input id="linea-porta" name="porta" type="number" defaultValue={5060} min={1} max={65535} />
        </div>
        <div>
          <Label htmlFor="linea-trasporto">Trasporto</Label>
          <select
            id="linea-trasporto"
            name="trasporto"
            defaultValue="UDP"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="UDP">UDP</option>
            <option value="TCP">TCP</option>
            <option value="TLS">TLS</option>
          </select>
        </div>
      </div>

      {/* Porta e trasporto stanno per ultimi di proposito: sono gli unici due
          campi che si sbagliano credendo di saperli, e quasi sempre vanno
          lasciati come sono. Metterli in cima li farebbe toccare. */}
      <p className="t-nota">
        Porta e trasporto: lasciali così se l&apos;operatore non dice diversamente.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="sm" disabled={inCorso}>
          {inCorso ? "Monto…" : "Monta e assegna"}
        </Button>
        <button
          type="button"
          onClick={() => setAperto(false)}
          className="t-nota underline transition-colors hover:text-foreground"
        >
          Chiudi
        </button>
      </div>

      {fatto && <p className="text-xs text-sage-strong">{fatto}</p>}
      {avvisi.map((a) => (
        <p key={a.messaggio} className="t-nota">
          ! {a.messaggio} — {a.rimedio}
        </p>
      ))}
      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </form>
  );
}
