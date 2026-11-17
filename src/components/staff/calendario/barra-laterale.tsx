"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CircleDot, RotateCcw, Users } from "lucide-react";
import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MiniMese } from "@/components/staff/calendario/mini-mese";
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
 * restringere, il riepilogo per il numero. Nessuno dei tre merita larghezza —
 * il calendario sì. La legenda dei reparti non sta qui: vedi `LegendaReparti`.
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
  vista: "persone" | "turni" | "richieste";
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
          pagina: da qui in giù tutto quello che c'è — mese e filtri —
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

      {!compatta && (
        <RiquadroRiepilogo riepilogo={riepilogo} />
      )}
    </div>
  );
}

/**
 * Com'è fatta la brigata nel giorno selezionato.
 *
 * Era una colonna di tre «0» con un'etichetta accanto: numeri giusti, ma da
 * leggere uno a uno e senza un rapporto col totale. Ora il numero che conta —
 * quanti lavorano — è grande e messo contro l'organico («8 su 13»), e una
 * barra divisa mostra in un colpo d'occhio come si spartisce il resto. Gli
 * stessi colori del calendario (riposo, assenza), così la chiave è una sola.
 *
 * «Senza turno» è il resto: chi quel giorno non ha nessuna riga. Prima non
 * compariva, e i tre numeri sommati non tornavano mai col totale.
 */
function RiquadroRiepilogo({ riepilogo }: { riepilogo: Riepilogo }) {
  const { totale, inTurno, assenti, liberi } = riepilogo;
  const daPianificare = Math.max(0, totale - inTurno - assenti - liberi);
  // Chi fa due turni nello stesso giorno conta due volte: la barra si misura
  // sulla somma se la somma supera l'organico, così non trabocca.
  const base = Math.max(1, totale, inTurno + assenti + liberi);

  const voci = [
    { chiave: "turno", valore: inTurno, etichetta: "In turno", colore: "bg-[hsl(var(--turno-sala))]" },
    { chiave: "assenti", valore: assenti, etichetta: "Assenti", colore: "bg-[hsl(var(--turno-assenza))]" },
    { chiave: "liberi", valore: liberi, etichetta: "Riposo", colore: "bg-[hsl(var(--turno-riposo))]" },
    {
      chiave: "vuoti",
      valore: daPianificare,
      etichetta: "Senza turno",
      colore: "bg-[hsl(var(--border-strong)/0.35)]",
    },
  ];

  return (
    <section className="riquadro bg-card/40 p-3.5">
      <header className="flex items-center justify-between gap-2">
        {/* I numeri parlano del **giorno selezionato**, non di un «oggi»
            generico: aprendo la settimana prossima, «8 in turno oggi» sarebbe
            un numero vero riferito a una schermata che mostra altro. */}
        <p className="t-nota">
          {riepilogo.eOggi ? "Oggi" : <span className="capitalize">{etichettaGiornoBreve(riepilogo.giorno)}</span>}
        </p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {totale}
          <span className="sr-only">{totale === 1 ? " membro staff" : " membri staff"}</span>
        </span>
      </header>

      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-display text-3xl leading-none tabular-nums">{inTurno}</span>
        <span className="text-sm text-muted-foreground">
          su {totale} in turno
        </span>
      </p>

      <div
        className="mt-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={voci.map((v) => `${v.valore} ${v.etichetta.toLowerCase()}`).join(", ")}
      >
        {voci
          .filter((v) => v.valore > 0)
          .map((v) => (
            <span
              key={v.chiave}
              className={cn("h-full transition-[width] duration-300", v.colore)}
              style={{ width: `${(v.valore / base) * 100}%` }}
            />
          ))}
        {totale === 0 && <span className="h-full w-full bg-[hsl(var(--border-strong)/0.2)]" />}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {voci.map((v) => (
          <div key={v.chiave} className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", v.colore)} aria-hidden="true" />
            <dt className={cn("min-w-0 flex-1 truncate", v.valore === 0 ? "text-tertiary-foreground" : "text-foreground/80")}>
              {v.etichetta}
            </dt>
            <dd
              className={cn(
                "tabular-nums",
                v.valore === 0 ? "text-tertiary-foreground" : "font-semibold text-foreground",
              )}
            >
              {v.valore}
            </dd>
          </div>
        ))}
      </dl>

      <Link
        href="/staff"
        className="group mt-3 flex items-center gap-1 border-t border-border/60 pt-2.5 text-xs [@media(max-height:820px)]:hidden text-muted-foreground transition-colors hover:text-foreground"
      >
        Vedi dettagli
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
