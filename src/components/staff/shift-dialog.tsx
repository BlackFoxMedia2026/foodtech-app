"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { StaffDepartment, StaffPrimaryRole, WorkShiftKind } from "@prisma/client";
import { readApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAFF_DEPARTMENTS } from "@/lib/staff-departments";
import { staffDepartmentOf, staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { TIPI_TURNO, etichettaGiornoLunga, fineInMinuti, haOrario, minutiAOrario, orarioAMinuti } from "@/lib/turni";
import { cn } from "@/lib/utils";

export type TurnoModificabile = {
  id: string;
  waiterId: string;
  dateKey: string;
  kind: WorkShiftKind;
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number | null;
  department: StaffDepartment | null;
  service: string | null;
  notes: string | null;
};

type PersonaSceglibile = {
  id: string;
  firstName: string;
  lastName: string;
  primaryRole: StaffPrimaryRole | null;
  department: StaffDepartment | null;
};

/** Gli orari proposti quando si crea un turno da zero. Sono i due servizi di
 * un ristorante: chi pianifica la settimana ne scrive uno dei due venti volte,
 * e riscriverli a mano ogni volta è il grosso del lavoro. */
const PRESET = [
  { label: "Pranzo", inizio: "12:00", fine: "15:00", servizio: "Pranzo" },
  { label: "Cena", inizio: "18:00", fine: "00:00", servizio: "Cena" },
];

/**
 * Il dettaglio di un turno: si crea, si modifica, si sposta, si elimina.
 *
 * Rispetto alla versione che serviva la tabella, qui **la persona e il giorno
 * sono campi**, non contesto. Il motivo è il calendario: prima si arrivava
 * sempre da una casella, che già rispondeva a «chi» e «quando»; adesso si può
 * arrivare dal pulsante «Nuovo turno», che non risponde a nessuno dei due, e
 * si può voler spostare un turno di due giorni senza andarlo a cercare con il
 * trascinamento.
 */
export function ShiftDialog({
  open,
  onOpenChange,
  staff,
  personaId,
  dateKey,
  turno,
  serviceOptions,
  kindIniziale = "WORK",
  inizioMinuti,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Tutto l'organico: serve al selettore della persona. */
  staff: PersonaSceglibile[];
  /** Chi è già scelto, o null se lo si deve ancora scegliere. */
  personaId: string | null;
  dateKey: string;
  /** Nullo = si sta creando. */
  turno: TurnoModificabile | null;
  serviceOptions: string[];
  /** Il tipo con cui parte una creazione: il menù accanto a «Nuovo turno»
   * porta dritto a Ferie, Permesso o Riposo. */
  kindIniziale?: WorkShiftKind;
  /** L'ora della fascia su cui si è cliccato nel calendario. */
  inizioMinuti?: number;
}) {
  const router = useRouter();
  const [persona, setPersona] = useState<string>(personaId ?? "");
  const [giorno, setGiorno] = useState(dateKey);
  const [kind, setKind] = useState<WorkShiftKind>("WORK");
  const [inizio, setInizio] = useState("18:00");
  const [fine, setFine] = useState("00:00");
  const [pausa, setPausa] = useState("");
  const [reparto, setReparto] = useState<StaffDepartment>("SALA");
  const [servizio, setServizio] = useState("");
  const [note, setNote] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scelta = useMemo(() => staff.find((p) => p.id === persona) ?? null, [staff, persona]);

  /*
    Il modulo si ricarica ogni volta che il dialogo si apre, non a ogni render.

    Senza la guardia su `open`, riscrivere lo stato a ogni render riporterebbe
    i campi ai valori salvati mentre l'utente ci sta scrivendo dentro. È lo
    stesso motivo per cui non si usa `key` sul dialogo: qui i campi devono
    sopravvivere al render, non alla riapertura.
  */
  useEffect(() => {
    if (!open) return;
    setErrore(null);
    setPersona(personaId ?? "");
    setGiorno(turno?.dateKey ?? dateKey);
    setKind(turno?.kind ?? kindIniziale);
    // Cliccando sulle 19 nella griglia si apre un turno che comincia alle 19:

    // riproporre le 18 di default vorrebbe dire correggere a mano il campo
    // che si è appena indicato con il dito.
    setInizio(
      turno?.startMinute != null
        ? minutiAOrario(turno.startMinute)
        : inizioMinuti != null
          ? minutiAOrario(inizioMinuti)
          : "18:00",
    );
    setFine(
      turno?.endMinute != null
        ? minutiAOrario(turno.endMinute)
        : inizioMinuti != null
          ? minutiAOrario(inizioMinuti + 6 * 60)
          : "00:00",
    );
    setPausa(turno?.breakMinutes != null ? String(turno.breakMinutes) : "");
    setServizio(turno?.service ?? "");
    setNote(turno?.notes ?? "");
  }, [open, turno, personaId, dateKey, kindIniziale, inizioMinuti]);

  /** Il reparto segue la persona finché non lo si tocca: è il suo, nove volte
   * su dieci, e il campo esiste solo per la decima. */
  useEffect(() => {
    if (!open) return;
    if (turno?.department) {
      setReparto(turno.department);
      return;
    }
    if (scelta) setReparto(staffDepartmentOf(scelta));
  }, [open, turno, scelta]);

  const conOrario = haOrario(kind);

  /** L'anteprima della durata: dice subito che «18:00 → 00:00» sono sei ore e
   * non meno diciotto, cioè che la mezzanotte è stata capita come domani. */
  const durata = useMemo(() => {
    if (!conOrario) return null;
    const da = orarioAMinuti(inizio);
    if (da === null) return null;
    const a = fineInMinuti(da, fine);
    if (a === null) return null;
    const netti = a - da - (Number(pausa) || 0);
    if (netti <= 0) return null;
    const ore = Math.floor(netti / 60);
    const resto = netti % 60;
    return resto === 0 ? `${ore} h` : `${ore} h ${resto}′`;
  }, [conOrario, inizio, fine, pausa]);

  async function salva() {
    setErrore(null);
    if (!persona) {
      setErrore("Scegli la persona a cui assegnare il turno.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) {
      setErrore("Controlla il giorno.");
      return;
    }

    const corpo: Record<string, unknown> = {
      waiterId: persona,
      date: giorno,
      kind,
      notes: note.trim() || null,
    };

    if (conOrario) {
      const da = orarioAMinuti(inizio);
      const a = da === null ? null : fineInMinuti(da, fine);
      if (da === null || a === null) {
        setErrore("Controlla gli orari di inizio e fine.");
        return;
      }
      const pausaMinuti = pausa.trim() === "" ? null : Number(pausa);
      if (pausaMinuti !== null && (!Number.isInteger(pausaMinuti) || pausaMinuti < 0)) {
        setErrore("La pausa va scritta in minuti.");
        return;
      }
      if (pausaMinuti !== null && pausaMinuti >= a - da) {
        setErrore("La pausa è più lunga del turno.");
        return;
      }
      Object.assign(corpo, {
        startMinute: da,
        endMinute: a,
        breakMinutes: pausaMinuti,
        department: reparto,
        service: servizio || null,
      });
    }

    setSalvando(true);
    const res = turno
      ? await fetch(`/api/work-shifts/${turno.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        })
      : await fetch("/api/work-shifts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corpo),
        });
    setSalvando(false);

    if (!res.ok) {
      setErrore(await readApiError(res, "Non è stato possibile salvare il turno."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  async function elimina() {
    if (!turno) return;
    setEliminando(true);
    setErrore(null);
    const res = await fetch(`/api/work-shifts/${turno.id}`, { method: "DELETE" });
    setEliminando(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non è stato possibile eliminare il turno."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Niente `id` sul titolo né `aria-labelledby` sul contenuto: Radix li
          collega da solo, e passargliene uno nostro sovrascrive quello che il
          suo controllo interno va a cercare — l'etichetta resta corretta ma
          compare un avviso in console a ogni apertura.

          Larga e non alta: a 480 px i campi andavano uno sotto l'altro e la
          finestra scorreva già su un portatile. A 760 gli orari stanno in una
          riga sola, e se lo schermo è basso scorre solo il corpo — titolo e
          pulsanti restano dove sono. */}
      <DialogContent className="flex w-[calc(100vw-2rem)] max-w-[760px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="fissa px-6 pb-4 pr-12 pt-6">
          <DialogTitle>{turno ? "Modifica turno" : "Nuovo turno"}</DialogTitle>
          <DialogDescription>
            {scelta ? `${scelta.firstName} ${scelta.lastName} · ` : ""}
            <span className="capitalize">{etichettaGiornoLunga(giorno)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="scorrimento min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="persona">Dipendente</Label>
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger id="persona">
                  <SelectValue placeholder="Scegli…" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Il ruolo si mostra, non si sceglie: appartiene alla persona e
                  si cambia dalla sua scheda, non da un turno di giovedì. */}
              <p className="text-xs text-muted-foreground">
                {scelta?.primaryRole ? staffPrimaryRoleLabel(scelta.primaryRole) : "Ruolo non impostato"}
              </p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="giorno">Giorno</Label>
              <Input id="giorno" type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} />
            </div>

            <div className="col-span-full space-y-1.5">
              <Label id="tipo-turno">Tipo</Label>
              {/*
                I sei tipi come segmenti e non come tendina: sono pochi, si
                scelgono a ogni turno, e «riposo» deve costare un tocco solo —
                è la cosa che si mette più spesso dopo il lavoro. Un binario
                solo, come gli altri selettori del back office: il tipo scelto
                è la cupola verde, gli altri sono incisi nel binario.
              */}
              <div
                role="group"
                aria-labelledby="tipo-turno"
                className="binario grid grid-cols-3 gap-1 rounded-2xl border border-border/70 bg-card/50 p-1 sm:grid-cols-6 sm:rounded-full"
              >
                {TIPI_TURNO.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setKind(t.value)}
                    aria-pressed={kind === t.value}
                    className={cn(
                      "segmento h-8 min-w-0 whitespace-nowrap rounded-full border px-1 text-sm sm:px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      kind === t.value
                        ? "border-accent-strong/55 bg-accent/15 font-semibold text-accent-strong"
                        : "border-transparent font-medium text-muted-foreground hover:bg-veil-6 hover:text-foreground",
                    )}
                  >
                    {t.breve}
                  </button>
                ))}
              </div>
            </div>

            {conOrario && (
              <>
                <div className="col-span-full -mb-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="t-etichetta font-medium">Orario</span>
                    {/* Detto qui e non dopo il salvataggio: «00:00» è ambiguo,
                        e la disambiguazione va vista mentre si sceglie. */}
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      {durata ? `Durata netta ${durata}` : "Se la fine è prima dell'inizio, è il giorno dopo."}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setInizio(p.inizio);
                          setFine(p.fine);
                          if (serviceOptions.includes(p.servizio)) setServizio(p.servizio);
                        }}
                        className="pastiglia h-8 rounded-full border border-border/70 bg-card/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-line-30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {p.label} <span className="tabular-nums">{p.inizio}–{p.fine}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="inizio">Inizio</Label>
                  <Input id="inizio" type="time" value={inizio} onChange={(e) => setInizio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fine">Fine</Label>
                  <Input id="fine" type="time" value={fine} onChange={(e) => setFine(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pausa">Pausa (min)</Label>
                  <Input
                    id="pausa"
                    type="number"
                    min={0}
                    step={5}
                    inputMode="numeric"
                    placeholder="0"
                    value={pausa}
                    onChange={(e) => setPausa(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="servizio">Servizio</Label>
                  <Select value={servizio || "nessuno"} onValueChange={(v) => setServizio(v === "nessuno" ? "" : v)}>
                    <SelectTrigger id="servizio">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessuno</SelectItem>
                      {serviceOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="reparto">Reparto</Label>
                  <Select value={reparto} onValueChange={(v) => setReparto(v as StaffDepartment)}>
                    <SelectTrigger id="reparto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_DEPARTMENTS.filter((d) => d.key !== "ALTRO").map((d) => (
                        <SelectItem key={d.key} value={d.key}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Da cambiare solo se quel giorno copre un reparto diverso dal suo.
                  </p>
                </div>
              </>
            )}

            <div className={cn("space-y-1.5", conOrario ? "col-span-2" : "col-span-full")}>
              <Label htmlFor="note">Nota</Label>
              <Input
                id="note"
                value={note}
                maxLength={500}
                placeholder="Facoltativa"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="fissa flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          {errore ? (
            <p className="basis-full text-sm text-destructive-soft" role="alert">
              {errore}
            </p>
          ) : null}
          {turno ? (
            <Button type="button" variant="ghost" size="sm" onClick={elimina} disabled={eliminando || salvando}>
              <Trash2 className="h-4 w-4" /> {eliminando ? "Elimino…" : "Elimina"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="pastiglia rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Annulla
            </Button>
            <Button type="button" variant="accent" onClick={salva} disabled={salvando || eliminando}>
              {salvando ? "Salvataggio…" : turno ? "Salva" : "Crea turno"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
