"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  GIORNI_SETTIMANA,
  descrizioneGiorni,
  fineInMinuti,
  minutiAOrario,
  orarioAMinuti,
  orariProposti,
  ordinaGiorni,
  type FasciaServizio,
} from "@/lib/turni";
import {
  EsitoSalvataggio,
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
  ValoreImpostazione,
} from "@/components/settings/righe-impostazioni";

/**
 * Gli orari in cui si accettano prenotazioni, finalmente modificabili.
 *
 * Erano scritti dal seed e mostrati qui in sola lettura — e per giunta un
 * giorno solo, «la domenica come esempio», con i minuti arrotondati a `:00`.
 * Un locale che apre alle 12:30 leggeva 12:00 e non aveva nessun modo di
 * correggerlo: non una funzione mancante, una funzione che si contraddiceva.
 *
 * **Un turno, non sette righe.** Sotto, ogni giorno ha la sua riga; qui una
 * cena è una cena, con accanto i giorni in cui si fa. Toccare una casella
 * aggiunge o toglie un giorno, e quando i giorni hanno configurazioni diverse
 * — il sabato con più coperti — restano due turni distinti, perché è quello
 * che sono davvero.
 *
 * **«Alle» non è l'ora di chiusura**: è l'ultimo orario che un cliente può
 * scegliere, perché il motore genera gli orari da inizio a fine **inclusi**.
 * È la sola cosa di questa schermata che non si indovina, quindi è scritta
 * sotto i campi e si aggiorna mentre li si tocca.
 */

type Bozza = {
  nome: string;
  inizio: string;
  fine: string;
  coperti: string;
  minutiSlot: string;
  giorni: number[];
};

/** L'identità di una fascia per lo schermo: la prima riga che la compone. */
const chiaveDi = (f: FasciaServizio) => f.ids[0];

const NUOVA = "nuova";

const PASSI = [10, 15, 20, 30, 60];

function bozzaDa(f: FasciaServizio): Bozza {
  return {
    nome: f.nome,
    inizio: minutiAOrario(f.inizioMinuti),
    fine: minutiAOrario(f.fineMinuti),
    coperti: String(f.coperti),
    minutiSlot: String(f.minutiSlot),
    giorni: f.giorni,
  };
}

const BOZZA_NUOVA: Bozza = {
  nome: "",
  inizio: "19:00",
  fine: "23:00",
  coperti: "60",
  minutiSlot: "15",
  giorni: GIORNI_SETTIMANA.map((g) => g.weekday),
};

