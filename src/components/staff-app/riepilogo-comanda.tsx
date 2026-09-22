"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/euro";
import { nomeAllergene } from "@/lib/allergeni";
import { riassuntoModifiche } from "@/lib/personalizzazioni";
import { chiaveInvio, chiedi, ErroreStaff } from "@/lib/staff-fetch";
import { useAvvisi } from "@/components/ui/avvisi";
import type { ComandaView, OspiteView, RigaComandaView } from "@/server/comande/comande";
import { Foglio } from "./foglio";
import { Quantita } from "./foglio-piatto";

/**
 * **Il riepilogo della comanda, e l'invio in cucina** — §16, §17, §38.
 *
 * ## Raggruppato per commensale
 *
 * §16 mostra il riepilogo come lo legge chi serve: «Marco: carbonara senza
 * pecorino, acqua. Laura: risotto ⚠️ allergia lattosio». Non un elenco piatto
 * di sei righe, che è come lo leggerebbe una cassa.
 *
 * Il gruppo «Tutto il tavolo» sta in cima perché è il più numeroso e perché
 * è quello che non ha bisogno di essere letto piatto per piatto.
 *
 * ## La protezione dal doppio invio, in tre strati
 *
 * 1. **la chiave** (`invioKey`) si genera una volta e resta la stessa finché
 *    il gesto non riesce: due tap mandano la stessa chiave, e il server —
 *    grazie a un vincolo unico, non a un controllo — restituisce la comanda
 *    già partita invece di farne una seconda;
 * 2. **il pulsante si spegne** mentre la richiesta è in volo. Da solo non
 *    basterebbe: su una rete che arranca il primo tap può non aver ancora
 *    disabilitato niente quando arriva il secondo;
 * 3. **il timeout** (dodici secondi, in `lib/staff-fetch.ts`) riaccende il
 *    pulsante con un messaggio che dice esplicitamente che niente è partito
 *    due volte — perché la domanda che si fa chi vede un errore dopo aver
 *    premuto «invia» è precisamente quella.
 */

