import { CalendarRange, CreditCard, Gift, LayoutDashboard, LineChart, Megaphone, QrCode, Radio, Repeat, Settings, Ticket, Users, UtensilsCrossed, Wifi } from "lucide-react";
import { DiningTableIcon, TuxedoGuestIcon } from "@/components/shell/nav-icons";
import { cn } from "@/lib/utils";

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
   * — es. Marketing resta evidenziata dentro /campaigns/* e /insights/*, due
   * sue sottovoci rimaste al loro percorso per non rompere link già mandati. */
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
  /**
   * Una riga che dice **cosa ci si fa**, per i menu dove il nome da solo non
   * basta. In barra non compare mai: lì lo spazio è quello che è, e le otto
   * voci principali si spiegano da sole.
   */
  descrizione?: string;
  /**
   * Le voci che stanno **dentro** questa: la voce diventa un menu, e cliccarla
   * non porta da nessuna parte — apre l'elenco.
   *
   * L'unica che le ha è Marketing. Le sue sei funzioni non sono gesti di
   * servizio e non stanno in barra una per una, ma erano dietro una pagina
   * fatta di scorciatoie: si cliccava «Marketing», si leggeva un indice, si
   * cliccava di nuovo. L'indice adesso è il menu, e il secondo clic è il
   * primo che porta da qualche parte.
   */
  sottovoci?: NavItem[];
};

export type GruppoProfilo = "gestione" | "account";

export const GRUPPI_PROFILO: { key: GruppoProfilo; label: string }[] = [
  { key: "gestione", label: "Gestione" },
  { key: "account", label: "Account" },
];

/**
 * Gli strumenti del marketing, **nell'ordine in cui si usano**.
 *
 * Prima erano sei card dentro `/marketing`: una pagina che non faceva niente
 * se non elencare sei link, cioè un passaggio obbligato fra il volere una cosa
 * e l'averla. Adesso sono il contenuto del menu che si apre dalla voce in
 * barra, e `/marketing` reindirizza alle campagne.
 *
 * L'ordine è quello di prima e non è alfabetico: si parte da ciò che si manda
 * (campagne, automazioni), si passa a ciò che si dà (coupon, gift card) e si
 * finisce con ciò che si raccoglie o si stampa (Wi-Fi, QR).
 *
 * **Quello che configura l'invio non sta qui**: piano DEM, dominio di invio e
 * reputazione sono in Impostazioni → Marketing. Il criterio è quello di tutto
 * il menu — qui stanno gli **strumenti**, le cose che si aprono per fare
 * qualcosa. Un piano si guarda una volta al mese e un dominio si configura una
 * volta sola: metterli in fila con le campagne allunga l'elenco che si legge
 * ogni volta con tre voci che servono quasi mai.
 *
 * **Le campagne sono rimaste su `/campaigns`**, fuori da `/marketing`: il
 * percorso è quello del wizard esistente e spostarlo romperebbe i link già
 * mandati. La voce in barra resta accesa lo stesso — se ne occupa
 * `matchPrefixes`.
 *
 * Nessuna di queste è dietro un permesso: le pagine si aprono per tutti i
 * ruoli e `edit_marketing` decide solo se i pulsanti di modifica ci sono. Il
 * menu fa la stessa cosa — mostra tutto — perché nasconderne una qui e
 * lasciarla raggiungibile per link direbbe due cose diverse.
 */
