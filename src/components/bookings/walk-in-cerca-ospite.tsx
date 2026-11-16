"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Loader2, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Come arriva da `/api/guests/cerca` (le date sono stringhe ISO). */
export type OspiteTrovato = {
  id: string;
  firstName: string;
  lastName: string | null;
  telefonoFinale: string | null;
  totalVisits: number;
  lastVisitAt: string | null;
  allergies: string | null;
};

/**
 * Il nome del walk-in, cercato mentre si scrive.
 *
 * Se la persona è già passata di qui, la tendina la propone e toccarla collega
 * il walk-in alla sua scheda: visite, allergie e punti restano su una scheda
 * sola. Se non c'è, il nome scritto apre una scheda nuova. Prima il nome era
 * solo testo, e ogni cliente abituale entrato senza prenotare diventava un
 * doppione nel CRM.
 */
export function CercaOspite({
  testo,
  onTesto,
  ospite,
  onOspite,
  onInvio,
}: {
  testo: string;
  onTesto: (t: string) => void;
  ospite: OspiteTrovato | null;
  onOspite: (o: OspiteTrovato | null) => void;
  onInvio: () => void;
}) {
  const idLista = useId();
  const [trovati, setTrovati] = useState<OspiteTrovato[] | null>(null);
  const [cerco, setCerco] = useState(false);
  /* «Nuovo ospite» toccato: la tendina si chiude finché il testo non cambia. */
  const [nuovoConfermato, setNuovoConfermato] = useState(false);

  const q = testo.trim();

  useEffect(() => {
    if (ospite || q.length < 2) {
      setTrovati(null);
      setCerco(false);
      return;
    }
    let annullato = false;
    setCerco(true);
    // Un attimo di attesa: una richiesta per lettera è rumore, e la tendina
    // che salta a ogni tasto non si riesce a toccare.
    const t = window.setTimeout(() => {
      fetch(`/api/guests/cerca?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { ospiti: [] }))
        .then((data: { ospiti: OspiteTrovato[] }) => {
          if (!annullato) setTrovati(data.ospiti);
        })
        .catch(() => {
          if (!annullato) setTrovati([]);
        })
        .finally(() => {
          if (!annullato) setCerco(false);
        });
    }, 250);
    return () => {
      annullato = true;
      window.clearTimeout(t);
    };
  }, [q, ospite]);

  if (ospite) {
    return (
      <div className="space-y-1.5">
        <p className="t-etichetta text-sm text-muted-foreground">Ospite</p>
        <div className="flex items-center gap-3 rounded-2xl border-2 border-foreground/15 bg-foreground/[0.03] p-3">
          <Iniziali ospite={ospite} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">{nomeIntero(ospite)}</p>
            <p className="text-sm text-muted-foreground">{dettagli(ospite)}</p>
          </div>
          <button
            type="button"
            onClick={() => onOspite(null)}
            aria-label={`Togli ${nomeIntero(ospite)}`}
            className="tocco-comodo grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.07]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {/* L'allergia si dice qui, prima di sederli: dopo è tardi. */}
        {ospite.allergies && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Allergie:</span> {ospite.allergies}
            </span>
          </p>
        )}
      </div>
    );
  }

  const tendinaAperta = q.length >= 2 && !nuovoConfermato && trovati !== null && trovati.length > 0;
  const maiVisto = q.length >= 2 && !cerco && trovati !== null && trovati.length === 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="wi-name">Nome e cognome</Label>
      <div className="relative">
        <Input
          id="wi-name"
          role="combobox"
          aria-expanded={tendinaAperta}
          aria-controls={idLista}
          aria-autocomplete="list"
          value={testo}
          onChange={(e) => {
            onTesto(e.target.value);
            setNuovoConfermato(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onInvio();
          }}
          placeholder="Es. Mario Rossi"
          /* Non `off`: Chrome lo ignora, prende il campo per il nome sulla
             carta e su http apre un fumetto («compilazione dei metodi di
             pagamento disattivata») che copre la tendina. Un valore che non
             conosce lo fa stare zitto. */
          name="walkin-ospite"
          autoComplete="walkin-ospite"
          data-1p-ignore
          data-lpignore="true"
          autoCapitalize="words"
          className="h-14 pr-11 text-lg"
        />
        {cerco && (
          <Loader2
            className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {tendinaAperta && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Ospiti già passati di qui"
          className="overflow-hidden rounded-2xl border border-border bg-[color:var(--card-fill)] shadow-sm"
        >
          {trovati.map((o) => (
            <li key={o.id} role="option" aria-selected={false} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onOspite(o)}
                className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-foreground/[0.04] active:bg-foreground/[0.07]"
              >
                <Iniziali ospite={o} />
                {/* Solo nome e avatar: si scorre a colpo d'occhio. Visite,
                    telefono e allergie compaiono sulla scheda una volta scelta. */}
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{nomeIntero(o)}</span>
              </button>
            </li>
          ))}
          {/* Un omonimo non è lui: si può sempre dire che è una persona nuova. */}
          <li role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => setNuovoConfermato(true)}
              className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left text-base font-medium hover:bg-foreground/[0.04]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.07]">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 truncate">Nuovo ospite «{q}»</span>
            </button>
          </li>
        </ul>
      )}

      {(maiVisto || (nuovoConfermato && q.length >= 2)) && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground" role="status">
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* Che si crei la scheda lo sanno tutti: basta dire che è nuovo. */}
          {maiVisto ? "Mai passato di qui" : "Nuovo ospite"}
        </p>
      )}
    </div>
  );
}

function nomeIntero(o: Pick<OspiteTrovato, "firstName" | "lastName">) {
  return `${o.firstName} ${o.lastName ?? ""}`.trim();
}

/** «12 visite · ultima 3 ott · tel ···482»: quello che serve a dire «è lui». */
function dettagli(o: OspiteTrovato) {
  const parti: string[] = [];
  parti.push(o.totalVisits === 1 ? "1 visita" : `${o.totalVisits} visite`);
  if (o.lastVisitAt) {
    const d = new Date(o.lastVisitAt);
    const stessoAnno = d.getFullYear() === new Date().getFullYear();
    parti.push(
      `ultima ${d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(stessoAnno ? {} : { year: "numeric" }) })}`,
    );
  }
  if (o.telefonoFinale) parti.push(`tel ···${o.telefonoFinale}`);
  return parti.join(" · ");
}

function Iniziali({ ospite }: { ospite: OspiteTrovato }) {
  const iniziali = `${ospite.firstName[0] ?? ""}${ospite.lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
      style={{ background: "var(--vi-verde,#2c5545)" }}
      aria-hidden="true"
    >
      {iniziali}
    </span>
  );
}
