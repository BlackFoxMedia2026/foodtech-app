import { BedDouble, Briefcase, ChefHat, CircleSlash2, FileText, Martini, Plane, Thermometer, UtensilsCrossed } from "lucide-react";
import type { StaffDepartment, WorkShiftKind } from "@prisma/client";
import type { FamigliaTurno } from "@/lib/turni-calendario";

/**
 * Il vestito delle famiglie, in un posto solo.
 *
 * Le classi sono scritte **per esteso** e non composte a runtime: Tailwind
 * legge i sorgenti come testo, e una classe costruita con un template
 * (`` `bg-[hsl(var(--turno-${f})/0.17)]` ``) non finisce nel foglio di stile.
 * È il motivo per cui qui c'è ripetizione: è ripetizione che il compilatore
 * pretende.
 *
 * Il bordo è **pieno e visibile su tutti e quattro i lati**, non una barretta
 * a sinistra: le card occupano la colonna intera e stanno impilate, quindi è
 * il perimetro a dire dove finisce una e comincia la prossima.
 */
export const FAMIGLIE: Record<
  FamigliaTurno,
  {
    /** Come si chiama nella legenda. */
    label: string;
    carta: string;
    /** Lo stesso, un gradino più acceso: `hover` e card in movimento. */
    cartaAccesa: string;
    /** Il pallino della legenda e il bordo dell'avatar. */
    pastiglia: string;
    /** Il colore quando è testo (icona di un'assenza, etichetta). */
    testo: string;
  }
> = {
  sala: {
    label: "Sala",
    carta: "border-[hsl(var(--turno-sala)/0.5)] bg-[hsl(var(--turno-sala)/0.17)]",
    cartaAccesa: "border-[hsl(var(--turno-sala)/0.8)] bg-[hsl(var(--turno-sala)/0.26)]",
    pastiglia: "border-[hsl(var(--turno-sala)/0.6)] bg-[hsl(var(--turno-sala)/0.35)]",
    testo: "text-[hsl(var(--turno-sala))]",
  },
  cucina: {
    label: "Cucina",
    carta: "border-[hsl(var(--turno-cucina)/0.5)] bg-[hsl(var(--turno-cucina)/0.17)]",
    cartaAccesa: "border-[hsl(var(--turno-cucina)/0.8)] bg-[hsl(var(--turno-cucina)/0.26)]",
    pastiglia: "border-[hsl(var(--turno-cucina)/0.6)] bg-[hsl(var(--turno-cucina)/0.35)]",
    testo: "text-[hsl(var(--turno-cucina))]",
  },
  bar: {
    label: "Bar",
    // Un punto di riempimento in più degli altri: è l'unica tinta che compete
    // con un fondo verde, e le serve per staccarsene.
    carta: "border-[hsl(var(--turno-bar)/0.55)] bg-[hsl(var(--turno-bar)/0.2)]",
    cartaAccesa: "border-[hsl(var(--turno-bar)/0.8)] bg-[hsl(var(--turno-bar)/0.26)]",
    pastiglia: "border-[hsl(var(--turno-bar)/0.6)] bg-[hsl(var(--turno-bar)/0.35)]",
    testo: "text-[hsl(var(--turno-bar))]",
  },
  direzione: {
    label: "Direzione",
    carta: "border-[hsl(var(--turno-direzione)/0.5)] bg-[hsl(var(--turno-direzione)/0.17)]",
    cartaAccesa: "border-[hsl(var(--turno-direzione)/0.8)] bg-[hsl(var(--turno-direzione)/0.26)]",
    pastiglia: "border-[hsl(var(--turno-direzione)/0.6)] bg-[hsl(var(--turno-direzione)/0.35)]",
    testo: "text-[hsl(var(--turno-direzione))]",
  },
  altro: {
    label: "Altro",
    carta: "border-[hsl(var(--turno-altro)/0.45)] bg-[hsl(var(--turno-altro)/0.14)]",
    cartaAccesa: "border-[hsl(var(--turno-altro)/0.7)] bg-[hsl(var(--turno-altro)/0.22)]",
    pastiglia: "border-[hsl(var(--turno-altro)/0.55)] bg-[hsl(var(--turno-altro)/0.32)]",
    testo: "text-[hsl(var(--turno-altro))]",
  },
  riposo: {
    label: "Riposo",
    carta: "border-[hsl(var(--turno-riposo)/0.4)] bg-[hsl(var(--turno-riposo)/0.12)]",
    cartaAccesa: "border-[hsl(var(--turno-riposo)/0.65)] bg-[hsl(var(--turno-riposo)/0.2)]",
    pastiglia: "border-[hsl(var(--turno-riposo)/0.5)] bg-[hsl(var(--turno-riposo)/0.3)]",
    testo: "text-[hsl(var(--turno-riposo))]",
  },
  assenza: {
    label: "Ferie / Permesso",
    carta: "border-[hsl(var(--turno-assenza)/0.5)] bg-[hsl(var(--turno-assenza)/0.16)]",
    cartaAccesa: "border-[hsl(var(--turno-assenza)/0.8)] bg-[hsl(var(--turno-assenza)/0.24)]",
    pastiglia: "border-[hsl(var(--turno-assenza)/0.6)] bg-[hsl(var(--turno-assenza)/0.32)]",
    testo: "text-[hsl(var(--turno-assenza))]",
  },
};

