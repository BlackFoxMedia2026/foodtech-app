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
import { conservaLogo, logoDaConservare } from "@/lib/qr-logo";
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
 * resta visibile mentre si scorre — e il resto diventa due linguette.
 *
 * ## Due regole che tengono in piedi tutto il resto
 *
 * **Un pannello solo per volta.** «Stile» da solo è più alto di uno schermo:
 * con Colore anche aperto, gli angoli finivano a due schermate dal codice che
 * stavano cambiando. Il gruppo tiene quindi un indice unico (`sezione`) e i
 * blocchi lo riferiscono — aprirne uno chiude l'altro, e non è una cortesia
 * grafica: è ciò che tiene le opzioni a distanza d'occhio dal risultato.
 *
 * **Il codice non scorre via.** Resta attaccato in alto mentre la colonna
 * delle opzioni scorre sotto di lui, perché è l'unica cosa che dice se quello
 * che si sta facendo funziona. Il trucco è dove sta l'`sticky`: sulla
 * **sezione** — cioè sulla cella della griglia, alta quanto la riga — e non
 * sul riquadro dentro. Sul riquadro non si muoveva di un pixel, e non per un
 * errore di CSS: un elemento appiccicoso può scorrere solo dentro il suo
 * contenitore, e quel contenitore era alto esattamente quanto lui.
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
  /* Il colore è aperto all'arrivo perché è la prima cosa che si tocca; `null`
     è uno stato legittimo — chiudendo l'ultimo aperto non se ne riapre un
     altro al suo posto. */
  const [sezione, setSezione] = useState<Sezione | null>("colore");

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
      /*
        Il logo si mette al sicuro **adesso**, non quando lo si è scelto.

        Fino a qui vive come `data:` dentro la bozza: si vede nell'anteprima e
        finisce nei file che si scaricano, che si compongono tutti nel
        browser. Ma un `data:` non si salva — `DesignInput` accetta 2000
        caratteri per `logoUrl` perché lì ci va un indirizzo — e un codice
        salvato con un riferimento morto sarebbe un cartoncino che si stampa
        senza marchio. Il perché per esteso sta in `lib/qr-logo.ts`.

        La bozza si aggiorna con l'indirizzo ottenuto: se il salvataggio
        fallisce più avanti, il secondo tentativo non ricarica lo stesso file.
      */
      let design = bozza.design;
      if (logoDaConservare(design.logoUrl)) {
        const url = await conservaLogo(design.logoUrl);
        design = { ...design, logoUrl: url };
        setBozza((b) => ({ ...b, design: { ...b.design, logoUrl: url } }));
      }

      const corpo = {
        name: bozza.nome.trim(),
        kind: bozza.kind,
        tableIds: bozza.kind === "PAY_TABLE" ? bozza.tableIds : undefined,
        destinationUrl: bozza.destinationUrl || undefined,
        design,
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
    <QrPreview
      disegno={disegno}
      avvisi={avvisi}
      link={linkBozza(bozza)}
      trasparente={bozza.design.sfondoTrasparente}
    />
  );

  const contenutoPannello = (
    <QrContentPanel bozza={bozza} ctx={ctx} unicoTavolo={!!id} onCambia={cambia} />
  );

  /**
   * Il gruppo esclusivo, in una riga.
   *
   * Un solo indice condiviso e quattro blocchi che lo riferiscono: aprirne uno
   * ne chiude un altro perché non c'è un secondo posto dove scrivere
   * «aperto», non perché qualcuno vada a chiuderlo. Richiudere quello aperto è
   * previsto — si torna a quattro righe e alla sola anteprima, che è una cosa
   * ragionevole da voler vedere.
   */
  const apertura = (id: Sezione) => ({
    aperto: sezione === id,
    onApertura: (a: boolean) => setSezione((s) => (a ? id : s === id ? null : s)),
  });

  const design = (
    <div className="space-y-2">
      <Blocco titolo="Colore" icona={Palette} valore={<Pastiglie design={bozza.design} />} {...apertura("colore")}>
        <QrColorPicker design={bozza.design} onCambia={cambiaDesign} />
      </Blocco>
      <Blocco
        titolo="Stile"
        icona={Shapes}
        valore={NOMI_STILI_MODULI[bozza.design.stileModuli]}
        {...apertura("stile")}
      >
        <QrStylePanel design={bozza.design} onCambia={cambiaDesign} />
      </Blocco>
      <Blocco
        titolo="Logo"
        icona={ImageIcon}
        valore={bozza.design.logoUrl ? "impostato" : "nessuno"}
        {...apertura("logo")}
      >
        <QrLogoEditor
          design={bozza.design}
          logoLocale={ctx.logoLocale}
          nomeLocale={ctx.nomeLocale}
          onCambia={cambiaDesign}
        />
      </Blocco>
      <Blocco
        titolo="Cornice"
        icona={Frame}
        valore={NOMI_CORNICI[bozza.design.cornice]}
        {...apertura("cornice")}
      >
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
          {/*
            L'`sticky` sta qui, sulla cella, e non sul riquadro dell'anteprima.

            Una cella di griglia è alta quanto la riga — cioè quanto la colonna
            più alta delle tre — anche quando `items-start` fa rimpicciolire la
            scatola dentro. È quello lo spazio in cui il codice può scivolare
            mentre le opzioni scorrono. Sul riquadro, il contenitore era alto
            esattamente quanto il riquadro: niente spazio, niente movimento, e
            un `sticky` che sembrava ignorato.

            `top-4` e non un calcolo sull'altezza della testata: qui a scorrere
            non è la finestra ma il `<main>` dell'applicazione, che comincia
            **sotto** la barra in alto (vedi `app/(app)/layout.tsx`). Un
            centimetro d'aria dal bordo è tutto quello che serve, e la barra
            non c'entra perché non è mai stata di sopra.
          */}
          <section aria-label="Anteprima" className="lg:sticky lg:top-4">
            {anteprima}
          </section>
          <section aria-label="Personalizzazione">{design}</section>
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2">
          {/* Stessa cosa, un piano più stretto: a due colonne l'anteprima sta
              accanto al modulo e resta attaccata. Sul telefono no — le
              linguette e l'anteprima sono già una sotto l'altra, e un codice
              incollato in cima si mangerebbe metà schermo per tutto il tempo
              in cui si compila. */}
          <section aria-label="Anteprima" className="md:sticky md:top-4">
            {anteprima}
          </section>
          <section>
            <Linguette attiva={linguetta} onCambia={setLinguetta} />
            {/* Lo stesso pannello del desktop, non una sua copia srotolata.
                Prima qui il disegno era spalmato su tre linguette e Colore e
                Stile stavano aperti insieme: due modi diversi di fare la
                stessa cosa, e quello stretto era anche il più lungo da
                scorrere. Con i blocchi, «una sezione sola alla volta» vale
                anche sul telefono senza doverlo scrivere due volte. */}
            <div className="mt-4">
              {linguetta === "contenuto" ? contenutoPannello : design}
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

/** Le quattro sezioni del pannello del disegno. Una sola aperta per volta. */
type Sezione = "colore" | "stile" | "logo" | "cornice";

type Linguetta = "contenuto" | "aspetto";

const LINGUETTE: { id: Linguetta; nome: string }[] = [
  { id: "contenuto", nome: "Contenuto" },
  { id: "aspetto", nome: "Aspetto" },
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