export function TurniServizioSettings({
  fasce: fasceIniziali,
  canManage,
}: {
  fasce: FasciaServizio[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [fasce, setFasce] = useState(fasceIniziali);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Bozza>(BOZZA_NUOVA);
  const [nomeIniziale, setNomeIniziale] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<string | null>(null);

  function apri(f: FasciaServizio) {
    setInModifica(chiaveDi(f));
    setBozza(bozzaDa(f));
    setNomeIniziale(f.nome);
    setErrore(null);
    setDaEliminare(null);
  }

  function apriNuova() {
    setInModifica(NUOVA);
    setBozza(BOZZA_NUOVA);
    setNomeIniziale(null);
    setErrore(null);
    setDaEliminare(null);
  }

  function chiudi() {
    setInModifica(null);
    setErrore(null);
  }

  async function salva(fascia: FasciaServizio | null) {
    const inizioMin = orarioAMinuti(bozza.inizio);
    if (inizioMin === null) return;
    setSalvando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/service-shifts", {
        method: fascia ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: fascia?.ids ?? [],
          nome: bozza.nome,
          inizio: bozza.inizio,
          fine: bozza.fine,
          coperti: Number(bozza.coperti),
          minutiSlot: Number(bozza.minutiSlot),
          giorni: bozza.giorni,
        }),
      });
      if (!res.ok) {
        setErrore(await readApiError(res, "Non siamo riusciti a salvare questo turno. Riprova."));
        return;
      }
      const salvata: FasciaServizio = await res.json();
      setFasce((prima) => {
        const senza = fascia ? prima.filter((f) => chiaveDi(f) !== chiaveDi(fascia)) : prima;
        return [...senza, salvata].sort(
          (a, b) => a.inizioMinuti - b.inizioMinuti || a.nome.localeCompare(b.nome, "it"),
        );
      });
      setInModifica(null);
      router.refresh();
    } catch {
      // La rete caduta a metà salvataggio: senza questo ramo l'eccezione
      // resta senza padrone e i pulsanti restano spenti per sempre, perche'
      // «sto salvando» non tornerebbe mai indietro.
      setErrore("Il salvataggio non è partito: controlla la connessione e riprova.");
    } finally {
      setSalvando(false);
    }
  }

  async function elimina(fascia: FasciaServizio) {
    setErrore(null);
    try {
      const res = await fetch("/api/service-shifts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: fascia.ids }),
      });
      if (!res.ok) {
        setErrore(await readApiError(res, "Non siamo riusciti a eliminare questo turno."));
        return;
      }
      setFasce((prima) => prima.filter((f) => chiaveDi(f) !== chiaveDi(fascia)));
      router.refresh();
    } catch {
      setErrore("L'eliminazione non è partita: controlla la connessione e riprova.");
    } finally {
      setDaEliminare(null);
    }
  }

  const nomeCambiato =
    nomeIniziale !== null && bozza.nome.trim() !== "" && bozza.nome.trim() !== nomeIniziale;

  return (
    <GruppoImpostazioni
      titolo="Turni di servizio"
      descrizione="Gli orari in cui si accettano prenotazioni, quanti coperti per turno e ogni quanto si propone un orario. Valgono per il modulo pubblico e per la disponibilità che vedi in sala."
      azione={
        canManage && (
          <Button type="button" variant="outline" size="sm" onClick={apriNuova} disabled={inModifica === NUOVA}>
            <Plus className="h-4 w-4" /> Aggiungi turno
          </Button>
        )
      }
    >
      {fasce.length === 0 && inModifica !== NUOVA && (
        <RigaImpostazione
          nome="Nessun turno"
          descrizione="Senza turni il modulo pubblico non ha orari da proporre: chi prova a prenotare trova il locale chiuso tutti i giorni."
        />
      )}

      {fasce.map((fascia) =>
        inModifica === chiaveDi(fascia) ? (
          <RigaLibera key={chiaveDi(fascia)}>
            <EditorFascia
              bozza={bozza}
              setBozza={setBozza}
              nomeCambiato={nomeCambiato}
              nomeIniziale={nomeIniziale}
              salvando={salvando}
              errore={errore}
              onSalva={() => salva(fascia)}
              onAnnulla={chiudi}
            />
          </RigaLibera>
        ) : (
          <RigaImpostazione
            key={chiaveDi(fascia)}
            nome={fascia.nome}
            descrizione={`${minutiAOrario(fascia.inizioMinuti)} – ${minutiAOrario(
              fascia.fineMinuti,
            )} · ${descrizioneGiorni(fascia.giorni)}`}
          >
            {daEliminare === chiaveDi(fascia) ? (
              <>
                <span className="text-sm text-muted-foreground">Eliminare?</span>
                <Button type="button" size="sm" variant="destructive" onClick={() => elimina(fascia)}>
                  Elimina
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setDaEliminare(null)}>
                  Annulla
                </Button>
              </>
            ) : (
              <>
                <ValoreImpostazione mono>
                  {fascia.coperti} coperti · slot da {fascia.minutiSlot}&apos;
                </ValoreImpostazione>
                {canManage && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Modifica ${fascia.nome}`}
                      onClick={() => apri(fascia)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Elimina ${fascia.nome}`}
                      onClick={() => setDaEliminare(chiaveDi(fascia))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </>
            )}
          </RigaImpostazione>
        ),
      )}

      {inModifica === NUOVA && (
        <RigaLibera>
          <EditorFascia
            bozza={bozza}
            setBozza={setBozza}
            nomeCambiato={false}
            nomeIniziale={null}
            salvando={salvando}
            errore={errore}
            onSalva={() => salva(null)}
            onAnnulla={chiudi}
          />
        </RigaLibera>
      )}

      {errore && inModifica === null && (
        <RigaLibera>
          <p className="text-sm text-destructive-soft">{errore}</p>
        </RigaLibera>
      )}
    </GruppoImpostazioni>
  );
}

/* -------------------------------------------------------------------------- */
/*  L'editor di un turno                                                      */
/* -------------------------------------------------------------------------- */

