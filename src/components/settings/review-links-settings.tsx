"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Blocco, BloccoNota } from "@/components/ui/blocco";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";
import { MAX_LINK, NOME_PIATTAFORMA, PIATTAFORME } from "@/lib/recensioni";
import type { ReviewLinkView } from "@/server/reviews";

type Riga = { id?: string; platform: string; url: string; clic30: number };

/**
 * Dove mandare chi è uscito contento.
 *
 * Non è una pagina di impostazioni fra le altre: è l'ultimo pezzo della catena
 * visita → sondaggio → recensione, cioè il modo in cui un cliente soddisfatto
 * diventa il prossimo cliente. Chi risponde 9 o 10 vede questi bottoni; chi
 * risponde meno non li vede mai, ed è tutto il senso del meccanismo.
 *
 * Accanto a ogni collegamento c'è quante persone ci sono passate negli ultimi
 * trenta giorni. È l'unica cosa che possiamo misurare davvero — se poi la
 * recensione sia stata scritta lo sa solo la piattaforma — e dirlo così evita
 * di far passare un clic per una stella.
 */
export function ReviewLinksSettings({
  initial,
  canManage,
}: {
  initial: ReviewLinkView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [righe, setRighe] = useState<Riga[]>(
    initial.map((l) => ({ id: l.id, platform: l.platform, url: l.url, clic30: l.clic30 })),
  );
  const [salvando, setSalvando] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aggiorna(i: number, campo: "platform" | "url", valore: string) {
    setRighe(righe.map((r, n) => (n === i ? { ...r, [campo]: valore } : r)));
    setSalvato(false);
  }

  async function salva() {
    setSalvando(true);
    setError(null);
    const res = await fetch("/api/venue/review-links", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        links: righe
          .filter((r) => r.url.trim())
          .map((r) => ({ ...(r.id ? { id: r.id } : {}), platform: r.platform, url: r.url.trim() })),
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare i collegamenti."));
      return;
    }
    const aggiornate: ReviewLinkView[] = await res.json();
    setRighe(aggiornate.map((l) => ({ id: l.id, platform: l.platform, url: l.url, clic30: l.clic30 })));
    setSalvato(true);
    router.refresh();
  }

  /*
    Da chiuso: **dove** mandiamo chi è contento. Non «2 collegamenti» — il
    numero non dice niente a chi vuole sapere se Google c'è.
  */
  const attive = righe.filter((r) => r.url.trim());
  const riepilogo =
    attive.length === 0
      ? "nessun collegamento"
      : attive
          .map((r) => NOME_PIATTAFORMA[r.platform as keyof typeof NOME_PIATTAFORMA] ?? r.platform)
          .join(" · ");

  return (
    <Blocco titolo="Recensioni pubbliche" icona={Star} valore={riepilogo}>
      <BloccoNota>
        Dove mandiamo chi risponde 9 o 10 al «com&apos;è andata?». Chi dà un voto più basso non vede mai
        questi collegamenti: quella risposta resta fra te e lui.
      </BloccoNota>
      <div className="space-y-4">
        {righe.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun collegamento: oggi chi è contento riceve solo un grazie. Su Google, il link giusto è
            quello «Scrivi una recensione» che trovi nel tuo profilo attività.
          </p>
        )}

        {righe.map((r, i) => (
          <div key={r.id ?? `nuova-${i}`} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`piatt-${i}`}>Dove</Label>
              <Select
                value={r.platform}
                onValueChange={(v) => aggiorna(i, "platform", v)}
                disabled={!canManage}
              >
                <SelectTrigger id={`piatt-${i}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIATTAFORME.map((p) => (
                    <SelectItem key={p} value={p}>
                      {NOME_PIATTAFORMA[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`url-${i}`}>Indirizzo</Label>
              <Input
                id={`url-${i}`}
                value={r.url}
                inputMode="url"
                disabled={!canManage}
                onChange={(e) => aggiorna(i, "url", e.target.value)}
                placeholder="https://…"
              />
              {r.id && (
                <p className="t-nota">
                  {r.clic30 === 0
                    ? "Nessuno ci è passato negli ultimi 30 giorni"
                    : `${r.clic30} ${r.clic30 === 1 ? "persona ci è passata" : "persone ci sono passate"} negli ultimi 30 giorni`}
                </p>
              )}
            </div>

            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Togli il collegamento a ${NOME_PIATTAFORMA[r.platform as keyof typeof NOME_PIATTAFORMA]}`}
                onClick={() => {
                  setRighe(righe.filter((_, n) => n !== i));
                  setSalvato(false);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {righe.length < MAX_LINK && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRighe([...righe, { platform: "GOOGLE", url: "", clic30: 0 }]);
                  setSalvato(false);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Aggiungi un posto
              </Button>
            )}
            <Button variant="accent" size="sm" onClick={salva} disabled={salvando}>
              {salvando ? "Salvo…" : "Salva"}
            </Button>
            {salvato && <span className="text-sm text-sage-strong">Salvato.</span>}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="t-nota">
          Togliere un collegamento non cancella i passaggi che ha raccolto: restano nei numeri di quel
          periodo. Quattro è il massimo — davanti a sei bottoni una persona contenta non sceglie, chiude.
        </p>
      </div>
    </Blocco>
  );
}
