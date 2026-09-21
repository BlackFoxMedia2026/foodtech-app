"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Cosa dice Amazon, cosa abbiamo attribuito noi, e la differenza.
 *
 * I tre numeri stanno affiancati e **non** si sommano: è il punto di tutta la
 * fase 4. Il terzo — il non attribuito — non è un errore da nascondere: sono
 * costi che l'account sostiene e che nessun cliente ha generato da solo, più
 * l'imprecisione del listino. Attribuirlo pro quota darebbe a ogni ristorante
 * un numero preciso e falso.
 */

export type DatiRiconciliazione = {
  yearMonth: string;
  dichiarato: number | null;
  valutaDichiarata: string | null;
  attribuito: number;
  valutaAttribuita: string;
  nonAttribuito: number | null;
  scostamentoPct: number | null;
  inviiLedger: number;
  inviiSes: number;
  eventiSani: boolean;
  listinoDaRivedere: boolean;
  fonte: string;
  stato: string;
  lettoIl: string | Date | null;
};

const FONTE: Record<string, string> = {
  COST_EXPLORER: "letto da Cost Explorer",
  MANUALE: "inserito a mano dalla fattura",
  NON_DISPONIBILE: "non ancora disponibile",
};

export function RiconciliazioneAws({ dati }: { dati: DatiRiconciliazione }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [importo, setImporto] = useState("");
  const [nota, setNota] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function salva() {
    setInCorso(true);
    try {
      await fetch("/api/admin/costi/riconciliazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth: dati.yearMonth,
          importo: Number(importo),
          valuta: dati.valutaAttribuita,
          nota: nota.trim() || undefined,
        }),
      });
      setAperto(false);
      setImporto("");
      setNota("");
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  const soldi = (n: number | null, valuta: string | null) =>
    n === null ? "non disponibile" : `${n.toFixed(2)} ${valuta ?? ""}`.trim();

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="t-etichetta">Riconciliazione con la fattura</p>
          <p className="t-nota mt-1">
            Ciclo {dati.yearMonth} · {FONTE[dati.fonte] ?? dati.fonte}
            {dati.lettoIl && ` · ${new Date(dati.lettoIl).toLocaleDateString("it-IT")}`}
          </p>
        </div>
        <Dialog open={aperto} onOpenChange={setAperto}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">Registra fattura</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Costo reale del ciclo {dati.yearMonth}</DialogTitle>
              <DialogDescription>
                L&apos;importo della fattura Amazon per l&apos;invio email, in {dati.valutaAttribuita}. Serve a
                capire di quanto sbaglia il nostro listino: non viene attribuito ai clienti.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="importo-fattura">Importo</Label>
                <Input
                  id="importo-fattura"
                  value={importo}
                  onChange={(e) => setImporto(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="18.43"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nota-fattura">Nota</Label>
                <Input
                  id="nota-fattura"
                  value={nota}
                  onChange={(e) => setNota(e.target.value.slice(0, 300))}
                  placeholder="Fattura AWS di settembre, riga SES"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
                <Button variant="brand" disabled={!importo || inCorso} onClick={salva}>
                  {inCorso ? "Salvo…" : "Salva"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Dato
          etichetta="Dichiarato da Amazon"
          valore={soldi(dati.dichiarato, dati.valutaDichiarata)}
          nota="fattura dell'account, per servizio"
        />
        <Dato
          etichetta="Attribuito ai clienti"
          valore={soldi(dati.attribuito, dati.valutaAttribuita)}
          nota="somma del nostro ledger"
        />
        <Dato
          etichetta="Non attribuito"
          valore={soldi(dati.nonAttribuito, dati.valutaDichiarata ?? dati.valutaAttribuita)}
          nota="costi dell'account che nessun cliente ha generato"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dati.stato === "SOLO_STIMA" ? (
          <Badge tone="neutral">Solo stima</Badge>
        ) : (
          <Badge tone={dati.listinoDaRivedere ? "warning" : "success-soft"}>
            {dati.scostamentoPct !== null
              ? `Scostamento ${dati.scostamentoPct > 0 ? "+" : ""}${dati.scostamentoPct}%`
              : "Riconciliato"}
          </Badge>
        )}
        {dati.listinoDaRivedere && <span className="t-nota">Il listino va rivisto: sbaglia oltre il 5%.</span>}
        {!dati.eventiSani && (
          <Badge tone="warning">
            Eventi mancanti: {dati.inviiSes} confermati su {dati.inviiLedger} inviati
          </Badge>
        )}
      </div>

      {dati.stato === "SOLO_STIMA" && (
        <p className="t-nota">
          Amazon non ci ha ancora detto quanto è costato questo ciclo. Finché non lo dice, i costi per
          cliente restano stime del nostro listino — e la pagina lo scrive invece di far finta.
        </p>
      )}
    </section>
  );
}

function Dato({ etichetta, valore, nota }: { etichetta: string; valore: string; nota: string }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className="text-display mt-0.5 text-xl tabular-nums">{valore}</p>
      <p className="t-nota mt-0.5">{nota}</p>
    </div>
  );
}
