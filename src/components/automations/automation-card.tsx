"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import type { AutomationView } from "@/server/automations/engine";

/**
 * Un'automazione, con il numero davanti.
 *
 * L'ordine degli elementi non è casuale: **prima quante persone toccherebbe
 * oggi**, con qualche nome e il motivo, e solo dopo l'interruttore. Chi accende
 * un'automazione sta delegando a una macchina il diritto di scrivere ai suoi
 * clienti: il numero va letto prima, non scoperto dopo.
 *
 * Il motivo accanto a ogni nome («ultima visita 63 giorni fa») serve a rendere
 * il numero controllabile: se il criterio è sbagliato si vede lì, su tre
 * persone, non su trecento email partite.
 */
export function AutomationCard({ automation, canEdit }: { automation: AutomationView; canEdit: boolean }) {
  const router = useRouter();
  const [giorni, setGiorni] = useState(String(automation.giorni));
  const [subject, setSubject] = useState(automation.subject);
  const [intro, setIntro] = useState(automation.intro);
  const [inCorso, setInCorso] = useState<null | "switch" | "salva" | "prova">(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [apriTesto, setApriTesto] = useState(false);

  const modificato =
    giorni !== String(automation.giorni) || subject !== automation.subject || intro !== automation.intro;

  async function salva(corpo: Record<string, unknown>, quale: "switch" | "salva") {
    setInCorso(quale);
    setErrore(null);
    setEsito(null);
    const res = await fetch(`/api/automations/${automation.key}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    router.refresh();
  }

  async function prova() {
    setInCorso("prova");
    setErrore(null);
    setEsito(null);
    const res = await fetch(`/api/automations/${automation.key}/test`, { method: "POST" });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "La prova non è partita."));
      return;
    }
    const { to } = await res.json();
    setEsito(`Prova inviata a ${to}.`);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{automation.name}</CardTitle>
          <CardDescription>{automation.promise}</CardDescription>
        </div>
        {/* L'interruttore da solo è alto venti pixel: su un telefono si
            sbaglia, e qui sbagliare significa far partire email a clienti
            veri. L'etichetta è parte del bersaglio, e il bersaglio è alto 44. */}
        <label
          htmlFor={`interruttore-${automation.key}`}
          className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 px-1"
        >
          <span className="text-xs text-muted-foreground">{automation.active ? "Accesa" : "Spenta"}</span>
          <Switch
            id={`interruttore-${automation.key}`}
            checked={automation.active}
            disabled={!canEdit || inCorso !== null}
            aria-label={`${automation.active ? "Spegni" : "Accendi"} ${automation.name}`}
            onCheckedChange={(v) => salva({ active: v }, "switch")}
          />
        </label>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{automation.why}</p>

        <div className="rounded-md border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            {automation.toccherebbeOggi === 0
              ? "Oggi non toccherebbe nessuno"
              : `Oggi scriverebbe a ${automation.toccherebbeOggi} ${
                  automation.toccherebbeOggi === 1 ? "persona" : "persone"
                }`}
          </p>

          {automation.esempi.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {automation.esempi.map((e, i) => (
                <li key={i}>
                  {e.nome} — {e.reason}
                </li>
              ))}
              {automation.toccherebbeOggi > automation.esempi.length && (
                <li>e altre {automation.toccherebbeOggi - automation.esempi.length}</li>
              )}
            </ul>
          )}

          {(automation.scartati.silenzio > 0 || automation.scartati.giaRicevuto > 0) && (
            <p className="mt-2 text-xs text-tertiary-foreground">
              Esclusi:{" "}
              {[
                automation.scartati.giaRicevuto > 0 && `${automation.scartati.giaRicevuto} l'hanno già ricevuta`,
                automation.scartati.silenzio > 0 &&
                  `${automation.scartati.silenzio} hanno ricevuto un nostro messaggio da poco`,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          )}

          {automation.toccherebbeOggi === 0 && automation.active && (
            <p className="mt-2 text-xs text-tertiary-foreground">
              È normale: l&apos;automazione guarda solo chi ha appena superato la soglia, non tutto l&apos;archivio.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`giorni-${automation.key}`}>{automation.knob.label}</Label>
          <Input
            id={`giorni-${automation.key}`}
            type="number"
            inputMode="numeric"
            min={automation.knob.min}
            max={automation.knob.max}
            value={giorni}
            disabled={!canEdit}
            onChange={(e) => setGiorni(e.target.value)}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">{automation.knob.hint}</p>
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setApriTesto((v) => !v)}>
            {apriTesto ? "Nascondi il testo" : "Vedi e modifica il testo"}
          </Button>
        </div>

        {apriTesto && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor={`subject-${automation.key}`}>Oggetto</Label>
              <Input
                id={`subject-${automation.key}`}
                value={subject}
                disabled={!canEdit}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`intro-${automation.key}`}>Messaggio</Label>
              <Textarea
                id={`intro-${automation.key}`}
                rows={4}
                value={intro}
                disabled={!canEdit}
                onChange={(e) => setIntro(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Il nome dell&apos;ospite, il saluto, il pulsante per prenotare e la firma del locale li mettiamo noi.
                Qui va quello che vuoi dire.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="accent"
              size="sm"
              disabled={!modificato || inCorso !== null}
              onClick={() => salva({ giorni: Number(giorni), subject, intro }, "salva")}
            >
              {inCorso === "salva" ? "Un istante…" : "Salva"}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" disabled={inCorso !== null} onClick={prova}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {inCorso === "prova" ? "Un istante…" : "Mandami una prova"}
            </Button>
          )}
        </div>

        <p className="text-xs text-tertiary-foreground">
          {automation.inviatiUltimi30 > 0
            ? `${automation.inviatiUltimi30} ${
                automation.inviatiUltimi30 === 1 ? "messaggio" : "messaggi"
              } negli ultimi 30 giorni.`
            : "Nessun messaggio negli ultimi 30 giorni."}
          {automation.ultimaEsecuzione &&
            // Data e ora formattate a parte: chiedendole insieme, l'italiano
            // di `Intl` produce «7 settembre alle ore 14:38», che è il modo in
            // cui scrive un ufficio, non una persona.
            ` Ultimo controllo il ${new Intl.DateTimeFormat("it-IT", {
              day: "numeric",
              month: "long",
            }).format(automation.ultimaEsecuzione.quando)} alle ${new Intl.DateTimeFormat("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(automation.ultimaEsecuzione.quando)}.`}
        </p>

        {esito && <p className="text-sm text-sage">{esito}</p>}
        {errore && <p className="text-sm text-destructive">{errore}</p>}
      </CardContent>
    </Card>
  );
}