/** Il pallino pieno della legenda: un colore, senza trasparenza, perché deve
 * essere riconoscibile a fianco di una parola e non dentro una card. */
export const PALLINO_LEGENDA: Record<FamigliaTurno, string> = {
  sala: "bg-[hsl(var(--turno-sala))]",
  cucina: "bg-[hsl(var(--turno-cucina))]",
  bar: "bg-[hsl(var(--turno-bar))]",
  direzione: "bg-[hsl(var(--turno-direzione))]",
  altro: "bg-[hsl(var(--turno-altro))]",
  riposo: "bg-[hsl(var(--turno-riposo))]",
  assenza: "bg-[hsl(var(--turno-assenza))]",
};

/** La famiglia di un reparto, per costruire la legenda partendo dai reparti
 * che in questo locale esistono davvero. */
export const FAMIGLIA_REPARTO: Record<StaffDepartment, FamigliaTurno> = {
  SALA: "sala",
  CUCINA: "cucina",
  BAR: "bar",
  DIREZIONE: "direzione",
  ALTRO: "altro",
};

/** L'ordine in cui i reparti compaiono nella legenda: sala e cucina per
 * prime, che sono il novanta per cento delle card. */
export const ORDINE_REPARTI: StaffDepartment[] = ["SALA", "CUCINA", "BAR", "DIREZIONE", "ALTRO"];

/**
 * L'icona di un'assenza.
 *
 * Il colore da solo non basta a distinguere ferie da malattia — sono la
 * stessa famiglia, ed è giusto che lo siano: chi guarda il calendario deve
 * prima vedere «non c'è», e solo dopo perché. L'icona è il «perché», ed è
 * anche quello che rende leggibile la casella a chi non distingue i rossi.
 */
const ICONE: Partial<Record<WorkShiftKind, typeof BedDouble>> = {
  REST: BedDouble,
  UNAVAILABLE: CircleSlash2,
  VACATION: Plane,
  LEAVE: FileText,
  SICK_LEAVE: Thermometer,
};

export function IconaTipoTurno({ kind, className }: { kind: WorkShiftKind; className?: string }) {
  const Icona = ICONE[kind];
  if (!Icona) return null;
  return <Icona className={className} aria-hidden="true" />;
}

/**
 * L'icona del reparto, in fondo alla card.
 *
 * Con il colore che adesso *è* il reparto, l'icona sembrerebbe un doppione. Non
 * lo è: è la stessa informazione detta in una forma che non dipende dal colore,
 * e circa un uomo su dodici non distingue il rosso dal verde. Quello che per
 * qualcuno è «la colonna blu» per qualcun altro deve restare «le card con la
 * forchetta».
 */
const ICONE_REPARTO: Record<StaffDepartment, typeof ChefHat> = {
  SALA: UtensilsCrossed,
  CUCINA: ChefHat,
  BAR: Martini,
  DIREZIONE: Briefcase,
  ALTRO: UtensilsCrossed,
};

export function IconaReparto({ department, className }: { department: StaffDepartment; className?: string }) {
  const Icona = ICONE_REPARTO[department];
  return <Icona className={className} aria-hidden="true" />;
}
