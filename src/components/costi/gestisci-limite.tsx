"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { euro } from "@/lib/euro";
import { invii } from "@/lib/dem-piani";
import { cn } from "@/lib/utils";

/**
 * Autorizzare un superamento, per questo ciclo e basta.
 *
 * ## Perché scalini e non solo un campo libero
 *
 * Le cifre che si danno davvero sono poche e ricorrenti, e un campo vuoto
 * costringe a decidere un numero preciso quando la decisione vera è «quanto
 * gli servirà per finire questa campagna». I preimpostati rendono l'operazione
 * di un clic; il campo personalizzato resta per il caso che non ci rientra.
 *
 * ## La nota è obbligatoria
 *
 * Perché è l'unica parte che fra tre mesi spiega la decisione. «+20 €» senza
 * motivo, letto a novembre, è un budget che non si sa se rimettere a posto o
 * lasciare com'è — e nel dubbio resta com'è, che è come i tetti smettono di
 * proteggere.
 */

const SCALINI_BUDGET = [1000, 2500, 5000];
const SCALINI_EMAIL = [10_000, 50_000, 100_000];

export function GestisciLimite({
  venueId,
  budgetBaseCents,
  overrideBudgetCents,
  budgetCents,
  emailLimite,
}: {
  venueId: string;
  budgetBaseCents: number | null;
  overrideBudgetCents: number;
  budgetCents: number | null;
  emailLimite: number;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [tipo, setTipo] = useState<"BUDGET" | "EMAILS">("BUDGET");
  const [delta, setDelta] = useState<number | null>(null);
  const [personalizzato, setPersonalizzato] = useState("");
  const [nota, setNota] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scalini = tipo === "BUDGET" ? SCALINI_BUDGET : SCALINI_EMAIL;
  const valore = delta ?? (personalizzato ? Number(personalizzato) * (tipo === "BUDGET" ? 100 : 1) : 0);
  const puoSalvare = valore > 0 && nota.trim().length >= 3 && !inCorso;

  async function salva() {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch(`/api/admin/costi/${venueId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: tipo, delta: Math.round(valore), note: nota.trim() }),
      });
      if (!risposta.ok) {
        const corpo = await risposta.json().catch(() => ({}));
        setErrore(corpo?.message ?? "Non è stato possibile salvare l'autorizzazione.");
        return;
      }
      setAperto(false);
      setDelta(null);
      setPersonalizzato("");
      setNota("");
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Gestisci limite</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Autorizza un superamento</DialogTitle>
          <DialogDescription>
            Vale <strong>solo per il ciclo corrente</strong>. Al rinnovo il cliente torna ai limiti del suo
            piano, senza che nessuno debba togliere niente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="surface grid grid-cols-3 gap-3 p-3 text-sm">
            <Riquadro etichetta="Budget di piano" valore={euro(budgetBaseCents)} />
            <Riquadro
              etichetta="Già autorizzato"
              valore={overrideBudgetCents > 0 ? `+${euro(overrideBudgetCents)}` : "—"}
            />
            <Riquadro etichetta="Budget effettivo" valore={euro(budgetCents)} />
          </div>

          <div className="flex gap-2">
            <Scelta attiva={tipo === "BUDGET"} onClick={() => { setTipo("BUDGET"); setDelta(null); }}>
              Aumenta budget
            </Scelta>
            <Scelta attiva={tipo === "EMAILS"} onClick={() => { setTipo("EMAILS"); setDelta(null); }}>
              Aumenta invii
            </Scelta>
          </div>

          {tipo === "EMAILS" && (
            <p className="t-nota">Limite attuale: {invii(emailLimite)} invii nel ciclo.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {scalini.map((s) => (
              <Scelta
                key={s}
                attiva={delta === s}
                onClick={() => { setDelta(s); setPersonalizzato(""); }}
              >
                {tipo === "BUDGET" ? `+${euro(s)}` : `+${invii(s)}`}
              </Scelta>
            ))}
            <Input
              value={personalizzato}
              onChange={(e) => { setPersonalizzato(e.target.value.replace(/[^0-9.]/g, "")); setDelta(null); }}
              placeholder={tipo === "BUDGET" ? "importo in €" : "numero di invii"}
              className="h-9 w-40"
              inputMode="decimal"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nota-override">Perché (obbligatorio)</Label>
            <Textarea
              id="nota-override"
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, 300))}
              placeholder="Cliente autorizzato per la campagna evento di settembre"
              rows={2}
            />
          </div>

          {errore && <p className="text-sm text-destructive">{errore}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
            <Button variant="brand" disabled={!puoSalvare} onClick={salva}>
              {inCorso ? "Salvataggio…" : "Autorizza"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Riquadro({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className="mt-0.5 tabular-nums">{valore}</p>
    </div>
  );
}

function Scelta({
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
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        attiva
          ? "border-accent bg-accent/30 text-ink"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
