"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CircleDot, RotateCcw, Users } from "lucide-react";
import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MiniMese } from "@/components/staff/calendario/mini-mese";
import { FAMIGLIA_REPARTO, FAMIGLIE, ORDINE_REPARTI, PALLINO_LEGENDA } from "@/components/staff/calendario/famiglie";
import { STAFF_DEPARTMENTS } from "@/lib/staff-departments";
import { StaffSwitch } from "@/components/staff/staff-switch";
import { FILTRI_VUOTI, STATI_FILTRO, filtriAttivi, type FiltriStaff } from "@/components/staff/filtri-staff";
import { etichettaGiornoBreve } from "@/lib/turni";
import { cn } from "@/lib/utils";

export type Riepilogo = {
  totale: number;
  inTurno: number;
  assenti: number;
  liberi: number;
  /** Il giorno a cui si riferiscono i tre numeri. */
  giorno: string;
  eOggi: boolean;
};

/**
 * La colonna di controllo: dove si sceglie **cosa** guardare.
 *
 * Sta a sinistra e resta stretta perché tutto quello che contiene è
 * secondario rispetto alla griglia: il mese per saltare, tre tendine per
 * restringere, la legenda per capire i colori, il riepilogo per il numero.
 * Nessuno dei quattro merita larghezza — il calendario sì.
 *
 * Sotto `xl` sparisce e i filtri ricompaiono in un pannello nella testata: a
 * 1200 px togliere 250 px al calendario vuol dire due giorni in meno
 * visibili, e i giorni sono il contenuto.
 */