export function RiepilogoComanda({
  aperto,
  onChiudi,
  comanda,
  ospiti,
  tavolo,
  onAggiornata,
  onInviata,
  puoInviare,
}: {
  aperto: boolean;
  onChiudi: () => void;
  comanda: ComandaView | null;
  ospiti: OspiteView[];
  tavolo: string;
  onAggiornata: (c: ComandaView) => void;
  onInviata: (c: ComandaView) => void;
  puoInviare: boolean;
}) {
  const avvisi = useAvvisi();
  const [inviando, setInviando] = useState(false);
  const [nota, setNota] = useState("");
  /* La chiave sopravvive ai rendering e si azzera **solo** dopo un invio
     riuscito: è il primo dei tre strati descritti sopra. */
  const chiave = useRef<string | null>(null);

  if (!comanda) return null;

  const gruppi = raggruppa(comanda.righe, ospiti);
  const vuota = comanda.righe.filter((r) => r.status !== "ANNULLATA").length === 0;

  async function cambiaQuantita(riga: RigaComandaView, q: number) {
    try {
      const aggiornata = await chiedi<ComandaView>(
        `/api/staff-app/comande/${comanda!.id}/righe/${riga.id}`,
        { metodo: "PATCH", corpo: { quantity: q } },
      );
      onAggiornata(aggiornata);
    } catch (e) {
      avvisi.problema(e instanceof Error ? e.message : "Non è stato possibile cambiare la riga.");
    }
  }

  async function invia() {
    if (inviando) return;
    setInviando(true);
    chiave.current ??= chiaveInvio();

    try {
      const esito = await chiedi<{ comanda: ComandaView; inviataAdesso: boolean }>(
        `/api/staff-app/comande/${comanda!.id}/invia`,
        { metodo: "POST", corpo: { invioKey: chiave.current, nota: nota.trim() || null } },
      );
      chiave.current = null;
      setNota("");
      onInviata(esito.comanda);
      /* §17: la conferma porta **l'ora**. È quello che il cameriere ripete al
         tavolo e alla cucina — «mandata alle 18:42» — e senza, «inviata» è
         una parola che non si può verificare. */
      avvisi.mostra(
        esito.inviataAdesso
          ? `Comanda inviata · ${ora(esito.comanda.sentAt)}`
          : `Era già partita · ${ora(esito.comanda.sentAt)}`,
      );
      onChiudi();
    } catch (e) {
      const messaggio =
        e instanceof ErroreStaff ? e.message : "Non è stato possibile inviare la comanda.";
      avvisi.problema(messaggio);
    } finally {
      setInviando(false);
    }
  }

  return (
    <Foglio
      aperto={aperto}
      onChiudi={onChiudi}
      titolo={`Tavolo ${tavolo}`}
      sottotitolo={`Comanda ${comanda.numero} · ${comanda.articoli} ${comanda.articoli === 1 ? "articolo" : "articoli"}`}
      piede={
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="t-etichetta">Totale</span>
            <span className="font-display text-xl tabular-nums">{euro(comanda.totalCents)}</span>
          </div>
          {puoInviare ? (
            <button
              type="button"
              disabled={inviando || vuota}
              onClick={invia}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-cream px-5 text-base font-medium text-clay-ink transition-transform active:scale-[0.99] disabled:bg-secondary disabled:text-muted-foreground"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              {inviando ? "Invio…" : "Invia in cucina"}
            </button>
          ) : (
            <p className="t-nota text-center">
              Il tuo ruolo non consente di inviare comande: chiedi a un collega di sala.
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {vuota && (
          <p className="t-nota py-6 text-center">
            La comanda è vuota. Aggiungi almeno un piatto per inviarla.
          </p>
        )}

        {gruppi.map((g) => (
          <section key={g.chiave}>
            <h3 className="t-etichetta mb-1.5">{g.titolo}</h3>
            <ul className="space-y-1.5">
              {g.righe.map((r) => (
                <li key={r.id}>
                  <RigaRiepilogo
                    riga={r}
                    modificabile={comanda.modificabile}
                    onQuantita={(q) => cambiaQuantita(r, q)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!vuota && (
          <section>
            <h3 className="t-etichetta mb-1.5">Nota per la cucina</h3>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Vale per tutta la comanda: «servire i primi insieme»"
              className="w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm placeholder:text-muted-foreground"
            />
          </section>
        )}
      </div>
    </Foglio>
  );
}

function RigaRiepilogo({
  riga,
  modificabile,
  onQuantita,
}: {
  riga: RigaComandaView;
  modificabile: boolean;
  onQuantita: (q: number) => void;
}) {
  const annullata = riga.status === "ANNULLATA";
  const variazioni = riassuntoModifiche(riga.modifiche);
  const conAllergia = riga.allergeni.length > 0 || !!riga.notaAllergia;

  return (
    <div
      className={cn(
        "rounded-md border p-2.5",
        conAllergia ? "border-destructive/50 bg-destructive/10" : "border-border",
        annullata && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", annullata && "line-through")}>
            <span className="tabular-nums">{riga.quantita} ×</span> {riga.nome}
          </p>
          {variazioni && <p className="t-nota mt-0.5">{variazioni}</p>}
          {riga.note && <p className="t-nota mt-0.5 italic">«{riga.note}»</p>}
        </div>
        <span className="t-dato shrink-0">{euro(riga.totalCents)}</span>
      </div>

      {conAllergia && (
        /* §13: l'allergia **non** è un badge piccolo. Qui è una riga piena,
           con icona, e sopravvive fino alla cucina. */
        <p className="mt-2 flex items-start gap-2 rounded-md bg-destructive/15 px-2 py-1.5 text-sm font-medium text-destructive-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Allergia
            {riga.allergeni.length > 0 && `: ${riga.allergeni.map(nomeAllergene).join(", ")}`}
            {riga.notaAllergia && <span className="block font-normal">{riga.notaAllergia}</span>}
          </span>
        </p>
      )}

      {modificabile && !annullata && (
        <div className="mt-2 flex items-center justify-between">
          <Quantita valore={riga.quantita} onCambia={onQuantita} />
          <button
            type="button"
            onClick={() => onQuantita(0)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors active:bg-current/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Togli
          </button>
        </div>
      )}
    </div>
  );
}

type Gruppo = { chiave: string; titolo: string; righe: RigaComandaView[] };

/**
 * Le righe raggruppate per commensale, «Tutto il tavolo» per primo.
 *
 * L'ordine dei commensali è quello dei coperti (Ospite 1, 2, 3…), non quello
 * in cui i piatti sono stati battuti: è l'ordine in cui sono seduti, ed è come
 * si guarda un tavolo servendolo.
 */
function raggruppa(righe: RigaComandaView[], ospiti: OspiteView[]): Gruppo[] {
  const perOspite = new Map<string, RigaComandaView[]>();
  const tavolo: RigaComandaView[] = [];

  for (const r of righe) {
    if (!r.ospiteId) tavolo.push(r);
    else perOspite.set(r.ospiteId, [...(perOspite.get(r.ospiteId) ?? []), r]);
  }

  const out: Gruppo[] = [];
  if (tavolo.length > 0) out.push({ chiave: "tavolo", titolo: "Tutto il tavolo", righe: tavolo });
  for (const o of ospiti) {
    const sue = perOspite.get(o.id);
    if (sue?.length) out.push({ chiave: o.id, titolo: o.label, righe: sue });
  }
  return out;
}

function ora(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
