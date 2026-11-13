"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  anteprimaContattiCsv,
  fetchSegmentPreview,
  importaContattiCsv,
  patchCampaignDraft,
  type EsitoContattiCsv,
} from "@/lib/campaign-wizard-api";
import { colonneDelFile, ETICHETTE_CAMPO, type AbbinamentoColonne, type CampoContatto } from "@/lib/contatti-colonne";

/** L'ordine in cui raccontiamo cosa abbiamo riconosciuto nel file. */
const ORDINE_CAMPI: CampoContatto[] = ["nomeCompleto", "nome", "cognome", "email", "telefono"];
import { useWizardDispatch, useWizardState } from "./wizard-context";

const NUM = new Intl.NumberFormat("it-IT");
/** Lo stesso limite del filtro sul server (`extraGuestIds`). */
const MASSIMO_DAL_FILE = 5000;

const STATO: Record<EsitoContattiCsv["esempi"][number]["stato"], { label: string; classe: string }> = {
  nuovo: { label: "Nuovo", classe: "bg-[#e2eee6] text-[#2c5545]" },
  in_rubrica: { label: "Già in rubrica", classe: "bg-[#e4eef0] text-[#2f5f6e]" },
  gia_destinatario: { label: "Già nella campagna · saltato", classe: "bg-secondary text-muted-foreground" },
  disiscritto: { label: "Disiscritto", classe: "bg-[#f6e3dc] text-[#9a3f25]" },
  bloccato: { label: "Bloccato", classe: "bg-[#f6e3dc] text-[#9a3f25]" },
};

/**
 * Destinatari da un file CSV.
 *
 * Tre tempi, e solo l'ultimo scrive: si sceglie il file, si legge il
 * controllo (quanti sono buoni, quanti si scartano e perché, chi resta fuori
 * per scelta sua), si conferma il consenso e si aggiungono. Il controllo lo
 * fa il server confrontando il file con la rubrica: vedi
 * `server/campaign-contatti.ts`, dove sta anche perché chi si è disiscritto
 * resta fuori anche se è nel file.
 */
