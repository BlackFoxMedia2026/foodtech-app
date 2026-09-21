"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/euro";
import { ALLERGENI } from "@/lib/allergeni";
import { COTTURE, PORZIONI, SENZA_FREQUENTI } from "@/lib/personalizzazioni";
import type { OspiteView } from "@/server/comande/comande";
import { Foglio } from "./foglio";

/**
 * **La personalizzazione di un piatto** — §11, §12, §13, §15.
 *
 * ## L'ordine delle sezioni è l'ordine dei tap
 *
 * Quantità, commensale, cottura, senza, extra, note, allergia. Non è
 * alfabetico e non è per importanza concettuale: è la sequenza in cui un
 * cameriere raccoglie le informazioni al tavolo — «due carbonare» (quantità),
 * «per chi?» (ospite), poi le variazioni che il cliente aggiunge parlando.
 *
 * L'allergia sta **in fondo e non nascosta**: è l'unica sezione con un colore
 * suo, e si apre con un interruttore invece che stare sempre aperta. Il
 * motivo: su venti piatti battuti in una sera, l'allergia riguarda uno; una
 * griglia di quattordici caselle sempre visibile allungherebbe ogni foglio di
 * duecento pixel per un caso su venti, e la conseguenza sarebbe che si scorre
 * più in fretta — cioè esattamente il contrario di quello che serve.
 *
 * ## Il §13, alla lettera
 *
 * «Non usare badge troppo piccoli». Le caselle degli allergeni sono alte 44
 * px, il riepilogo dell'allergia è un blocco rosso con un'icona, e la stessa
 * informazione riappare in grande nel riepilogo della comanda e sulla card del
 * tavolo. Un'allergia comunicata da un pallino è un'allergia che qualcuno non
 * vede.
 */

export type PiattoDaPersonalizzare = {
  menuItemId: string;
  nome: string;
  descrizione: string | null;
  priceCents: number;
  /** Gli allergeni **contenuti nel piatto**, dal menu: si mostrano, non si scelgono. */
  allergeniDelPiatto: string[];
};

export type ScelteRiga = {
  quantity: number;
  orderGuestId: string | null;
  modifiche: { kind: "VARIANTE" | "SENZA" | "EXTRA" | "COTTURA" | "PORZIONE"; label: string; priceCents: number }[];
  notes: string | null;
  allergeni: string[];
  notaAllergia: string | null;
};

const VUOTO: ScelteRiga = {
  quantity: 1,
  orderGuestId: null,
  modifiche: [],
  notes: null,
  allergeni: [],
  notaAllergia: null,
};

