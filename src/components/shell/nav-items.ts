import { CalendarRange, CreditCard, LayoutDashboard, LineChart, ListOrdered, Megaphone, Radio, Settings, Sparkles, Users, UtensilsCrossed } from "lucide-react";
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
   * Il gruppo dentro il menu del profilo.
   *
   * Un elenco piatto di voci amministrative si legge una per una fino a
   * trovare quella giusta. Diviso in due gruppetti con un'etichetta, l'occhio
   * salta direttamente alla parte che c'entra: «gestione» è il ristorante che
   * cresce, «account» è chi sta usando il prodotto.
   */
  gruppo?: GruppoProfilo;
};

export type GruppoProfilo = "gestione" | "account";

export const GRUPPI_PROFILO: { key: GruppoProfilo; label: string }[] = [
  { key: "gestione", label: "Gestione" },
  { key: "account", label: "Account" },
];

/**
 * La barra centrale: **soltanto ciò che si tocca a servizio aperto**.
 *
 * Il criterio è una domanda sola — «lo apro mentre il locale lavora?». Le
 * prime sette voci sono i gesti di una serata: guardare la giornata, stare
 * sul servizio, rispondere al telefono, sistemare la sala, cercare un
 * cliente, sapere chi è in turno, controllare un piatto. Marketing è
 * l'eccezione voluta: non è un gesto di servizio, ma è salita in barra su
 * richiesta esplicita, spostata dal menu del profilo.
 *
 * Tutto il resto — esperienze, analisi, incassi, impostazioni — è lavoro da
 * ufficio, che si fa la mattina dopo: sta nel menu del profilo
 * (`PROFILE_NAV`), che è il posto delle cose che si aprono una volta a
 * settimana. Il dropdown «Altro» in mezzo alla barra non esiste più: era un
 * terzo posto dove guardare, con dentro sia roba quotidiana (Staff, Menu) sia
 * roba amministrativa, cioè esattamente la confusione che questa divisione
 * toglie.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Panoramica", icon: LayoutDashboard },
  { href: "/service", label: "Servizio", icon: Radio },
  { href: "/bookings", label: "Prenotazioni", shortLabel: "Prenot.", icon: CalendarRange },
  /*
    «Sala» è la sala di `/floor`, e ci resta.

    Il 9 settembre questa voce l'avevo spostata su `/service/room` — la sala
    viva dentro Servizio — con l'argomento che `/floor` è anche l'editor dei
    tavoli, e che alle 21:15 di sabato «dove metto questa persona?» non si
    risponde con un editor di piantine.

    L'argomento era sbagliato su un fatto: `/floor` **non** è un editor. È la
    sala vera, quella disegnata con i tavoli in pianta, i posti, chi copre
    quale tavolo, il turno e la data — e l'editor è una cosa che si apre da
    lì. Spostare la voce ha portato «Sala» su una vista a riquadri che dice
    meno e assomiglia poco al locale, e ha spinto la sala vera sotto «Altro».

    Rimessa dov'era. La sala viva resta dove stava anche prima: dentro
    Servizio, con la linguetta «Sala».
  */
  { href: "/floor", label: "Sala", icon: DiningTableIcon },
  { href: "/guests", label: "Ospiti", icon: TuxedoGuestIcon },
  /*
    «Staff», non più «Camerieri».

    Il nome vecchio descriveva metà della pagina: lì dentro ci sono i ruoli di
    cucina, i reparti, i contratti e i turni, cioè gente che in sala non ci va
    mai. E la pagina si apre **durante** il servizio — «chi è in turno
    stasera, chi copre quali tavoli» è la prima fascia della schermata — quindi
    sta in barra, non fra le cose amministrative.

    L'icona cambia con il nome: `Users` è un gruppo di persone, `UserRound` era
    la singola persona ed è la stessa silhouette di «Ospiti», che ora le sta
    accanto in barra. Due sagome identiche a due voci di distanza non sono
    un'icona, sono una macchia.

    Il percorso è `/staff`, con `/waiters` che reindirizza: i link già mandati
    per i contratti in scadenza continuano ad aprirsi.
  */
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/marketing", label: "Marketing", icon: Megaphone, matchPrefixes: ["/campaigns"] },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
];

/**
 * Il menu del profilo: configurazione, crescita, amministrazione.
 *
 * Non è «il resto»: è un secondo piano di navigazione con un criterio suo —
 * le cose che si aprono a locale chiuso. Sta sotto l'avatar perché è lì che
 * chiunque cerca le impostazioni, e perché tenere queste voci fuori dalla
 * barra è tutto il punto della divisione.
 */
