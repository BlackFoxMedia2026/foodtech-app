import { CalendarRange, CreditCard, LayoutDashboard, LayoutPanelTop, LineChart, ListOrdered, Megaphone, Radio, Settings, Sparkles, UserRound, UtensilsCrossed } from "lucide-react";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Etichetta più corta per la barra in basso, **solo quando è la stessa
   * parola abbreviata**.
   *
   * Prima qui c'erano nomi diversi: la Panoramica si chiamava «Oggi» e il
   * Servizio «Ora». Erano più belli e creavano **due vocabolari** — chi
   * imparava il prodotto su un tablet e poi lo usava sul telefono cercava
   * «Servizio» e trovava «Ora». Un nome per funzione, su tutti gli schermi:
   * lo dice l'audit visivo, ed è la cosa che costa meno di tutte.
   */
  shortLabel?: string;
  /** Percorsi aggiuntivi che contano come "attivo" anche se l'href non corrisponde
   * — es. Marketing resta evidenziata dentro /campaigns/*, rimasto al suo path per
   * non rompere il wizard esistente. */
  matchPrefixes?: string[];
  /**
   * Il gruppo dentro «Altro».
   *
   * Sette voci in fila, tutte con la stessa importanza, si leggono una per
   * una fino a trovare quella giusta. Divise in tre gruppetti con
   * un'etichetta, l'occhio salta direttamente alla parte che c'entra: «il
   * locale» sono le cose da configurare, «crescita» quelle da guardare,
   * «sistema» quelle che non riguardano il ristorante.
   */
  gruppo?: GruppoSecondario;
};

export type GruppoSecondario = "locale" | "crescita" | "sistema";

export const GRUPPI_SECONDARI: { key: GruppoSecondario; label: string }[] = [
  { key: "locale", label: "Il locale" },
  { key: "crescita", label: "Crescita" },
  { key: "sistema", label: "Sistema" },
];

/**
 * Le voci in due gruppi, e il criterio è una domanda sola: **serve mentre il
 * servizio è aperto?**
 *
 * Le prime sei sono i gesti di una serata: guardare la giornata, vedere chi
 * viene, sistemare la sala, gestire chi aspetta, sapere chi è in turno,
 * cercare un cliente. Le altre sono lavoro da ufficio, che si fa la mattina
 * dopo — e stanno sotto «Altro».
 *
 * Non è solo una questione di gusto: con dieci voci tutte in fila la barra non
 * ci stava più nemmeno a 1440 px, e «Analytics» finiva tagliata sotto la sfera
 * dell'agente.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Panoramica", icon: LayoutDashboard },
  { href: "/service", label: "Servizio", icon: Radio },
  { href: "/bookings", label: "Prenotazioni", shortLabel: "Prenot.", icon: CalendarRange },
  /*
    «Sala» porta alla sala **viva**, non all'editor.

    Fino al 9 settembre questa voce puntava a `/floor`, che è la pagina dove si
    aggiungono, si rinominano, si spostano e si cancellano i tavoli. La sala
    viva — sette stati per tavolo, chi è seduto, il conto aperto, fra quanto si
    libera — stava a `/service/room`, dentro Servizio, e non aveva nessuna
    voce di navigazione.

    Quindi alle 21:15 di sabato la domanda «dove metto questa persona?» — la
    seconda più frequente di una serata — si rispondeva con un gesto che
    portava a un editor di piantine. Non era una preferenza discutibile: era
    una destinazione sbagliata.

    L'editor è configurazione: si fa una volta e si ritocca quando cambia
    l'arredamento. Sta sotto «Altro», nel gruppo «Il locale», con le altre cose
    che si preparano prima del servizio.
  */
  { href: "/service/room", label: "Sala", icon: DiningTableIcon },
  { href: "/waitlist", label: "Attesa", icon: ListOrdered },
  { href: "/guests", label: "Ospiti", icon: TuxedoGuestIcon },
];

export const SECONDARY_NAV: NavItem[] = [
  // I camerieri si configurano prima del servizio, non durante: da qui in poi
  // e' lavoro da ufficio, e la barra ha spazio per sei voci, non per sette.
  { href: "/floor", label: "Piantina", icon: LayoutPanelTop, gruppo: "locale" },
  { href: "/waiters", label: "Camerieri", icon: UserRound, gruppo: "locale" },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, gruppo: "locale" },
  { href: "/experiences", label: "Esperienze", icon: Sparkles, gruppo: "locale" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, matchPrefixes: ["/campaigns"], gruppo: "crescita" },
  { href: "/insights", label: "Analytics", icon: LineChart, gruppo: "crescita" },
  { href: "/payments", label: "Pagamenti", icon: CreditCard, gruppo: "sistema" },
  { href: "/settings", label: "Impostazioni", icon: Settings, gruppo: "sistema" },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

/**
 * Le quattro voci della barra in basso su telefono.
 *
 * Cambiata il 9 settembre: **Prenotazioni entra al posto di Attesa**, e la
 * ragione non è estetica.
 *
 * 1. `RECEPTION` e `WAITER` hanno entrambi `manage_bookings` e nient'altro
 *    (matrice in `lib/abilities.ts`): le prenotazioni sono l'unica cosa che
 *    possono fare tutti e due, e la si apre venti volte al giorno per
 *    rispondere al telefono.
 * 2. La coda **è già in Servizio**, che è al secondo posto: la schermata ha
 *    tre zone e la terza è «Attesa», con i gruppi e le azioni. Chi è in
 *    servizio non passa da `/waitlist`: ce l'ha davanti.
 * 3. Una vista delle prenotazioni del giorno dentro Servizio non esiste.
 *
 * Attesa non esce dal prodotto: resta sotto «Altro» e dentro Servizio.
 */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0], // Panoramica
  PRIMARY_NAV[1], // Servizio — durante il servizio è la schermata madre
  PRIMARY_NAV[2], // Prenotazioni
  PRIMARY_NAV[3], // Sala (viva)
];

/** Vero se questo percorso sta sotto questo indirizzo. */
function sottoA(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Quale voce è accesa — e vince **la corrispondenza più lunga**.
 *
 * Serve da quando «Sala» punta a `/service/room`: per prefisso quel percorso
 * sta anche sotto `/service`, quindi si accendevano due voci insieme e la
 * navigazione diceva due cose diverse nello stesso momento.
 *
 * La regola generale invece di un'eccezione scritta a mano su «Servizio»:
 * se un'altra voce corrisponde con un indirizzo più lungo, è la sua. Così
 * aggiungere domani una sottopagina a una voce esistente non richiede di
 * ricordarsi di venire a scrivere un'esclusione qui.
 */
export function isNavActive(pathname: string, item: NavItem) {
  const proprio = sottoA(pathname, item.href)
    ? item.href
    : item.matchPrefixes?.find((p) => sottoA(pathname, p));
  if (!proprio) return false;

  return !ALL_NAV.some((altra) => {
    if (altra.href === item.href) return false;
    const suo = sottoA(pathname, altra.href)
      ? altra.href
      : altra.matchPrefixes?.find((p) => sottoA(pathname, p));
    return suo !== undefined && suo.length > proprio.length;
  });
}

/** Le voci di «Altro», raggruppate e nell'ordine dei gruppi. */
export function secondarioPerGruppo(): { label: string; voci: NavItem[] }[] {
  return GRUPPI_SECONDARI.map((g) => ({
    label: g.label,
    voci: SECONDARY_NAV.filter((v) => v.gruppo === g.key),
  })).filter((g) => g.voci.length > 0);
}