function EditorFascia({
  bozza,
  setBozza,
  nomeCambiato,
  nomeIniziale,
  salvando,
  errore,
  onSalva,
  onAnnulla,
}: {
  bozza: Bozza;
  setBozza: (b: Bozza) => void;
  nomeCambiato: boolean;
  nomeIniziale: string | null;
  salvando: boolean;
  errore: string | null;
  onSalva: () => void;
  onAnnulla: () => void;
}) {
  const inizioMin = orarioAMinuti(bozza.inizio);
  const fineMin = inizioMin === null ? null : fineInMinuti(inizioMin, bozza.fine);
  const passo = Number(bozza.minutiSlot);
  const coperti = Number(bozza.coperti);

  const orari =
    inizioMin !== null && fineMin !== null && fineMin - inizioMin >= passo
      ? orariProposti(inizioMin, fineMin, passo)
      : null;

  const completo = bozza.nome.trim() !== "" && bozza.giorni.length > 0 && coperti > 0 && orari !== null;

  function cambiaGiorno(weekday: number) {
    const giorni = bozza.giorni.includes(weekday)
      ? bozza.giorni.filter((g) => g !== weekday)
      : ordinaGiorni([...bozza.giorni, weekday]);
    setBozza({ ...bozza, giorni });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (completo) onSalva();
      }}
    >
      {/*
        Due colonne già sul telefono: «Dalle» e «Alle» sono una domanda sola e
        una sotto l'altra si leggono come due, e i cinque campi in colonna
        facevano una schermata intera per un turno. Il nome prende la riga
        sua perché è l'unico che può essere lungo.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="turno-nome">Nome</Label>
          <Input
            id="turno-nome"
            autoFocus
            value={bozza.nome}
            placeholder="Es. Cena"
            maxLength={40}
            onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="turno-inizio">Dalle</Label>
          <Input
            id="turno-inizio"
            type="time"
            value={bozza.inizio}
            onChange={(e) => setBozza({ ...bozza, inizio: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="turno-fine">Alle</Label>
          <Input
            id="turno-fine"
            type="time"
            value={bozza.fine}
            onChange={(e) => setBozza({ ...bozza, fine: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="turno-coperti">Coperti</Label>
          <Input
            id="turno-coperti"
            inputMode="numeric"
            className="text-right"
            value={bozza.coperti}
            onChange={(e) => setBozza({ ...bozza, coperti: e.target.value.replace(/[^0-9]/g, "") })}
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="turno-passo">Un orario ogni</Label>
          <Select
            value={bozza.minutiSlot}
            onValueChange={(v) => setBozza({ ...bozza, minutiSlot: v })}
          >
            <SelectTrigger id="turno-passo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PASSI.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {p} minuti
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        I giorni sono caselle e non un elenco a tendina: la domanda non è «in
        che giorno», è «quali», e la risposta più comune — tutti — si legge a
        colpo d'occhio solo se i sette stanno insieme.
      */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Giorni</p>
        <div role="group" aria-label="Giorni in cui si fa questo turno" className="flex flex-wrap gap-1.5">
          {GIORNI_SETTIMANA.map((g) => {
            const attivo = bozza.giorni.includes(g.weekday);
            return (
              <button
                key={g.weekday}
                type="button"
                aria-pressed={attivo}
                onClick={() => cambiaGiorno(g.weekday)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                  attivo
                    ? "border-accent bg-accent/25 text-cream"
                    : "border-border text-muted-foreground hover:border-cream/30 hover:text-foreground",
                )}
              >
                {g.breve}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        La frase che conta: non cosa salviamo, ma **cosa vedrà il cliente**.
        «Alle 15:00» è l'ultimo orario prenotabile, non l'ora in cui si chiude:
        detto qui, mentre si sceglie, invece che scoperto sul modulo.
      */}
      <p className="flex items-start gap-2 text-sm text-card-foreground/80">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
        <span>
          {orari && inizioMin !== null && fineMin !== null ? (
            <>
              Dal modulo si prenota dalle {minutiAOrario(inizioMin)} alle {minutiAOrario(orari.ultimo)},{" "}
              {descrizioneGiorni(bozza.giorni)}: {orari.quanti} {orari.quanti === 1 ? "orario" : "orari"}, uno
              ogni {passo} minuti, fino a {coperti || 0} coperti per turno.
              {fineMin > 24 * 60 && " La fine è dopo la mezzanotte: gli orari restano quelli della sera prima."}
            </>
          ) : (
            "Metti un'ora di fine più avanti dell'inizio: fra le due deve starci almeno un orario."
          )}
        </span>
      </p>

      {nomeCambiato && (
        <p className="text-sm text-muted-foreground">
          Il nome di un turno è anche l&apos;etichetta del servizio nei turni dello staff e nelle assegnazioni
          di sala. Quelle già scritte come «{nomeIniziale}» restano com&apos;erano: le nuove useranno «
          {bozza.nome.trim()}».
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={salvando || !completo}>
          {salvando ? "Salvo…" : "Salva"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onAnnulla} disabled={salvando}>
          Annulla
        </Button>
        <EsitoSalvataggio errore={errore} />
      </div>
    </form>
  );
}
