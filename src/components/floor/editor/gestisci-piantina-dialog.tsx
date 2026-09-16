"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileImage, Hammer, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ANALYSIS_STEPS, type FloorPlanAnalysis } from "@/lib/floorplan-analysis";
import { metersToPx, type RoomElement } from "@/lib/room-layout";
import { generateLShape, generateRectangle } from "./perimetro";

type Passo = "scelta" | "carica" | "analisi" | "esito" | "perimetro";

const TIPI_AMMESSI = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_BYTE = 10 * 1024 * 1024;

/**
 * Da una planimetria a una piantina modificabile.
 *
 * Quattro passi, e il terzo è quello che conta: mentre il riconoscimento
 * lavora si vedono le fasi passare — pareti, ambienti, aperture, disegno —
 * invece di una rotellina. Non è decorazione: un'analisi che può durare
 * quindici secondi e non dice cosa sta facendo viene interrotta, e questa è
 * l'unica operazione della schermata che non si può rifare a mano in un
 * minuto.
 *
 * Il risultato **non si salva da solo**. Torna all'editor come modifica da
 * confermare: la piantina della sala la decide chi la sala ce l'ha.
 */
export function GestisciPiantinaDialog({
  aperto,
  onApertoChange,
  roomId,
  nomeSala,
  urlCorrente,
  onPiantinaPronta,
}: {
  aperto: boolean;
  onApertoChange: (aperto: boolean) => void;
  roomId: string;
  nomeSala: string;
  urlCorrente: string | null;
  /** Gli elementi riconosciuti (o generati) entrano nell'editor come
   * modifica non salvata. */
  onPiantinaPronta: (elementi: RoomElement[], larghezza: number, altezza: number) => void;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("scelta");
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<{ analysis: FloorPlanAnalysis; elements: RoomElement[]; width: number; height: number; summary: string } | null>(null);
  const [fase, setFase] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aperto) return;
    const t = setTimeout(() => {
      setPasso("scelta");
      setFile(null);
      setAnteprima(null);
      setErrore(null);
      setEsito(null);
      setFase(0);
    }, 200);
    return () => clearTimeout(t);
  }, [aperto]);

  useEffect(() => {
    return () => {
      if (anteprima) URL.revokeObjectURL(anteprima);
    };
  }, [anteprima]);

  function scegliFile(f: File | null | undefined) {
    if (!f) return;
    if (!TIPI_AMMESSI.split(",").includes(f.type)) {
      setErrore("Formato non supportato. Carica un PNG, JPG, WEBP o PDF.");
      return;
    }
    if (f.size > MAX_BYTE) {
      setErrore("Il file supera i 10 MB.");
      return;
    }
    setErrore(null);
    setFile(f);
    setAnteprima(f.type === "application/pdf" ? null : URL.createObjectURL(f));
  }

  async function caricaEAnalizza() {
    if (!file) return;
    setErrore(null);
    setPasso("analisi");
    setFase(0);

    // Le fasi avanzano da sole fino alla penultima: il riconoscitore oggi
    // risponde una volta sola, e mostrare una barra ferma mentre lavora
    // sarebbe meno onesto di mostrarla avanzare. L'ultima fase si accende
    // solo quando la risposta è arrivata davvero.
    const timer = setInterval(() => setFase((f) => Math.min(f + 1, ANALYSIS_STEPS.length - 2)), 1100);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const resUpload = await fetch(`/api/rooms/${roomId}/floor-plan`, { method: "POST", body: fd });
      if (!resUpload.ok) {
        setErrore(await readApiError(resUpload, "Caricamento della piantina non riuscito. Riprova."));
        setPasso("carica");
        return;
      }

      const resAnalisi = await fetch(`/api/rooms/${roomId}/floor-plan/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resAnalisi.ok) {
        setErrore(await readApiError(resAnalisi, "Analisi della piantina non riuscita. Riprova."));
        setPasso("carica");
        return;
      }

      const dati = await resAnalisi.json();
      setFase(ANALYSIS_STEPS.length - 1);
      setEsito(dati);
      setPasso("esito");
      router.refresh();
    } catch {
      setErrore("Analisi della piantina non riuscita. Controlla la connessione e riprova.");
      setPasso("carica");
    } finally {
      clearInterval(timer);
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={onApertoChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>
            {passo === "analisi" ? "Stiamo analizzando la tua sala" : passo === "esito" ? "Piantina pronta" : "Gestisci piantina"}
          </DialogTitle>
          <DialogDescription>{nomeSala}</DialogDescription>
        </DialogHeader>

        {passo === "scelta" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SchedaScelta
              icona={UploadCloud}
              titolo="Carica una piantina"
              testo="Una planimetria, una foto o un PDF. La analizziamo e la trasformiamo in una piantina modificabile."
              cta={urlCorrente ? "Sostituisci piantina" : "Carica piantina"}
              onClick={() => setPasso("carica")}
            />
            <SchedaScelta
              icona={Hammer}
              titolo="Disegna un perimetro"
              testo="Non hai una planimetria: parti da un rettangolo o da una L delle misure giuste e completa a mano."
              cta="Disegna"
              onClick={() => setPasso("perimetro")}
            />
          </div>
        )}

        {passo === "carica" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                scegliFile(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-sm text-muted-foreground transition-colors hover:border-accent-strong/60 hover:bg-secondary/50"
            >
              {anteprima ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={anteprima} alt="" className="max-h-44 w-full object-contain" />
              ) : file ? (
                <>
                  <FileImage className="h-6 w-6" />
                  <span className="font-medium text-foreground">{file.name}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6" />
                  <span>Trascina qui la piantina o seleziona un file</span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={TIPI_AMMESSI}
              className="hidden"
              onChange={(e) => {
                scegliFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-tertiary-foreground">
              PNG, JPG, WEBP o PDF · massimo 10 MB. Il riconoscimento automatico legge le immagini; da un PDF partiamo dal
              perimetro e lo completi a mano.
            </p>
            {errore && <p className="text-sm text-destructive">{errore}</p>}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setPasso("scelta")}>
                Indietro
              </Button>
              <Button type="button" variant="accent" disabled={!file} onClick={caricaEAnalizza}>
                Analizza piantina
              </Button>
            </div>
          </div>
        )}

        {passo === "analisi" && (
          <div className="flex flex-col gap-4 py-2">
            <ol className="flex flex-col gap-2">
              {ANALYSIS_STEPS.map((s, i) => {
                const fatta = i < fase;
                const corrente = i === fase;
                return (
                  <li
                    key={s.key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      fatta
                        ? "border-sage-deep/40 bg-sage/10 text-foreground"
                        : corrente
                          ? "border-accent-strong/50 bg-accent-strong/10 text-foreground"
                          : "border-border text-tertiary-foreground",
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center">
                      {fatta ? (
                        <Check className="h-4 w-4 text-sage" />
                      ) : corrente ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent-strong" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                      )}
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent-strong transition-[width] duration-500"
                style={{ width: `${((fase + 1) / ANALYSIS_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {passo === "esito" && esito && (
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-3",
                esito.analysis.source === "ai" ? "border-sage-deep/40 bg-sage/10" : "border-accent-strong/40 bg-accent-strong/10",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {esito.analysis.source === "ai" ? (
                  <Check className="h-4 w-4 text-sage" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-accent-strong" />
                )}
              </span>
              <div className="min-w-0 text-sm">
                {esito.analysis.source === "ai" ? (
                  <>
                    <p className="font-medium">Abbiamo riconosciuto la tua sala.</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {esito.summary} · circa {esito.analysis.widthM.toFixed(1).replace(".", ",")} m ×{" "}
                      {esito.analysis.depthM.toFixed(1).replace(".", ",")} m.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Piantina di partenza</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{esito.analysis.note}</p>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-tertiary-foreground">
              La piantina entra nell&apos;editor come modifica da confermare: correggi quello che non torna con gli strumenti
              di sinistra, poi premi «Salva sala».
            </p>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setPasso("carica")}>
                Carica un&apos;altra immagine
              </Button>
              <Button
                type="button"
                variant="accent"
                onClick={() => {
                  onPiantinaPronta(esito.elements, esito.width, esito.height);
                  onApertoChange(false);
                }}
              >
                Usa questa piantina
              </Button>
            </div>
          </div>
        )}

        {passo === "perimetro" && (
          <FormPerimetro
            onIndietro={() => setPasso("scelta")}
            onGenera={(elementi, larghezza, altezza) => {
              onPiantinaPronta(elementi, larghezza, altezza);
              onApertoChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SchedaScelta({
  icona: Icona,
  titolo,
  testo,
  cta,
  onClick,
}: {
  icona: React.ComponentType<{ className?: string }>;
  titolo: string;
  testo: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent-strong hover:bg-accent-strong/10"
    >
      <Icona className="h-5 w-5 text-accent-strong" />
      <span className="text-sm font-semibold">{titolo}</span>
      <span className="text-xs text-muted-foreground">{testo}</span>
      <span className="mt-1 text-xs font-medium text-accent-strong">{cta}</span>
    </button>
  );
}

const MARGINE_MONDO = 80;

function FormPerimetro({
  onIndietro,
  onGenera,
}: {
  onIndietro: () => void;
  onGenera: (elementi: RoomElement[], larghezza: number, altezza: number) => void;
}) {
  const [forma, setForma] = useState<"rettangolo" | "l">("rettangolo");
  const [larghezza, setLarghezza] = useState("12");
  const [profondita, setProfondita] = useState("8");
  const [taglioL, setTaglioL] = useState("4");
  const [taglioP, setTaglioP] = useState("3");

  const w = Number(larghezza) || 0;
  const d = Number(profondita) || 0;
  const valido = w >= 2 && d >= 2 && w <= 200 && d <= 200;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(["rettangolo", "l"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setForma(f)}
            aria-pressed={forma === f}
            className={cn(
              "rounded-lg border px-3 py-3 text-sm transition-colors",
              forma === f ? "border-accent-strong bg-accent-strong/10 text-accent-strong" : "border-border hover:bg-secondary",
            )}
          >
            {f === "rettangolo" ? "Rettangolare" : "A elle"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="t-etichetta">Larghezza (m)</span>
          <Input value={larghezza} onChange={(e) => setLarghezza(e.target.value)} inputMode="decimal" className="h-9" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etichetta">Profondità (m)</span>
          <Input value={profondita} onChange={(e) => setProfondita(e.target.value)} inputMode="decimal" className="h-9" />
        </label>
      </div>

      {forma === "l" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="t-etichetta">Rientro largo (m)</span>
            <Input value={taglioL} onChange={(e) => setTaglioL(e.target.value)} inputMode="decimal" className="h-9" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-etichetta">Rientro profondo (m)</span>
            <Input value={taglioP} onChange={(e) => setTaglioP(e.target.value)} inputMode="decimal" className="h-9" />
          </label>
        </div>
      )}

      <p className="text-xs text-tertiary-foreground">
        Il perimetro sostituisce solo la struttura: i tavoli già posizionati restano dove sono.
      </p>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onIndietro}>
          Indietro
        </Button>
        <Button
          type="button"
          variant="accent"
          disabled={!valido}
          onClick={() => {
            const muri =
              forma === "rettangolo"
                ? generateRectangle(w, d)
                : generateLShape(w, d, Number(taglioL) || 1, Number(taglioP) || 1);
            onGenera(muri, metersToPx(w) + MARGINE_MONDO * 2, metersToPx(d) + MARGINE_MONDO * 2);
          }}
        >
          Crea perimetro
        </Button>
      </div>
    </div>
  );
}
