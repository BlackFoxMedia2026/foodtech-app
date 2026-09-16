"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Frame, Image as ImageIcon, Loader2, Palette, Shapes } from "lucide-react";
import { Blocco } from "@/components/ui/blocco";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { NOMI_CORNICI, NOMI_STILI_MODULI, type DesignQr } from "@/lib/qr-disegno";
import { schedaTipo } from "@/lib/qr-tipi";
import { createQrCode, updateQrCode, type QrCodeSalvato } from "@/lib/qr-codes-api";
import { contenutoBozza, linkBozza, type BozzaQr, type ContestoQr } from "./bozza";
import { QrColorPicker } from "./qr-color-picker";
import { QrContentPanel } from "./qr-content-panel";
import { QrFrameSelector } from "./qr-frame-selector";
import { QrLogoEditor } from "./qr-logo-editor";
import { QrPreview } from "./qr-preview";
import { QrStylePanel } from "./qr-style-panel";
import { useDisegnoQr } from "./use-disegno-qr";

/**
 * L'editor.
 *
 * Tre aree, e l'ordine non è casuale: a sinistra **cosa** apre il codice, al
 * centro **com'è** in questo istante, a destra **come si veste**. Il centro sta
 * in mezzo perché è la cosa che si guarda mentre si tocca tutto il resto: le
 * modifiche arrivano da entrambi i lati e atterrano lì, senza che l'occhio
 * debba spostarsi due volte.
 *
 * Sotto i 1024 pixel le tre colonne non stanno, e schiacciarle darebbe tre
 * strisce troppo strette per ognuna delle tre cose. Lì il codice va in alto —
 * resta visibile mentre si scorre — e il resto diventa quattro linguette.
 */