export const PROFILE_NAV: NavItem[] = [
  { href: "/experiences", label: "Esperienze", icon: Sparkles, gruppo: "gestione" },
  { href: "/insights", label: "Analytics", icon: LineChart, gruppo: "gestione" },
  { href: "/payments", label: "Pagamenti", icon: CreditCard, gruppo: "gestione" },
  /*
    «Attesa» non è nelle sette, e non è nemmeno una funzione amministrativa:
    è qui perché la coda **è già dentro Servizio**, che è la seconda voce
    della barra. La schermata del servizio ha tre zone e la terza è l'attesa,
    con i gruppi e le azioni: chi è in sala non passa da `/waitlist`, ce l'ha
    davanti. Questa voce resta perché la pagina esiste e deve avere una casa
    — non perché sia il modo previsto di arrivarci.
  */
  { href: "/waitlist", label: "Attesa", icon: ListOrdered, gruppo: "gestione" },
  { href: "/settings", label: "Impostazioni", icon: Settings, gruppo: "account" },
];

export const ALL_NAV = [...PRIMARY_NAV, ...PROFILE_NAV];

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
 */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0], // Panoramica
  PRIMARY_NAV[1], // Servizio — durante il servizio è la schermata madre
  PRIMARY_NAV[2], // Prenotazioni
  PRIMARY_NAV[3], // Sala
];

/** Vero se questo percorso sta sotto questo indirizzo. */
function sottoA(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Quale voce è accesa — e vince **la corrispondenza più lunga**.
 *
 * È servita quando «Sala» puntava a `/service/room`: per prefisso quel
 * percorso sta anche sotto `/service`, quindi si accendevano due voci insieme
 * e la navigazione diceva due cose diverse nello stesso momento. La regola
 * resta perché vale in generale — domani una sottopagina di una voce
 * esistente non richiede di venire a scrivere un'eccezione qui.
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

/** Le voci del menu profilo, raggruppate e nell'ordine dei gruppi. */
export function profiloPerGruppo(): { label: string; voci: NavItem[] }[] {
  return GRUPPI_PROFILO.map((g) => ({
    label: g.label,
    voci: PROFILE_NAV.filter((v) => v.gruppo === g.key),
  })).filter((g) => g.voci.length > 0);
}

/** Le voci principali che non stanno nella barra in basso del telefono. */
export function primarieFuoriDallaBarra(): NavItem[] {
  return PRIMARY_NAV.filter((v) => !MOBILE_NAV.includes(v));
}

/**
 * Il titolo di una pagina: **per intero** e **abbreviato**.
 *
 * Due misure per lo stesso nome, come per le voci in barra: sul telefono, fra
 * il marchio del locale e le quattro icone a destra, restano meno di cento
 * pixel, e «Prenotazioni» ci finisce dentro con i puntini. La parola
 * accorciata è sempre **la stessa parola** — mai un sinonimo — altrimenti si
 * torna ai due vocabolari che la barra in basso ha già smesso di avere.
 */
export type TitoloPagina = { lungo: string; breve: string };

/**
 * I titoli delle pagine che **non** hanno una voce di navigazione tutta loro,
 * o che ne hanno una che direbbe la cosa sbagliata.
 *
 * Le pagine di dettaglio — un ospite, una prenotazione, una campagna — non
 * stanno qui di proposito: lì il titolo è il nome di chi si sta guardando,
 * lo scrive la pagina, e la testata dice la sezione da cui si viene.
 */
const TITOLI_EXTRA: Record<string, string | [lungo: string, breve: string]> = {
  "/bookings/new": ["Nuova prenotazione", "Nuova prenot."],
  "/guests/doppioni": ["Possibili doppioni", "Doppioni"],
  "/staff/turni": "Turni",
  "/settings/brand": "Brand",
  "/settings/wifi": ["Portale Wi-Fi", "Wi-Fi"],
  "/marketing/automations": "Automazioni",
  "/marketing/coupons": "Coupon",
  "/marketing/gift-cards": "Gift card",
  "/marketing/qr-codes": "QR Code",
  "/marketing/wifi": "Wi-Fi",
  "/campaigns": "Campagne",
  "/campaigns/new": ["Nuova campagna", "Nuova camp."],
};

/**
 * Il titolo della pagina, **per la testata**.
 *
 * Il titolo non sta più in cima al contenuto: sta accanto al marchio del
 * locale, e scivola via quando si apre il selettore dei locali. Una riga in
 * meno su ogni schermata, e su quelle operative quella riga era la prima
 * prenotazione che non si vedeva.
 *
 * Vince la corrispondenza più lunga, come per la voce accesa in barra: una
 * sottopagina dichiarata qui batte la sezione che la contiene.
 */
export function titoloPagina(pathname: string): TitoloPagina | null {
  const extra = Object.keys(TITOLI_EXTRA)
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (extra) {
    const voce = TITOLI_EXTRA[extra];
    return typeof voce === "string" ? { lungo: voce, breve: voce } : { lungo: voce[0], breve: voce[1] };
  }

  const voce = ALL_NAV.find((item) => isNavActive(pathname, item));
  if (!voce) return null;
  return { lungo: voce.label, breve: voce.shortLabel ?? voce.label };
}