export function BarraLaterale({
  vista,
  mese,
  giornoSelezionato,
  oggi,
  giorniVisibili,
  onSeleziona,
  onCambiaMese,
  filtri,
  onFiltri,
  ruoliDisponibili,
  repartiDisponibili,
  riepilogo,
  azione,
  compatta = false,
}: {
  /** Quale delle due facce è aperta: l'interruttore in cima lo dice. */
  vista: "persone" | "turni";
  mese: string;
  giornoSelezionato: string;
  oggi: string;
  giorniVisibili: string[];
  onSeleziona: (dateKey: string) => void;
  onCambiaMese: (delta: number) => void;
  filtri: FiltriStaff;
  onFiltri: (f: FiltriStaff) => void;
  ruoliDisponibili: { value: StaffPrimaryRole; label: string }[];
  repartiDisponibili: StaffDepartment[];
  riepilogo: Riepilogo;
  /** Il pulsante che crea qualcosa, sotto il calendario. Sta qui e non in una
   * barra sopra l'elenco perché quella barra conteneva solo lui e dei numeri
   * che questa colonna dà già — e toglierla fa cominciare l'elenco in cima
   * alla schermata. */
  azione?: ReactNode;
  /** Dentro il pannello della testata, sui formati stretti: niente
   * mini-calendario (le frecce ce le ha già la toolbar) e niente riepilogo. */
  compatta?: boolean;
}) {
  const sporchi = filtriAttivi(filtri);

  return (
    <div className={cn("flex flex-col gap-4", !compatta && "w-[252px] shrink-0")}>
      {/* L'interruttore in cima alla colonna, non in una testata sopra la
          pagina: da qui in giù tutto quello che c'è — mese, filtri, legenda —
          vale per tutte e due le viste, e questo dice quale si sta guardando.
          Sotto `xl` la colonna non c'è e l'interruttore ricompare nella
          testata (vedi le due pagine). */}
      {!compatta && <StaffSwitch vista={vista} giorno={giornoSelezionato} />}

      {!compatta && (
        <MiniMese
          mese={mese}
          selezionato={giornoSelezionato}
          oggi={oggi}
          settimana={giorniVisibili}
          onSeleziona={onSeleziona}
          onCambiaMese={onCambiaMese}
        />
      )}

      {!compatta && azione}

      <section>
        <header className="mb-2 flex items-center justify-between px-0.5">
          <h2 className="text-sm font-medium">Filtri</h2>
          {/* «Reset» è sempre lì, anche a filtri puliti. Comparire solo quando
              serve significa che nel momento in cui serve non si sa dov'è. */}
          <button
            type="button"
            onClick={() => onFiltri(FILTRI_VUOTI)}
            disabled={!sporchi}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        </header>

        <div className="space-y-2">
          <Select
            value={filtri.reparto}
            onValueChange={(v) => onFiltri({ ...filtri, reparto: v as FiltriStaff["reparto"] })}
          >
            <SelectTrigger aria-label="Filtra per reparto" className="h-10 rounded-lg">
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i reparti</SelectItem>
              {STAFF_DEPARTMENTS.filter((d) => repartiDisponibili.includes(d.key)).map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Solo i ruoli che **esistono** in questo organico: la tendina con
              tutti e sedici sarebbe lunga il doppio dello schermo e quattordici
              voci non filtrerebbero niente. */}
          <Select value={filtri.ruolo} onValueChange={(v) => onFiltri({ ...filtri, ruolo: v as FiltriStaff["ruolo"] })}>
            <SelectTrigger aria-label="Filtra per ruolo" className="h-10 rounded-lg">
              <span className="flex min-w-0 items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i ruoli</SelectItem>
              {ruoliDisponibili.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtri.stato} onValueChange={(v) => onFiltri({ ...filtri, stato: v as FiltriStaff["stato"] })}>
            <SelectTrigger aria-label="Filtra per stato" className="h-10 rounded-lg">
              <span className="flex min-w-0 items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {STATI_FILTRO.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/*
        La legenda sta dove i colori si vedono, cioè solo nel calendario.

        Nell'elenco delle persone non c'è niente di colorato da spiegare: una
        legenda che descrive tinte assenti dallo schermo è la stessa cosa di
        una voce «Bar» in un locale senza bar — insegna a non leggerla.
      */}
      {vista === "turni" && (
      <section>
        {/*
          La legenda elenca **solo i reparti che esistono in questo locale**.

          Con tutti e cinque sempre presenti, in un ristorante senza bar e
          senza direzione due righe su sei parlavano di colori che nel
          calendario non compaiono mai — e una legenda che descrive cose
          assenti insegna a non leggerla. Riposo e assenza invece ci sono
          sempre: sono stati, non reparti.
        */}
        <ul className="space-y-2 px-0.5">
          {[...ORDINE_REPARTI.filter((d) => repartiDisponibili.includes(d)).map((d) => FAMIGLIA_REPARTO[d]), "riposo" as const, "assenza" as const].map(
            (f) => (
              <li key={f} className="flex items-center gap-2.5">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PALLINO_LEGENDA[f])} aria-hidden="true" />
                <span className="text-xs text-foreground/80">{FAMIGLIE[f].label}</span>
              </li>
            ),
          )}
        </ul>
      </section>
      )}

      {!compatta && (
        <section className="riquadro bg-card/40 p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {riepilogo.totale} {riepilogo.totale === 1 ? "membro staff" : "membri staff"}
          </p>

          {/* I tre numeri parlano del **giorno selezionato**, non di un «oggi»
              generico: aprendo la settimana prossima, «8 in turno oggi» sarebbe
              un numero vero riferito a una schermata che mostra altro. */}
          <p className="t-nota mt-0.5">
            {riepilogo.eOggi ? "Oggi" : <span className="capitalize">{etichettaGiornoBreve(riepilogo.giorno)}</span>}
          </p>

          <dl className="mt-3 space-y-1.5">
            <VoceRiepilogo valore={riepilogo.inTurno} etichetta="In turno oggi" mostraOggi={riepilogo.eOggi} />
            <VoceRiepilogo valore={riepilogo.assenti} etichetta="Assenti" mostraOggi />
            <VoceRiepilogo valore={riepilogo.liberi} etichetta="Giorni liberi" mostraOggi />
          </dl>

          <Link
            href="/staff"
            className="group mt-3.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Vedi dettagli
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}

function VoceRiepilogo({
  valore,
  etichetta,
  mostraOggi,
}: {
  valore: number;
  etichetta: string;
  mostraOggi: boolean;
}) {
  const testo = mostraOggi ? etichetta : etichetta.replace(" oggi", "");
  return (
    <div className="flex items-baseline gap-2">
      <dt className="sr-only">{testo}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="w-4 text-sm font-semibold tabular-nums">{valore}</span>
        <span className="text-xs text-muted-foreground">{testo}</span>
      </dd>
    </div>
  );
}