export function QrEditor({
  bozzaIniziale,
  ctx,
  /** L'identificativo, quando si sta modificando un codice che esiste già. */
  id,
  onSalvato,
  onAnnulla,
}: {
  bozzaIniziale: BozzaQr;
  ctx: ContestoQr;
  id?: string;
  onSalvato: (salvati: QrCodeSalvato[]) => void;
  onAnnulla: () => void;
}) {
  const router = useRouter();
  const [bozza, setBozza] = useState<BozzaQr>(bozzaIniziale);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const treColonne = useMediaQuery("(min-width: 1024px)");
  const [linguetta, setLinguetta] = useState<Linguetta>("contenuto");

  const contenuto = useMemo(() => contenutoBozza(bozza, ctx), [bozza, ctx]);
  const { disegno, avvisi, salvabile } = useDisegnoQr(contenuto, bozza.design);

  const cambia = (patch: Partial<BozzaQr>) => setBozza((b) => ({ ...b, ...patch }));
  const cambiaDesign = (patch: Partial<DesignQr>) =>
    setBozza((b) => ({ ...b, design: { ...b.design, ...patch } }));

  /* Il nome vuoto e i tavoli mancanti non sono difetti del codice: sono campi
     non riempiti, e vanno detti dove si riempiono, non sotto l'anteprima. */
  const mancanze: string[] = [];
  if (!bozza.nome.trim()) mancanze.push("Dai un nome al QR.");
  if (bozza.kind === "PAY_TABLE") {
    if (bozza.tableIds.length === 0) mancanze.push("Scegli almeno un tavolo.");
    /* Un tavolo spento non ha un segreto, quindi il suo codice non avrebbe una
       destinazione: il server lo rifiuterebbe comunque, ma dirlo qui evita di
       far premere Salva per ricevere un no. */
    const spenti = ctx.tavoli.filter((t) => bozza.tableIds.includes(t.id) && !t.pronto);
    /* Il perché sta già, per esteso, nel riquadro accanto ai tavoli: qui basta
       dire che è quello a tenere spento «Salva QR». */
    if (spenti.length > 0) mancanze.push("Accendi il pagamento sui tavoli scelti prima di salvare.");
  }

  const pronto = salvabile && mancanze.length === 0 && !salvataggio;

  async function salva() {
    setSalvataggio(true);
    setErrore(null);
    try {
      const corpo = {
        name: bozza.nome.trim(),
        kind: bozza.kind,
        tableIds: bozza.kind === "PAY_TABLE" ? bozza.tableIds : undefined,
        destinationUrl: bozza.destinationUrl || undefined,
        design: bozza.design,
        payload: bozza.payload,
      };
      const salvati = id ? [await updateQrCode(id, corpo)] : await createQrCode(corpo);
      router.refresh();
      onSalvato(salvati);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSalvataggio(false);
    }
  }

  const anteprima = (
    <QrPreview disegno={disegno} avvisi={avvisi} link={linkBozza(bozza)} className="lg:sticky lg:top-4" />
  );

  const contenutoPannello = (
    <QrContentPanel bozza={bozza} ctx={ctx} unicoTavolo={!!id} onCambia={cambia} />
  );

  const design = (
    <div className="space-y-2">
      <Blocco titolo="Colore" icona={Palette} valore={<Pastiglie design={bozza.design} />} aperto>
        <QrColorPicker design={bozza.design} onCambia={cambiaDesign} />
      </Blocco>
      <Blocco titolo="Stile" icona={Shapes} valore={NOMI_STILI_MODULI[bozza.design.stileModuli]}>
        <QrStylePanel design={bozza.design} onCambia={cambiaDesign} />
      </Blocco>
      <Blocco
        titolo="Logo"
        icona={ImageIcon}
        valore={bozza.design.logoUrl ? "impostato" : "nessuno"}
      >
        <QrLogoEditor
          design={bozza.design}
          logoLocale={ctx.logoLocale}
          nomeLocale={ctx.nomeLocale}
          onCambia={cambiaDesign}
        />
      </Blocco>
      <Blocco titolo="Cornice" icona={Frame} valore={NOMI_CORNICI[bozza.design.cornice]}>
        <QrFrameSelector design={bozza.design} kind={bozza.kind} onCambia={cambiaDesign} />
      </Blocco>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/*
        Salva **in alto**, anche sul telefono, e non in fondo.

        In fondo, su telefono, c'è già la barra di navigazione del prodotto:
        è fissa, e qualunque seconda barra finisce o sotto di lei o a
        galleggiare in mezzo ai campi del modulo — provato, ed era esattamente
        una pillola appoggiata sopra la casella del nome della rete. Una
        testata che resta attaccata in cima dà la stessa cosa che serviva — il
        comando sempre raggiungibile mentre si scorre — senza contendere il
        posto a una barra che c'era prima.
      */}
      <header
        className={cn(
          "flex flex-wrap items-end justify-between gap-3",
          "sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur",
          "sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none",
        )}
      >
        <div className="min-w-0 flex-1">
          {/* Su telefono la testata resta attaccata in cima: ogni riga che
              occupa è una riga in meno del modulo, e il tipo lo dicono già i
              campi sotto. Torna dal `sm` in su, dove lo spazio c'è. */}
          <p className="t-etichetta hidden sm:block">{schedaTipo(bozza.kind).titolo}</p>
          {/* Due elementi e non uno con una variante: `t-titolo-pagina` è una
              classe composta, e `sm:` sopra una classe composta non genera
              niente. Solo uno dei due è mai visibile. */}
          <h2 className="truncate text-base font-medium sm:hidden">
            {bozza.nome.trim() || "Nuovo QR code"}
          </h2>
          <h2 className="hidden truncate t-titolo-pagina sm:block">
            {bozza.nome.trim() || "Nuovo QR code"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="sm:h-9 sm:px-4 sm:text-sm" onClick={onAnnulla} disabled={salvataggio}>
            Annulla
          </Button>
          <Button variant="accent" size="sm" className="sm:h-9 sm:px-4 sm:text-sm" onClick={salva} disabled={!pronto}>
            {salvataggio && <Loader2 className="h-4 w-4 animate-spin" />}
            {salvataggio ? "Salvo..." : "Salva QR"}
          </Button>
        </div>
      </header>

      {treColonne ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,28fr)_minmax(0,36fr)_minmax(0,36fr)]">
          <section aria-label="Contenuto">{contenutoPannello}</section>
          <section aria-label="Anteprima">{anteprima}</section>
          <section aria-label="Personalizzazione">{design}</section>
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2">
          <section aria-label="Anteprima" className="md:sticky md:top-4">
            {anteprima}
          </section>
          <section>
            <Linguette attiva={linguetta} onCambia={setLinguetta} />
            <div className="mt-4">
              {linguetta === "contenuto" && contenutoPannello}
              {linguetta === "design" && (
                <div className="space-y-5">
                  <QrColorPicker design={bozza.design} onCambia={cambiaDesign} />
                  <QrStylePanel design={bozza.design} onCambia={cambiaDesign} />
                </div>
              )}
              {linguetta === "logo" && (
                <QrLogoEditor
                  design={bozza.design}
                  logoLocale={ctx.logoLocale}
                  nomeLocale={ctx.nomeLocale}
                  onCambia={cambiaDesign}
                />
              )}
              {linguetta === "cornice" && (
                <QrFrameSelector design={bozza.design} kind={bozza.kind} onCambia={cambiaDesign} />
              )}
            </div>
          </section>
        </div>
      )}

      {(mancanze.length > 0 || errore) && (
        <div className="space-y-1">
          {mancanze.map((m) => (
            <p key={m} className="t-nota">
              {m}
            </p>
          ))}
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
        </div>
      )}

    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Linguetta = "contenuto" | "design" | "logo" | "cornice";

const LINGUETTE: { id: Linguetta; nome: string }[] = [
  { id: "contenuto", nome: "Contenuto" },
  { id: "design", nome: "Design" },
  { id: "logo", nome: "Logo" },
  { id: "cornice", nome: "Cornice" },
];

function Linguette({ attiva, onCambia }: { attiva: Linguetta; onCambia: (v: Linguetta) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-md bg-secondary/40 p-1">
      {LINGUETTE.map((l) => (
        <button
          key={l.id}
          role="tab"
          type="button"
          aria-selected={attiva === l.id}
          onClick={() => onCambia(l.id)}
          className={cn(
            "min-h-[36px] flex-1 whitespace-nowrap rounded-[7px] px-3 text-sm transition-colors",
            attiva === l.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.nome}
        </button>
      ))}
    </div>
  );
}

/** I due colori, letti dal blocco chiuso senza doverlo aprire. */
function Pastiglie({ design }: { design: DesignQr }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className="h-4 w-4 rounded border border-border" style={{ background: design.coloreQr }} />
      <span className="h-4 w-4 rounded border border-border" style={{ background: design.coloreSfondo }} />
    </span>
  );
}
