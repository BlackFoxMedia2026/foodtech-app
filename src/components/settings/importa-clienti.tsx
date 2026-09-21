"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";

/**
 * Portare dentro i clienti del gestionale di prima.
 *
 * ## Due gesti, e il primo non scrive niente
 *
 * Si carica il file e si **guarda**: quante righe, quanti clienti nuovi,
 * quante prenotazioni, quali colonne non abbiamo capito, e le prime righe
 * **come le abbiamo lette**. Solo un secondo pulsante importa.
 *
 * La tabellina delle prime righe non è decorazione: è il posto dove un
 * ristoratore si accorge che le date sono lette al contrario — «03/04» che
 * diventa 4 marzo invece del 3 aprile — **prima** di portare dentro duemila
 * prenotazioni sbagliate. È l'unico controllo che una macchina non può fare
 * da sola, perché solo lui sa cosa c'era scritto nel suo file.
 *
 * ## Perché il file si legge nel browser
 *
 * Perché un CSV è testo: `file.text()` e si manda. Un caricamento multipart
 * servirebbe per un allegato binario e qui aggiungerebbe un pezzo di codice
 * per niente.
 */

type Conteggi = {
  righeFile: number;
  leggibili: number;
  scartate: number;
  soloClienti: number;
  prenotazioniPassate: number;
  prenotazioniFuture: number;
  ospitiNuovi: number;
  ospitiGiaVisti: number;
  giaImportate: number;
};

type Anteprima = {
  conteggi: Conteggi;
  colonne: { riconosciute: string[]; ignorate: string[] };
  scarti: { riga: number; perche: string }[];
  esempi: {
    riga: number;
    nome: string;
    contatto: string | null;
    quando: string | null;
    persone: number | null;
    giaVisto: boolean;
  }[];
  tagliato: boolean;
  creati?: { ospiti: number; prenotazioni: number };
};

