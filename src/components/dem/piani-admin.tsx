"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";

export type PianoAdmin = {
  id: string;
  slug: string;
  name: string;
  monthlyEmails: number;
  priceCents: number;
  stripePriceId: string | null;
  active: boolean;
  sortOrder: number;
  badge: string | null;
  description: string | null;
  abbonati: number;
};

/**
 * I piani, modificabili senza pubblicare una versione.
 *
 * Una riga per piano, con accanto **quanti clienti ci sono sopra**: è il
 * numero che cambia il peso di ogni modifica. Cambiare il prezzo di un piano
 * con zero abbonati è una decisione commerciale; farlo con quaranta è
 * un'operazione che va pensata.
 *
 * Il prezzo su Stripe si scrive qui ma **non** si propaga agli abbonamenti già
 * attivi, e la riga sotto il campo lo dice: su Stripe un prezzo è immutabile,
 * se ne crea uno nuovo e le sottoscrizioni esistenti vanno migrate a parte.
 * Scriverlo e sperare che si aggiorni da solo è il modo di fatturare a
 * qualcuno una cifra che non ha mai accettato.
 */
export function PianiAdmin({ piani }: { piani: PianoAdmin[] }) {
  return (
    <div className="space-y-4">
      {piani.map((p) => (
        <RigaPiano key={p.id} piano={p} />
      ))}
    </div>
  );
}

function RigaPiano({ piano }: { piano: PianoAdmin }) {
  const router = useRouter();
  const [dati, setDati] = useState(piano);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const cambiato =
    dati.name !== piano.name ||
    dati.monthlyEmails !== piano.monthlyEmails ||
    dati.priceCents !== piano.priceCents ||
    dati.stripePriceId !== piano.stripePriceId ||
    dati.active !== piano.active ||
    dati.badge !== piano.badge ||
    dati.description !== piano.description;

  async function salva() {
    setBusy(true);
    setErrore(null);
    setSalvato(false);
    const res = await fetch(`/api/admin/dem/piani/${piano.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: dati.name,
        monthlyEmails: dati.monthlyEmails,
        priceCents: dati.priceCents,
        stripePriceId: dati.stripePriceId,
        active: dati.active,
        badge: dati.badge,
        description: dati.description,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="t-titolo-scheda">{piano.name}</h2>
          <p className="t-nota">
            <code className="font-mono">{piano.slug}</code> ·{" "}
            {piano.abbonati === 0
              ? "nessun cliente su questo piano"
              : `${piano.abbonati} ${piano.abbonati === 1 ? "cliente" : "clienti"}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={dati.active} onCheckedChange={(v) => setDati({ ...dati, active: v })} />
          Attivo
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etichetta="Nome" id={`nome-${piano.id}`}>
          <Input
            id={`nome-${piano.id}`}
            value={dati.name}
            onChange={(e) => setDati({ ...dati, name: e.target.value })}
          />
        </Campo>

        <Campo etichetta="Email al mese" id={`quota-${piano.id}`}>
          <Input
            id={`quota-${piano.id}`}
            type="number"
            min={0}
            value={dati.monthlyEmails}
            onChange={(e) => setDati({ ...dati, monthlyEmails: Number(e.target.value) })}
          />
        </Campo>

        <Campo etichetta="Prezzo in centesimi" id={`prezzo-${piano.id}`}>
          <Input
            id={`prezzo-${piano.id}`}
            type="number"
            min={0}
            value={dati.priceCents}
            onChange={(e) => setDati({ ...dati, priceCents: Number(e.target.value) })}
          />
          <p className="t-nota">
            {piano.abbonati > 0
              ? "Il nuovo prezzo non cambia gli abbonamenti già attivi: vanno migrati a parte."
              : "Nessun abbonamento attivo: il prezzo vale dal prossimo acquisto."}
          </p>
        </Campo>

        <Campo etichetta="Identificativo prezzo Stripe" id={`stripe-${piano.id}`}>
          <Input
            id={`stripe-${piano.id}`}
            value={dati.stripePriceId ?? ""}
            placeholder="price_…"
            onChange={(e) => setDati({ ...dati, stripePriceId: e.target.value || null })}
          />
          <p className="t-nota">Senza, il piano non è acquistabile.</p>
        </Campo>

        <Campo etichetta="Etichetta" id={`badge-${piano.id}`}>
          <Input
            id={`badge-${piano.id}`}
            value={dati.badge ?? ""}
            placeholder="Più scelto"
            onChange={(e) => setDati({ ...dati, badge: e.target.value || null })}
          />
        </Campo>

        <Campo etichetta="Descrizione" id={`desc-${piano.id}`}>
          <Input
            id={`desc-${piano.id}`}
            value={dati.description ?? ""}
            onChange={(e) => setDati({ ...dati, description: e.target.value || null })}
          />
        </Campo>
      </div>

      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}

      <div className="flex items-center gap-3">
        <Button variant="accent" size="sm" disabled={!cambiato || busy} onClick={salva}>
          {busy ? "Salvo…" : "Salva"}
        </Button>
        {salvato && !cambiato && <p className="t-nota">Salvato.</p>}
      </div>
    </section>
  );
}

function Campo({
  etichetta,
  id,
  children,
}: {
  etichetta: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etichetta}</Label>
      {children}
    </div>
  );
}
