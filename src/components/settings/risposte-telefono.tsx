"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import { useAvvisi } from "@/components/ui/avvisi";
import type { RispostaPronta } from "@/server/voice/conoscenza";

/**
 * Le risposte del telefono, scritte una volta.
 *
 * ## Le due cose che questa schermata chiede, e perché la seconda conta
 *
 * **La risposta** e **le parole con cui la domanda arriva.** La seconda è
 * quella che chi scrive è tentato di saltare, ed è quella che fa la
 * differenza: chi cerca al telefono scrive «cane», non «animali domestici».
 * Senza quelle parole la risposta c'è e non si trova — che è peggio di non
 * averla scritta, perché si è pagato il lavoro di scriverla.
 *
 * Per questo il campo non è facoltativo nell'aspetto: ha il suo posto, il suo
 * esempio, e la riga sotto dice a cosa serve.
 *
 * ## Spegnere, non cancellare
 *
 * «Il dehors è aperto» vale da aprile a ottobre. Cancellarla a novembre vuol
 * dire riscriverla in primavera; spenta resta lì, con le sue parole, e si
 * riaccende con un tocco.
 */

const CATEGORIE: { valore: string; nome: string; esempio: string }[] = [
  {
    valore: "ORARI",
    nome: "Orari",
    esempio: "aperti a Pasqua, chiusi il lunedì",
  },
  { valore: "LOCALE", nome: "Il locale", esempio: "dove siamo, il dehors" },
  { valore: "MENU", nome: "Carta", esempio: "il menu fisso, i vini" },
  { valore: "ALLERGIE", nome: "Allergie", esempio: "senza glutine, vegano" },
  { valore: "PARCHEGGIO", nome: "Parcheggio", esempio: "dove si parcheggia" },
  { valore: "ANIMALI", nome: "Animali", esempio: "si può portare il cane" },
  { valore: "BAMBINI", nome: "Bambini", esempio: "seggioloni, menu bimbi" },
  { valore: "ACCESSIBILITA", nome: "Accessibilità", esempio: "scale, bagno" },
  { valore: "GRUPPI", nome: "Gruppi", esempio: "tavolate, menu di gruppo" },
  { valore: "EVENTI", nome: "Eventi", esempio: "privatizzare la sala" },
  { valore: "PAGAMENTI", nome: "Pagamenti", esempio: "carte, buoni pasto" },
  { valore: "ALTRO", nome: "Altro", esempio: "" },
];

const NOME_CATEGORIA = Object.fromEntries(
  CATEGORIE.map((c) => [c.valore, c.nome]),
);

export function RisposteTelefono({
  risposte,
  canManage,
}: {
  risposte: RispostaPronta[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [aperto, setAperto] = useState(false);
  const [categoria, setCategoria] = useState("ORARI");
  const [argomenti, setArgomenti] = useState("");
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    const res = await fetch("/api/telefono/conoscenza", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        categoria,
        argomenti: argomenti
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        risposta: testo,
      }),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    setArgomenti("");
    setTesto("");
    setAperto(false);
    mostra("Risposta salvata.");
    router.refresh();
  }

  async function cambia(id: string, dati: Record<string, unknown>) {
    const res = await fetch(`/api/telefono/conoscenza/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dati),
    });
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    router.refresh();
  }

  async function elimina(id: string) {
    const res = await fetch(`/api/telefono/conoscenza/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a cancellare."));
      return;
    }
    mostra("Risposta cancellata.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {risposte.length === 0 ? (
        <p className="riquadro p-3 t-nota">
          Nessuna risposta scritta. Quelle che si scrivono qui si cercano dalla
          pagina Telefono mentre si parla — «cane», «parcheggio», «glutine» — e
          le legge anche l&apos;assistente quando gli si chiede cosa rispondere.
        </p>
      ) : (
        <ul className="space-y-2">
          {risposte.map((r) => (
            <li key={r.id} className="riquadro p-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={r.attivo ? "neutral" : "warning"}>
                      {NOME_CATEGORIA[r.categoria] ?? r.categoria}
                    </Badge>
                    {!r.attivo && <span className="t-nota">spenta</span>}
                  </p>
                  <p className="mt-1 text-sm">{r.risposta}</p>
                  {r.argomenti.length > 0 ? (
                    <p className="mt-1 t-nota">
                      si trova con: {r.argomenti.join(", ")}
                    </p>
                  ) : (
                    /* Senza parole è quasi introvabile, e va detto dove lo si
                       può correggere: una risposta scritta e mai trovata è
                       lavoro buttato. */
                    <p className="mt-1 t-nota text-destructive-soft">
                      Nessuna parola per trovarla: si cerca solo dal testo.
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cambia(r.id, { attivo: !r.attivo })}
                    >
                      {r.attivo ? "Spegni" : "Riaccendi"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Cancella questa risposta"
                      onClick={() => elimina(r.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage &&
        (aperto ? (
          <form onSubmit={salva} className="riquadro space-y-3 p-3">
            <div>
              <Label htmlFor="categoria">Di cosa parla</Label>
              <select
                id="categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {CATEGORIE.map((c) => (
                  <option key={c.valore} value={c.valore}>
                    {c.nome}
                    {c.esempio ? ` — ${c.esempio}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="risposta">La risposta, come si dice a voce</Label>
              <Textarea
                id="risposta"
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                rows={3}
                required
                placeholder="I cani sono benvenuti nel dehors, in sala solo i cani guida."
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="argomenti">Le parole con cui la si cerca</Label>
              <Input
                id="argomenti"
                value={argomenti}
                onChange={(e) => setArgomenti(e.target.value)}
                placeholder="cane, cani, animali"
                className="mt-1"
              />
              <p className="mt-1 t-nota">
                Separate da una virgola. È il campo che fa trovare la risposta
                in due secondi: chi cerca al telefono scrive «cane», non
                «animali domestici».
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="accent"
                size="sm"
                disabled={inCorso || testo.trim().length < 2}
              >
                {inCorso ? "Salvo…" : "Salva"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAperto(false)}
              >
                Annulla
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAperto(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Aggiungi una risposta
          </Button>
        ))}
    </div>
  );
}
