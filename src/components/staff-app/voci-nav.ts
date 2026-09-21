import { CalendarDays, ClipboardList, FileText, Home, LayoutGrid, User } from "lucide-react";
import type { PermessoStaff, ProfiloStaff } from "@/lib/permessi-staff";

/**
 * **La barra in basso della Staff App.**
 *
 * §2 del brief: bottom navigation fissa, massimo cinque voci, nessun menu
 * hamburger. Le regole che questo file fa rispettare:
 *
 * - **cinque voci al massimo**, e non è un'aspirazione: `vociPer()` taglia.
 *   A sei voci su 375 px ogni bersaglio scende sotto i 60 px di larghezza, e
 *   un pollice in movimento ne sbaglia una su cinque;
 * - **niente «Altro»**. La barra del back office ha una tendina per le voci
 *   che non ci stanno; qui non ci sono voci che non ci stanno, perché la
 *   Staff App ha cinque sezioni in tutto. Una tendina sarebbe un livello di
 *   navigazione in più su un prodotto che ne deve avere pochi (§principio);
 * - **le voci dipendono dal profilo e dai permessi**, non da una `if` nel
 *   componente. Il cameriere ha Home / Sala / Comande / Turni / Profilo; lo
 *   chef ha Home / Turni / Documenti / Profilo — quattro, e la barra si
 *   distribuisce su quattro invece di lasciare un buco.
 *
 * La navigazione **rispecchia** i permessi, non li applica: chi scrive a mano
 * `/staff-app/sala` senza `view_tables` viene rimandato dalla pagina, non
 * salvato dal fatto che non vedeva il bottone.
 */

export type VoceStaff = {
  href: string;
  label: string;
  /* `strokeWidth` sta nel tipo perché la barra le disegna più sottili di
     quanto Lucide faccia per difetto: a 28 px il tratto da 2 px sembra
     grassetto accanto al testo. È `string | number` perché quello accetta
     Lucide, e restringerlo a `number` qui basta a far rifiutare ogni icona. */
  icon: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  /** Percorsi che tengono la voce accesa pur non essendo l'href. */
  prefissi?: string[];
  /** Senza questo permesso la voce non compare. */
  permesso?: PermessoStaff;
};

const HOME: VoceStaff = { href: "/staff-app", label: "Home", icon: Home };

const SALA: VoceStaff = {
  href: "/staff-app/sala",
  label: "Sala",
  icon: LayoutGrid,
  /* Il tavolo aperto tiene accesa «Sala»: è da lì che ci si arriva, ed è lì
     che il pulsante indietro riporta. */
  prefissi: ["/staff-app/tavolo"],
  permesso: "view_tables",
};

const COMANDE: VoceStaff = {
  href: "/staff-app/comande",
  label: "Comande",
  icon: ClipboardList,
  permesso: "view_kitchen_status",
};

const TURNI: VoceStaff = {
  href: "/staff-app/turni",
  label: "Turni",
  icon: CalendarDays,
  permesso: "view_own_shifts",
};

const DOCUMENTI: VoceStaff = {
  href: "/staff-app/documenti",
  label: "Documenti",
  icon: FileText,
  permesso: "view_own_documents",
};

const PROFILO: VoceStaff = { href: "/staff-app/profilo", label: "Profilo", icon: User };

/**
 * Le voci di un profilo, già filtrate sui permessi e già tagliate a cinque.
 *
 * L'ordine non è casuale ed è quello della frequenza d'uso durante un turno:
 * si apre la Home una volta, la Sala cinquanta, le Comande venti. Profilo in
 * fondo perché ci si va una volta al mese — ma c'è, e in barra, perché
 * nasconderlo dietro un menu significherebbe che chi cerca la scadenza del
 * proprio contratto non la trova.
 *
 * ## Perché i turni non sono in barra, per chi sta in sala
 *
 * Erano la quarta voce di cinque. Un turno si guarda **una volta al giorno,
 * prima di uscire di casa** — e quella volta lo si legge già in Home, nella
 * card in cima. In barra occupava un quinto della larghezza del pollice per
 * una cosa che durante il servizio non si apre mai.
 *
 * Adesso sta dentro Profilo, con i documenti: sono le due cose che riguardano
 * **il rapporto di lavoro** e non il servizio, e stanno bene nello stesso
 * posto. Il percorso `/staff-app/turni` non cambia, quindi i link già mandati
 * continuano ad aprirsi.
 *
 * **In cucina resta in barra**, e non è un'incoerenza: per uno chef i turni
 * non sono un accessorio del servizio, sono quasi tutto il prodotto. La barra
 * porta quello che si usa, e cosa si usa dipende dal mestiere.
 */
export function vociPer(profilo: ProfiloStaff, permessi: readonly PermessoStaff[]): VoceStaff[] {
  const candidate =
    profilo === "CUCINA" ? [HOME, TURNI, DOCUMENTI, PROFILO] : [HOME, SALA, COMANDE, PROFILO];

  return candidate.filter((v) => !v.permesso || permessi.includes(v.permesso)).slice(0, 5);
}

/**
 * Le voci che, per questo profilo, **non** stanno in barra e vanno offerte
 * dentro Profilo.
 *
 * Si calcola per differenza invece di essere un secondo elenco scritto a
 * mano: così il giorno in cui una voce entra o esce dalla barra, il posto in
 * cui ricompare si aggiorna da solo. Due liste separate sarebbero la solita
 * copia che diverge al primo cambiamento — o peggio, una voce che sparisce da
 * tutte e due.
 */
export function vociDentroProfilo(
  profilo: ProfiloStaff,
  permessi: readonly PermessoStaff[],
): VoceStaff[] {
  const inBarra = new Set(vociPer(profilo, permessi).map((v) => v.href));
  return [TURNI, DOCUMENTI].filter(
    (v) => !inBarra.has(v.href) && (!v.permesso || permessi.includes(v.permesso)),
  );
}

/** Vero se il percorso corrente accende questa voce. */
export function voceAttiva(percorso: string, voce: VoceStaff): boolean {
  if (voce.href === "/staff-app") return percorso === "/staff-app";
  if (percorso === voce.href || percorso.startsWith(`${voce.href}/`)) return true;
  return (voce.prefissi ?? []).some((p) => percorso === p || percorso.startsWith(`${p}/`));
}