export const MARKETING_NAV: NavItem[] = [
  {
    href: "/campaigns",
    label: "Campagne email",
    icon: Megaphone,
    descrizione: "Crea e programma comunicazioni",
  },
  {
    href: "/marketing/automations",
    label: "Automazioni",
    icon: Repeat,
    descrizione: "Messaggi che partono da soli",
  },
  {
    href: "/marketing/coupons",
    label: "Coupon",
    icon: Ticket,
    descrizione: "Sconti e codici promozionali",
  },
  {
    href: "/marketing/gift-cards",
    label: "Gift card",
    icon: Gift,
    descrizione: "Buoni e credito del cliente",
  },
  {
    href: "/marketing/wifi",
    label: "Wi-Fi",
    icon: Wifi,
    descrizione: "I contatti raccolti dal portale",
  },
  {
    href: "/marketing/qr-codes",
    label: "QR Code",
    icon: QrCode,
    descrizione: "Codici da stampare e appendere",
  },
  /*
    Analytics chiude l'elenco, ed è l'unica voce che non è uno strumento: è il
    posto dove si guarda **com'è andata**. Stava sotto l'avatar, fra le cose
    amministrative, e lì la si apriva per caso; qui sta accanto alle sei leve
    che muovono i numeri che mostra, in fondo perché è la domanda che viene
    dopo aver fatto qualcosa, non prima.

    Il percorso resta `/insights` — nessun link cambia — e la voce in barra
    che si accende diventa Marketing, via `matchPrefixes`. Il titolo della
    pagina lo dà `TITOLI_EXTRA`: senza, una sezione intera si chiamerebbe
    «Marketing» nella testata.
  */
  {
    href: "/insights",
    label: "Analytics",
    icon: LineChart,
    descrizione: "Incassi, ospiti, andamenti",
  },
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
 * Tutto il resto — incassi, impostazioni — è lavoro da ufficio, che si fa la
 * mattina dopo: sta nel menu del profilo (`PROFILE_NAV`), che è il posto
 * delle cose che si aprono una volta a settimana. Il dropdown «Altro» in mezzo alla barra non esiste più: era un
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
  {
    href: "/marketing",
    label: "Marketing",
    icon: Megaphone,
    matchPrefixes: ["/campaigns", "/insights"],
    sottovoci: MARKETING_NAV,
  },
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
  /*
    Due voci sono uscite di qui il 15 settembre, e per due ragioni diverse.

    **«Attesa» era la stessa cosa detta due volte.** La coda sta dentro
    Servizio — la schermata ha tre zone e la terza è l'attesa, con i gruppi e
    le azioni — quindi chi è in sala ce l'ha già davanti. La voce nel menu
    dava a una vista duplicata la dignità di una sezione, e la domanda «qual è
    quella buona?» non ha una risposta utile. La pagina `/waitlist` resta
    dov'è: ci si arriva dai due gesti che **aggiungono** qualcuno alla coda
    (l'azione in Panoramica e il «+» della barra del telefono), che in
    Servizio non esistono.

    **«Esperienze» è sospesa, non tolta.** La sezione c'è e funziona, ma non
    è ancora decisa: finché non lo è, non sta nella navigazione. Per
    rimetterla basta questa riga —
    `{ href: "/experiences", label: "Esperienze", icon: Sparkles, gruppo: "gestione" }`
    — più la chiave `esperienze` nelle due tabelle dell'assistente
    (`ai/tools/navigation.ts` e `ai/intent-router.ts`).
  */
  { href: "/payments", label: "Pagamenti", icon: CreditCard, gruppo: "gestione" },
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

/**
 * La sottovoce aperta dentro una voce-menu, se ce n'è una.
 *
 * Serve al menu Marketing: la voce in barra dice «sei nel marketing», questa
 * dice **in quale dei sette strumenti** — altrimenti si apre l'elenco e
 * niente distingue quello che si sta già guardando dagli altri sei.
 */
export function sottovoceAttiva(pathname: string, item: NavItem): NavItem | undefined {
  return item.sottovoci?.find((v) => sottoA(pathname, v.href));
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
  "/settings/marketing/piano": ["Il tuo piano DEM", "Piano DEM"],
  "/settings/marketing/invio": ["Impostazioni invio", "Invio"],
  "/settings/marketing/reputazione": "Reputazione",
  "/settings/marketing/piano/confronto": ["Scegli il tuo piano", "Piani"],
  /* Analytics vive nel menu Marketing, quindi la voce accesa in barra è
     Marketing: senza questa riga la sua testata direbbe «Marketing». */
  "/insights": "Analytics",
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

/**
 * Il vestito di una voce in barra, **uno solo per tutte**.
 *
 * Tre misure per la stessa voce, e il salto avviene dove la fila smetterebbe
 * di entrare:
 * · fino a 1280 px il nome sta **sotto** l'icona, come nella barra del
 *   telefono (su tablet si tocca: 44 px);
 * · da 1280 px torna accanto all'icona, abbreviato;
 * · da 1536 px il nome è intero.
 *
 * Prima il nome tornava in fila già a 1024 px: con sei voci ci stava, con
 * sette la pillola finiva sotto la sfera dell'agente. Una barra che scorre di
 * lato è una barra che nasconde metà prodotto.
 *
 * Sta qui, e non dentro `header.tsx`, perché la usano **tre** file: la barra
 * del gestionale, il menu Marketing e la barra delle Impostazioni. Le due
 * barre devono somigliarsi fino all'ultimo pixel — è quello che rende il
 * passaggio fra le due un cambio di area e non un altro prodotto — e due
 * copie di questa stringa smettono di somigliarsi alla prima modifica fatta
 * su una sola.
 */
export function classiVoce(active: boolean) {
  return cn(
    "relative z-10 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[10px] font-medium leading-tight transition-colors md:min-w-0 xl:flex-row xl:gap-2 xl:px-3 xl:py-2 xl:text-sm 2xl:px-3.5",
    active ? "text-forest" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
  );
}