export function FoglioPiatto({
  piatto,
  ospiti,
  onChiudi,
  onConferma,
  inCorso,
}: {
  piatto: PiattoDaPersonalizzare | null;
  ospiti: OspiteView[];
  onChiudi: () => void;
  onConferma: (scelte: ScelteRiga) => void | Promise<void>;
  inCorso: boolean;
}) {
  const [scelte, setScelte] = useState<ScelteRiga>(VUOTO);
  const [conAllergia, setConAllergia] = useState(false);
  const [senzaLibero, setSenzaLibero] = useState("");

  /* Ogni apertura riparte pulita: un foglio che ricorda la cottura del piatto
     precedente manda in cucina una tagliata al sangue che nessuno ha chiesto. */
  useEffect(() => {
    if (piatto) {
      setScelte(VUOTO);
      setConAllergia(false);
      setSenzaLibero("");
    }
  }, [piatto]);

  if (!piatto) return null;

  const extra = scelte.modifiche.reduce((s, m) => s + m.priceCents, 0);
  const totale = (piatto.priceCents + extra) * scelte.quantity;

  function alterna(
    kind: ScelteRiga["modifiche"][number]["kind"],
    label: string,
    priceCents = 0,
    /** Vero quando le opzioni si escludono: cottura, porzione. */
    esclusiva = false,
  ) {
    setScelte((s) => {
      const gia = s.modifiche.some((m) => m.kind === kind && m.label === label);
      const senzaQuesta = s.modifiche.filter((m) =>
        esclusiva ? m.kind !== kind : !(m.kind === kind && m.label === label),
      );
      return { ...s, modifiche: gia ? senzaQuesta : [...senzaQuesta, { kind, label, priceCents }] };
    });
  }

  const scelta = (kind: string, label: string) =>
    scelte.modifiche.some((m) => m.kind === kind && m.label === label);

  return (
    <Foglio
      aperto
      onChiudi={onChiudi}
      titolo={piatto.nome}
      sottotitolo={piatto.descrizione}
      piede={
        <button
          type="button"
          disabled={inCorso}
          onClick={() => {
            const finale: ScelteRiga = {
              ...scelte,
              notes: scelte.notes?.trim() || null,
              allergeni: conAllergia ? scelte.allergeni : [],
              notaAllergia: conAllergia ? scelte.notaAllergia?.trim() || null : null,
            };
            onConferma(finale);
          }}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-cream px-5 text-base font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          {inCorso ? "Aggiungo…" : `Aggiungi · ${euro(totale)}`}
        </button>
      }
    >
      <div className="space-y-5">
        <Sezione titolo="Quantità">
          <Quantita
            valore={scelte.quantity}
            onCambia={(q) => setScelte((s) => ({ ...s, quantity: q }))}
          />
        </Sezione>

        {ospiti.length > 0 && (
          <Sezione titolo="Per chi">
            <div className="flex flex-wrap gap-2">
              <Pillola
                attiva={scelte.orderGuestId === null}
                onClick={() => setScelte((s) => ({ ...s, orderGuestId: null }))}
              >
                Tutto il tavolo
              </Pillola>
              {ospiti.map((o) => (
                <Pillola
                  key={o.id}
                  attiva={scelte.orderGuestId === o.id}
                  onClick={() => setScelte((s) => ({ ...s, orderGuestId: o.id }))}
                >
                  {o.label}
                </Pillola>
              ))}
            </div>
          </Sezione>
        )}

        <Sezione titolo="Cottura">
          <div className="flex flex-wrap gap-2">
            {COTTURE.map((c) => (
              <Pillola key={c} attiva={scelta("COTTURA", c)} onClick={() => alterna("COTTURA", c, 0, true)}>
                {c}
              </Pillola>
            ))}
          </div>
        </Sezione>

        <Sezione titolo="Senza" nota="Quello che non deve finire nel piatto.">
          <div className="flex flex-wrap gap-2">
            {SENZA_FREQUENTI.map((c) => (
              <Pillola key={c} attiva={scelta("SENZA", c)} onClick={() => alterna("SENZA", c)}>
                {c}
              </Pillola>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={senzaLibero}
              onChange={(e) => setSenzaLibero(e.target.value)}
              placeholder="Senza…"
              maxLength={60}
              className="min-h-[44px] flex-1 rounded-md border border-input bg-secondary px-3 text-sm placeholder:text-muted-foreground"
            />
            <button
              type="button"
              disabled={!senzaLibero.trim()}
              onClick={() => {
                alterna("SENZA", `Senza ${senzaLibero.trim().replace(/^senza\s+/i, "")}`);
                setSenzaLibero("");
              }}
              className="min-h-[44px] shrink-0 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-40"
            >
              Aggiungi
            </button>
          </div>
        </Sezione>

        <Sezione titolo="Porzione">
          <div className="flex flex-wrap gap-2">
            {PORZIONI.map((p) => (
              <Pillola key={p} attiva={scelta("PORZIONE", p)} onClick={() => alterna("PORZIONE", p, 0, true)}>
                {p}
              </Pillola>
            ))}
          </div>
        </Sezione>

        <Sezione titolo="Nota per la cucina">
          <textarea
            value={scelte.notes ?? ""}
            onChange={(e) => setScelte((s) => ({ ...s, notes: e.target.value }))}
            rows={2}
            maxLength={200}
            placeholder="«Servire insieme ai primi»"
            className="w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm placeholder:text-muted-foreground"
          />
        </Sezione>

        {/* L'allergia: l'unica sezione con un colore suo. */}
        <section
          className={cn(
            "rounded-lg border p-3",
            conAllergia ? "border-destructive/50 bg-destructive/10" : "border-border",
          )}
        >
          <label className="flex min-h-[44px] items-center gap-3">
            <input
              type="checkbox"
              checked={conAllergia}
              onChange={(e) => setConAllergia(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[#C32222]"
            />
            <span className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle
                className={cn("h-4 w-4", conAllergia ? "text-destructive-soft" : "text-muted-foreground")}
                aria-hidden="true"
              />
              Allergia o intolleranza
            </span>
          </label>

          {conAllergia && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ALLERGENI).map(([codice, nome]) => {
                  const attivo = scelte.allergeni.includes(codice);
                  return (
                    <button
                      key={codice}
                      type="button"
                      aria-pressed={attivo}
                      onClick={() =>
                        setScelte((s) => ({
                          ...s,
                          allergeni: attivo
                            ? s.allergeni.filter((a) => a !== codice)
                            : [...s.allergeni, codice],
                        }))
                      }
                      className={cn(
                        "min-h-[44px] rounded-md border px-3 text-left text-sm transition-colors",
                        attivo
                          ? "border-destructive/60 bg-destructive/20 font-medium text-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={scelte.notaAllergia ?? ""}
                onChange={(e) => setScelte((s) => ({ ...s, notaAllergia: e.target.value }))}
                rows={2}
                maxLength={300}
                placeholder="«Allergia grave alle arachidi»"
                className="w-full rounded-md border border-destructive/40 bg-background/40 px-3 py-2 text-sm placeholder:text-muted-foreground"
              />
              <p className="t-nota">
                Questa riga arriva in cucina in evidenza, e resta sulla comanda e sulla card del
                tavolo.
              </p>
            </div>
          )}
        </section>

        {piatto.allergeniDelPiatto.length > 0 && (
          <p className="t-nota">
            Il piatto contiene: {piatto.allergeniDelPiatto.map((a) => nomeBreve(a)).join(", ")}.
          </p>
        )}
      </div>
    </Foglio>
  );
}

function nomeBreve(codice: string): string {
  return (ALLERGENI as Record<string, string>)[codice] ?? codice;
}

function Sezione({
  titolo,
  nota,
  children,
}: {
  titolo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="t-etichetta mb-2">{titolo}</h3>
      {nota && <p className="t-nota -mt-1 mb-2">{nota}</p>}
      {children}
    </section>
  );
}

export function Pillola({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={attiva}
      onClick={onClick}
      className={cn(
        "min-h-[44px] rounded-full border px-4 text-sm transition-colors",
        attiva
          ? "border-cream bg-cream font-medium text-clay-ink"
          : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Il selettore di quantità: `[-] 2 [+]` (§11).
 *
 * Quarantotto pixel per lato invece dei trentasei dei pulsanti del back
 * office: è il controllo che si preme più volte di seguito, e a 36 px con un
 * pollice in movimento si sbaglia il bersaglio prima o poi. Il numero in
 * mezzo è tabellare, così non balla passando da 9 a 10.
 */
export function Quantita({
  valore,
  onCambia,
  minimo = 1,
}: {
  valore: number;
  onCambia: (q: number) => void;
  minimo?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border p-1">
      <button
        type="button"
        aria-label="Togli uno"
        disabled={valore <= minimo}
        onClick={() => onCambia(valore - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-colors active:bg-current/10 disabled:opacity-30"
      >
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>
      <span className="min-w-[2.5rem] text-center text-lg font-medium tabular-nums" aria-live="polite">
        {valore}
      </span>
      <button
        type="button"
        aria-label="Aggiungi uno"
        disabled={valore >= 99}
        onClick={() => onCambia(valore + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-full transition-colors active:bg-current/10 disabled:opacity-30"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