export function ImportaClienti({ canManage }: { canManage: boolean }) {
  const [nomeFile, setNomeFile] = useState<string | null>(null);
  const [testo, setTesto] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [fatto, setFatto] = useState<Anteprima | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function scegliFile(file: File) {
    setErrore(null);
    setAnteprima(null);
    setFatto(null);
    setNomeFile(file.name);
    const contenuto = await file.text();
    setTesto(contenuto);
    await chiedi(contenuto, false);
  }

  async function chiedi(contenuto: string, esegui: boolean) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch("/api/venue/importa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testo: contenuto, esegui }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Non siamo riusciti a leggere il file."));
      }
      const dati = (await res.json()) as Anteprima;
      if (esegui) setFatto(dati);
      else setAnteprima(dati);
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  const c = (fatto ?? anteprima)?.conteggi;

  return (
    <section className="surface riquadro space-y-4 p-5">
      <header className="space-y-1">
        <h2 className="text-display text-xl">Porta dentro i tuoi clienti</h2>
        <p className="text-sm text-muted-foreground">
          Il file esportato dal gestionale di prima: clienti, prenotazioni, o entrambi. Prima ti
          mostriamo cosa succederebbe — non importiamo niente finché non lo dici tu.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void scegliFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!canManage || inCorso}
          onClick={() => input.current?.click()}
          className="tocco-comodo"
        >
          <FileUp className="h-4 w-4" />
          {nomeFile ? "Scegli un altro file" : "Scegli il file"}
        </Button>
        {nomeFile && <span className="text-sm text-muted-foreground">{nomeFile}</span>}
      </div>

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          Serve il ruolo di manager: un&apos;importazione scrive nella rubrica di tutti.
        </p>
      )}

      {errore && (
        <p className="riquadro border border-destructive/40 bg-destructive/5 p-3 text-sm">{errore}</p>
      )}

      {c && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero titolo="Righe nel file" valore={c.righeFile} />
            <Numero titolo="Clienti nuovi" valore={c.ospitiNuovi} />
            <Numero titolo="Già in rubrica" valore={c.ospitiGiaVisti} />
            <Numero
              titolo="Prenotazioni"
              valore={c.prenotazioniPassate + c.prenotazioniFuture}
              nota={`${c.prenotazioniFuture} future · ${c.prenotazioniPassate} passate`}
            />
          </dl>

          {c.soloClienti > 0 && (
            <p className="text-sm text-muted-foreground">
              {c.soloClienti} righe senza data: entrano come clienti, non come prenotazioni.
            </p>
          )}

          {c.giaImportate > 0 && (
            <p className="text-sm text-muted-foreground">
              {c.giaImportate} righe le avevi già importate: non verranno duplicate.
            </p>
          )}

          {(fatto ?? anteprima)!.colonne.ignorate.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Colonne che non abbiamo usato:{" "}
              <strong>{(fatto ?? anteprima)!.colonne.ignorate.join(", ")}</strong>. Se una di queste
              ti serve, scrivici: la aggiungiamo.
            </p>
          )}

          {(fatto ?? anteprima)!.tagliato && (
            <p className="riquadro flex gap-2 border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Il file è più lungo del massimo che leggiamo in una volta: abbiamo preso le prime
              righe. Dividilo in due e carica anche la seconda metà.
            </p>
          )}

          {(fatto ?? anteprima)!.esempi.length > 0 && (
            <div className="space-y-2">
              <h3 className="t-etichetta">Come abbiamo letto le prime righe</h3>
              {/* Il controllo vero: qui si vede se le date sono al contrario. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-normal">Riga</th>
                      <th className="py-1 pr-3 font-normal">Chi</th>
                      <th className="py-1 pr-3 font-normal">Contatto</th>
                      <th className="py-1 pr-3 font-normal">Quando</th>
                      <th className="py-1 font-normal">Coperti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fatto ?? anteprima)!.esempi.map((e) => (
                      <tr key={e.riga} className="border-t border-border/60">
                        <td className="py-1.5 pr-3 text-muted-foreground">{e.riga}</td>
                        <td className="py-1.5 pr-3">
                          {e.nome}
                          {e.giaVisto && (
                            <span className="ml-2 text-xs text-muted-foreground">già in rubrica</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{e.contatto ?? "—"}</td>
                        <td className="py-1.5 pr-3">{e.quando ?? "—"}</td>
                        <td className="py-1.5">{e.persone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(fatto ?? anteprima)!.scarti.length > 0 && (
            <div className="space-y-1">
              <h3 className="t-etichetta">Righe che non possiamo leggere</h3>
              <ul className="space-y-0.5 text-sm text-muted-foreground">
                {(fatto ?? anteprima)!.scarti.map((s) => (
                  <li key={s.riga}>
                    Riga {s.riga}: {s.perche}
                  </li>
                ))}
              </ul>
              {c.scartate > (fatto ?? anteprima)!.scarti.length && (
                <p className="text-sm text-muted-foreground">
                  …e altre {c.scartate - (fatto ?? anteprima)!.scarti.length}.
                </p>
              )}
            </div>
          )}

          {fatto ? (
            <p className="riquadro flex gap-2 border border-emerald-600/40 bg-emerald-600/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Fatto: {fatto.creati?.ospiti ?? 0} clienti e {fatto.creati?.prenotazioni ?? 0}{" "}
              prenotazioni. Li trovi in Clienti e in Prenotazioni.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={!canManage || inCorso || !testo || c.leggibili === 0}
                onClick={() => testo && void chiedi(testo, true)}
                className="tocco-comodo"
              >
                <Upload className="h-4 w-4" />
                {inCorso ? "Un istante…" : "Importa"}
              </Button>
              <span className="text-sm text-muted-foreground">
                Puoi caricare lo stesso file due volte: non si duplica niente.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Numero({ titolo, valore, nota }: { titolo: string; valore: number; nota?: string }) {
  return (
    <div className="riquadro border border-border/60 p-3">
      <dt className="t-etichetta">{titolo}</dt>
      <dd className="text-display text-2xl leading-none">{valore}</dd>
      {nota && <dd className="mt-1 text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}