export function CaricaContatti({
  nelPopup = false,
  onFatto,
}: {
  /** Dentro la finestra «Aggiungi contatti»: il titolo lo dà la finestra. */
  nelPopup?: boolean;
  /** Dopo l'aggiunta: la finestra si chiude e la tabella si aggiorna. */
  onFatto?: () => void;
} = {}) {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ nome: string; testo: string } | null>(null);
  /* Le colonne le riconosciamo da soli (intestazioni e contenuto delle
     celle): chi carica il file non deve abbinare niente, vede solo cosa
     abbiamo letto. */
  const [colonne, setColonne] = useState<ReturnType<typeof colonneDelFile> | null>(null);
  const abbinamento: AbbinamentoColonne = colonne?.proposta ?? {};
  const [esito, setEsito] = useState<EsitoContattiCsv | null>(null);
  const [consenso, setConsenso] = useState(false);
  const [lavoro, setLavoro] = useState<"lettura" | "aggiunta" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [aggiunti, setAggiunti] = useState<number | null>(null);
  const [sopra, setSopra] = useState(false);

  const giaDalFile = state.segment.extraGuestIds?.length ?? 0;

  async function leggi(f: File) {
    setErrore(null);
    setAggiunti(null);
    setEsito(null);
    setColonne(null);
    setConsenso(false);
    setLavoro("lettura");
    try {
      const testo = await f.text();
      const lette = colonneDelFile(testo);
      if (lette.intestazioni.length === 0) throw new Error("Il file è vuoto: controlla di aver scelto quello giusto.");
      if (lette.proposta.email === undefined) {
        throw new Error(
          "Non troviamo una colonna con gli indirizzi email in questo file. Controlla che ci sia e che la prima riga contenga i titoli delle colonne.",
        );
      }
      const controllo = await anteprimaContattiCsv(testo, lette.proposta, state.segment);
      setFile({ nome: f.name, testo });
      setColonne(lette);
      setEsito(controllo);
    } catch (err) {
      setFile(null);
      setErrore(err instanceof Error ? err.message : "Non siamo riusciti a leggere il file.");
    } finally {
      setLavoro(null);
    }
  }

  /** Aggiorna il pubblico della campagna, lo salva e ricalcola i destinatari. */
  async function applica(extraGuestIds: string[]) {
    const segment = { ...state.segment, extraGuestIds: extraGuestIds.length ? extraGuestIds : undefined };
    dispatch({ type: "SET_SEGMENT", segment });
    if (state.campaignId) await patchCampaignDraft(state.campaignId, { segment });
    dispatch({ type: "SET_SEGMENT_PREVIEW", preview: await fetchSegmentPreview(segment) });
  }

  async function aggiungi() {
    if (!file || !esito || !consenso) return;
    setErrore(null);
    setLavoro("aggiunta");
    try {
      const risultato = await importaContattiCsv(file.testo, state.campaignId, colonne?.proposta, state.segment);
      const insieme = Array.from(new Set([...(state.segment.extraGuestIds ?? []), ...risultato.guestIds]));
      if (insieme.length > MASSIMO_DAL_FILE) {
        throw new Error(
          `Una campagna può avere al massimo ${NUM.format(MASSIMO_DAL_FILE)} contatti da file: questo file li supererebbe.`,
        );
      }
      await applica(insieme);
      setAggiunti(risultato.guestIds.length);
      setFile(null);
      setColonne(null);
      setEsito(null);
      setConsenso(false);
      onFatto?.();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non siamo riusciti ad aggiungere i contatti.");
    } finally {
      setLavoro(null);
    }
  }

  async function togliDalFile() {
    setErrore(null);
    setAggiunti(null);
    try {
      await applica([]);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non siamo riusciti a togliere i contatti.");
    }
  }

  function annulla() {
    setFile(null);
    setColonne(null);
    setEsito(null);
    setConsenso(false);
    setErrore(null);
  }

  const scartati = esito ? esito.emailNonValide + esito.senzaEmail + esito.doppioniNelFile : 0;
  const esclusi = esito ? esito.disiscritti + esito.soppressi : 0;

  return (
    <section className={cn("space-y-4", !nelPopup && "riquadro p-4")} aria-label="Aggiungi contatti da un file">
      {!nelPopup && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" /> Aggiungi contatti da un file
            </h3>
            <p className="t-nota mt-0.5">
              Un CSV con una colonna email (nome e cognome se ci sono). Si sommano ai clienti scelti con i filtri.
            </p>
          </div>
          {giaDalFile > 0 && !esito && (
            <div className="flex items-center gap-2 rounded-full bg-[#e2eee6] py-1 pl-3 pr-1 text-xs font-medium text-[#2c5545]">
              {NUM.format(giaDalFile)} dal file
              <button
                type="button"
                onClick={togliDalFile}
                title="Togli i contatti del file"
                aria-label="Togli i contatti del file"
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- 1. il file */}
      {!esito && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={lavoro !== null}
            onDragOver={(e) => {
              e.preventDefault();
              setSopra(true);
            }}
            onDragLeave={() => setSopra(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSopra(false);
              const f = e.dataTransfer.files[0];
              if (f) void leggi(f);
            }}
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors",
              "hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:border-primary focus-visible:outline-none disabled:cursor-wait",
              sopra ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {lavoro === "lettura" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                <span className="text-sm">Leggo il file e controllo i contatti…</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm">
                  Trascina qui il file, oppure <span className="font-medium text-primary">sceglilo dal computer</span>
                </span>
                <span className="t-nota text-xs">CSV o testo esportato da Excel, fino a 5.000 righe.</span>
              </>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void leggi(f);
            }}
          />
        </>
      )}

      {/* --------------------------------------------- 2. il controllo */}
      {esito && file && (
        <div className="space-y-4">
          <div>
            <p className="text-sm">
              <span className="font-medium">{file.nome}</span>{" "}
              <span className="text-muted-foreground">· {NUM.format(esito.righeFile)} righe lette</span>
            </p>
            {colonne && (
              <p className="t-nota mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {ORDINE_CAMPI.filter((c) => abbinamento[c] !== undefined).map((c) => (
                  <span key={c}>
                    <span className="font-medium text-foreground">{ETICHETTE_CAMPO[c]}</span> da «
                    {colonne.intestazioni[abbinamento[c]!] || `colonna ${abbinamento[c]! + 1}`}»
                  </span>
                ))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Conto etichetta="Da aggiungere" valore={esito.aggiungibili} tono="verde" />
            <Conto etichetta="Nuovi in rubrica" valore={esito.nuovi} />
            <Conto etichetta="Già clienti" valore={esito.giaInRubrica} />
            <Conto etichetta="Già nella campagna" valore={esito.giaDestinatari} />
            <Conto
              etichetta="Esclusi o scartati"
              valore={esclusi + scartati}
              tono={esclusi + scartati ? "rosso" : undefined}
            />
          </div>

          {(scartati > 0 || esclusi > 0 || esito.tagliato || esito.giaDestinatari > 0) && (
            <ul className="space-y-1.5 rounded-xl bg-[#fbf3e1] px-4 py-3 text-sm">
              {esito.giaDestinatari > 0 && (
                <Nota>
                  {NUM.format(esito.giaDestinatari)}{" "}
                  {esito.giaDestinatari === 1 ? "è già fra i destinatari" : "sono già fra i destinatari"} di questa
                  campagna: {esito.giaDestinatari === 1 ? "lo saltiamo" : "li saltiamo"} e andiamo avanti con gli altri
                </Nota>
              )}
              {esito.emailNonValide > 0 && (
                <Nota>{NUM.format(esito.emailNonValide)} con l&apos;email scritta male: scartate</Nota>
              )}
              {esito.senzaEmail > 0 && <Nota>{NUM.format(esito.senzaEmail)} righe senza email: scartate</Nota>}
              {esito.doppioniNelFile > 0 && (
                <Nota>{NUM.format(esito.doppioniNelFile)} email ripetute nel file: contate una volta sola</Nota>
              )}
              {esito.disiscritti > 0 && (
                <Nota>{NUM.format(esito.disiscritti)} si sono disiscritti: restano fuori, anche se sono nel file</Nota>
              )}
              {esito.soppressi > 0 && (
                <Nota>
                  {NUM.format(esito.soppressi)} indirizzi bloccati (inesistenti o che hanno segnalato spam): restano
                  fuori
                </Nota>
              )}
              {esito.tagliato && <Nota>Il file superava le 5.000 righe: abbiamo letto solo le prime</Nota>}
            </ul>
          )}

          {esito.scarti.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Righe scartate ({esito.scarti.length === 8 ? "prime 8" : esito.scarti.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {esito.scarti.map((s) => (
                  <li key={`${s.riga}-${s.perche}`}>
                    Riga {s.riga}: {s.perche}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {esito.esempi.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-border">
              <p className="t-etichetta bg-secondary/60 px-3 py-2">Come li abbiamo letti</p>
              <ul className="divide-y divide-border">
                {esito.esempi.map((e) => (
                  <li key={e.email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{e.email}</span>
                      {e.nome && <span className="block truncate text-xs text-muted-foreground">{e.nome}</span>}
                    </span>
                    <span
                      className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATO[e.stato].classe)}
                    >
                      {STATO[e.stato].label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* --------------------------------------------- 3. il consenso */}
          {esito.aggiungibili > 0 ? (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={consenso}
                  onChange={(e) => setConsenso(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#2c5545]"
                />
                <span>
                  Dichiaro di avere il consenso di queste persone a ricevere email dal mio locale.
                  <span className="t-nota mt-0.5 block">
                    Resta registrato con il tuo nome. Chi si è disiscritto resta comunque fuori.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="accent" onClick={() => void aggiungi()} disabled={!consenso || lavoro !== null}>
                  {lavoro === "aggiunta" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Aggiungi {NUM.format(esito.aggiungibili)} {esito.aggiungibili === 1 ? "contatto" : "contatti"}
                </Button>
                <Button variant="ghost" onClick={annulla} disabled={lavoro !== null}>
                  Scegli un altro file
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
              <span>
                {esito.giaDestinatari > 0 && esito.giaDestinatari === esito.unici
                  ? "Tutti i contatti di questo file sono già fra i destinatari della campagna: non c'è niente da aggiungere."
                  : "Nessun contatto di questo file si può aggiungere."}
              </span>
              <Button variant="outline" size="sm" onClick={annulla}>
                Scegli un altro file
              </Button>
            </div>
          )}
        </div>
      )}

      {aggiunti !== null && (
        <p className="flex items-center gap-2 text-sm text-sage-strong">
          <Check className="h-4 w-4" aria-hidden="true" />
          {NUM.format(aggiunti)} {aggiunti === 1 ? "contatto aggiunto" : "contatti aggiunti"}: i destinatari qui sotto
          sono aggiornati.
        </p>
      )}
      {errore && (
        <p className="flex items-start gap-2 text-sm text-destructive-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      )}
    </section>
  );
}

function Conto({ etichetta, valore, tono }: { etichetta: string; valore: number; tono?: "verde" | "rosso" }) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5",
        tono === "verde"
          ? "bg-[#e2eee6] text-[#2c5545]"
          : tono === "rosso"
            ? "bg-[#f6e3dc] text-[#9a3f25]"
            : "bg-secondary/60",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">{etichetta}</p>
      <p className="text-display mt-0.5 text-xl tabular-nums">{NUM.format(valore)}</p>
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
