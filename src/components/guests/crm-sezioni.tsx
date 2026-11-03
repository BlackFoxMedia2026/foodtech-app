import Link from "next/link";
import {
  Armchair,
  Beef,
  CakeSlice,
  CalendarDays,
  ArrowUpRight,
  Clock,
  Coffee,
  Fish,
  Footprints,
  MapPin,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type {
  Abitudini,
  CategoriaPreferita,
  ProdottoPreferito,
  SpesaCliente,
  StatoCliente,
  VisitaStorica,
} from "@/server/guest-crm";

/* -------------------------------------------------------------------------- */
/*  Lo stato del cliente                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Attivo, regolare, da riattivare — e **perché**.
 *
 * Il motivo non è un dettaglio da suggerimento: è quello che distingue questa
 * etichetta da un semaforo deciso dal software. Chi legge «Da riattivare»
 * deve poter vedere, sulla stessa riga, che quel cliente viene in media ogni
 * venti giorni e non si fa vedere da settanta — e poter dire «lo so, è in
 * viaggio» senza che la pagina insista.
 *
 * I colori: verde per chi c'è, oro per chi sta allungando i tempi, oro pieno
 * per chi è sparito. Nessun rosso — un cliente che non viene da tre mesi non
 * è un guasto, è un'occasione, e il rosso in questo prodotto vuol dire che
 * qualcosa è andato storto.
 */
const STATO_STILE: Record<StatoCliente["chiave"], string> = {
  attivo: "border-sage/50 bg-sage/15 text-sage-strong",
  regolare: "border-border-strong bg-secondary/40 text-foreground",
  da_riattivare: "border-accent/50 bg-accent/15 text-accent-strong",
  nuovo: "border-border bg-secondary/30 text-muted-foreground",
  non_misurabile: "border-border bg-secondary/30 text-muted-foreground",
};

export function StatoPillola({ stato }: { stato: StatoCliente }) {
  return (
    <span
      title={stato.perche}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        STATO_STILE[stato.chiave]
      }`}
    >
      {stato.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Un dato, con la sua base                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Etichetta, valore, e da dove viene.
 *
 * Il mattone di tutte le sezioni qui sotto. Il valore è la cosa grande,
 * l'etichetta gli sta sotto in maiuscoletto, e la nota — «su 8 conti chiusi»
 * — chiude: è l'ordine di lettura di una fascia di numeri, che si guarda al
 * contrario di un modulo.
 *
 * Quando il valore manca non si scrive uno zero: si scrive cosa manca. Uno
 * zero è una misura, «non misurato» è l'assenza di una misura, e confonderli
 * è il difetto che questo prodotto passa il tempo a togliere dalle pagine.
 */
export function Dato({
  etichetta,
  valore,
  nota,
  vuoto = "non misurato",
  grande = false,
}: {
  etichetta: string;
  valore: React.ReactNode | null;
  nota?: React.ReactNode;
  vuoto?: string;
  grande?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="t-etichetta">{etichetta}</p>
      {valore == null ? (
        <p className="mt-0.5 text-sm text-tertiary-foreground">{vuoto}</p>
      ) : (
        <p
          className={
            grande
              ? "text-display mt-0.5 text-2xl leading-none tabular-nums"
              : "mt-0.5 text-lg leading-tight tabular-nums"
          }
        >
          {valore}
        </p>
      )}
      {nota && valore != null && <p className="t-nota mt-1">{nota}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Una cifra in una pastiglia                                                */
/* -------------------------------------------------------------------------- */

/**
 * Il numero secondario di una sezione, nello stile delle tessere della
 * Panoramica ma in piccolo: fondo incavato, numero monospaziato, etichetta
 * sotto in tono basso. Sostituisce le righe di `Dato` in maiuscoletto che,
 * quattro per riga dentro ogni riquadro, davano alla scheda l'aria di un
 * foglio di calcolo.
 *
 * Nessun testo si tronca: l'etichetta va a capo se deve.
 */
export function Cifra({
  valore,
  etichetta,
  nota,
  tono = "neutro",
  tinta = "chiara",
  grande = false,
}: {
  valore: React.ReactNode;
  etichetta: string;
  nota?: React.ReactNode;
  tono?: "neutro" | "su" | "giu";
  /**
   * Il fondo. `verde` è il verde della tessera con l'inchiostro crema, `oro`
   * la sabbia dorata: due blocchi accostati con due fondi diversi si
   * distinguono senza leggere l'etichetta.
   */
  tinta?: "chiara" | "verde" | "oro";
  /** Il numero in grande, quando è il dato principale del riquadro. */
  grande?: boolean;
}) {
  const fondo = {
    chiara: "border-border/60 bg-card-sunken/70",
    verde:
      "border-transparent bg-[linear-gradient(135deg,#1C4A3A_0%,#102B22_100%)] text-cream shadow-[0_8px_18px_rgba(16,43,34,0.25)]",
    oro: "border-accent/40 bg-[linear-gradient(135deg,#F3E6C4_0%,#E6CF98_100%)] text-clay-ink",
  }[tinta];
  const scuro = tinta === "verde";
  const tinta2 = (verde: string, oro: string, chiara: string) =>
    scuro ? verde : tinta === "oro" ? oro : chiara;
  return (
    /* Il riquadro è un contenitore: la cifra grande scala con la sua
       larghezza (`cqi`) invece di avere una misura fissa, così «1.180,00 €»
       sta su una riga anche quando la colonna si stringe. */
    <div className={`min-w-0 rounded-xl border px-4 py-3.5 [container-type:inline-size] ${fondo}`}>
      <p
        className={`whitespace-nowrap font-mono tabular-nums ${
          grande ? "text-[clamp(1.125rem,14cqi,1.875rem)] leading-10" : "text-xl leading-7"
        } ${
          tinta !== "chiara"
            ? ""
            : tono === "su"
              ? "text-sage-strong"
              : tono === "giu"
                ? "text-accent-strong"
                : "text-foreground"
        }`}
      >
        {valore}
      </p>
      <p className={`text-[13px] font-medium leading-snug ${tinta2("text-cream/80", "text-clay-ink/75", "text-muted-foreground")}`}>
        {etichetta}
      </p>
      {nota && (
        <p className={`mt-0.5 text-[11px] leading-tight ${tinta2("text-cream/60", "text-clay-ink/60", "text-tertiary-foreground")}`}>
          {nota}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Spesa                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Quanto vale questo cliente, e nient'altro che quello che è entrato in cassa.
 *
 * ## Perché non si chiama «LTV»
 *
 * Un lifetime value è una **previsione**: quanto varrà questo cliente da qui
 * in avanti, dato quanto è venuto finora. Si calcola con una stima di
 * quante volte tornerà e per quanto tempo resterà cliente — due numeri che
 * qui nessuno ha, e che su un archivio di poche decine di visite non si
 * possono nemmeno stimare onestamente.
 *
 * Quello che invece esiste, riga per riga, è quanto questa persona ha
 * **davvero** lasciato al locale. Si chiama così: valore storico. È il
 * ripiego che il brief stesso indicava, ed è meglio di un LTV inventato con
 * una formula che nessuno potrebbe verificare.
 *
 * ## La media è per conto, non per visita
 *
 * Undici visite possono avere otto conti: non tutte le serate sono state
 * battute sul sistema. Dividere la spesa per le visite darebbe una media più
 * bassa del vero, e nessuno saprebbe perché. Quindi si divide per i conti, e
 * si scrive su quanti conti è fatta — che è l'unica differenza fra una media
 * e un numero che si può controllare.
 */
export function SezioneSpesa({
  spesa,
  visite,
  currency,
}: {
  spesa: SpesaCliente;
  visite: number;
  currency: string;
}) {
  const misurataSu = `su ${spesa.conti} ${spesa.conti === 1 ? "conto chiuso" : "conti chiusi"}${
    visite > spesa.conti ? ` di ${visite} visite` : ""
  }`;

  if (spesa.conti === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nessun conto chiuso a nome di questa persona.
        <span className="mt-1 block text-xs text-tertiary-foreground">
          Le visite si contano dalle prenotazioni, la spesa dai conti: finché un conto non viene
          battuto e chiuso, non c&apos;è una cifra da mostrare.
        </span>
      </p>
    );
  }

  /*
    Valore storico e spesa media stanno già nelle tessere in cima alla
    scheda: ripeterli qui erano due numeri letti due volte. Restano i due che
    in cima non ci sono — il conto più alto e l'ultimo mese — e la tendenza.
  */
  const v = spesa.variazione90;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Cifra
          etichetta="Conto più alto"
          tinta="verde"
          grande
          valore={spesa.massimoCents != null ? formatCurrency(spesa.massimoCents, currency) : "—"}
          nota={misurataSu}
        />
        <Cifra
          etichetta="Ultimi 30 giorni"
          tinta="oro"
          grande
          // Zero qui è una misura vera — «in questo mese non ha speso» — e
          // non un dato mancante.
          valore={formatCurrency(spesa.ultimi30Cents, currency)}
        />
      </div>

      {/*
        La variazione, e solo quando i due periodi hanno entrambi qualcosa
        dentro. Una percentuale calcolata su un periodo vuoto è sempre
        «+infinito» o «-100%», che descrive l'aritmetica e non il cliente.
      */}
      {v && (
        <p className="flex items-start gap-2.5 text-sm">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
              v.delta >= 0 ? "bg-sage/15 text-sage-strong" : "bg-accent/15 text-accent-strong"
            }`}
          >
            {v.delta >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {v.delta >= 0 ? "+" : "−"}
            {Math.abs(Math.round(v.delta * 100))}%
          </span>
          <span className="text-muted-foreground">
            negli ultimi 90 giorni ({formatCurrency(v.correnteCents, currency)}) rispetto ai 90
            precedenti ({formatCurrency(v.precedenteCents, currency)})
          </span>
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Prodotti preferiti                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Cosa ordina, contato dalle righe dei conti.
 *
 * «Volte» e «quantità» sono due colonne diverse perché sono due domande
 * diverse: quante sere l'ha preso, e quanti pezzi in tutto. Due tartare nella
 * stessa sera sono due pezzi di una volta sola — un piatto preso una sera per
 * tutto il tavolo non è un piatto preferito, ed è la distinzione che permette
 * di accorgersene.
 *
 * La miniatura c'è **solo se il piatto ha una foto nel menu**: un rettangolo
 * grigio segnaposto accanto a metà dei piatti sarebbe rumore, e non
 * aggiungerebbe niente al nome che sta già scritto.
 */
export function ProdottiPreferiti({
  prodotti,
  currency,
}: {
  prodotti: ProdottoPreferito[];
  currency: string;
}) {
  if (prodotti.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nessun piatto ancora battuto su un conto di questa persona.
      </p>
    );
  }

  /*
    Una scheda per piatto, con la sua foto (3 novembre 2026): un elenco di
    nomi in corpo piccolo si legge, una foto si riconosce. Il numero in
    classifica sta sulla foto, la barra dice quante sere rispetto al primo.
  */
  const massimo = Math.max(...prodotti.map((p) => p.volte), 1);

  return (
    <ol className="space-y-2.5">
      {prodotti.map((p, i) => (
        <li
          key={`${p.menuItemId ?? p.nome}`}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card-sunken/50 p-2.5"
        >
          <div className="relative shrink-0">
            <FotoPiatto src={p.imageUrl} categoria={p.categoria} className="h-16 w-16 rounded-lg" />
            <span className="absolute -left-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-card text-[11px] font-semibold tabular-nums shadow-sm ring-1 ring-border">
              {i + 1}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="break-words text-[15px] font-medium leading-snug">{p.nome}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-foreground">
                {p.categoria ?? "fuori menu"}
              </span>
              {p.quantita > p.volte && <span className="tabular-nums">{p.quantita} pezzi in tutto</span>}
            </div>
            <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/50">
              <div
                className="h-full rounded-full bg-sage-strong"
                style={{ width: `${Math.max(6, Math.round((p.volte / massimo) * 100))}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-mono text-xl leading-none tabular-nums">{p.volte}×</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{p.volte === 1 ? "sera" : "sere"}</p>
            <p className="mt-1.5 text-xs font-medium tabular-nums">{formatCurrency(p.spesaCents, currency)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Categorie preferite                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cosa gli piace, un gradino sopra il singolo piatto.
 *
 * ## Perché la quota è sulla spesa e non sui piatti
 *
 * Un cliente che prende sei caffè e una bistecca non è un cliente da caffè:
 * contando i pezzi, «Caffetteria 86%» sarebbe la prima riga, e chi legge
 * concluderebbe la cosa sbagliata su cosa proporgli. La spesa dice **dove
 * vanno i suoi soldi**, che è la domanda che si sta facendo chi guarda questa
 * sezione.
 *
 * ## Barre e non una ciambella
 *
 * Quattro o cinque voci ordinate per grandezza si confrontano leggendo in
 * verticale: le barre partono tutte dallo stesso punto, quindi la lunghezza è
 * la grandezza. In una ciambella la stessa informazione richiede di
 * confrontare angoli, che l'occhio fa peggio, e serve una legenda per dire
 * quale spicchio è quale — due oggetti in più per lo stesso dato.
 */
export function CategoriePreferite({
  categorie,
  currency,
}: {
  categorie: CategoriaPreferita[];
  currency: string;
}) {
  if (categorie.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Ancora nessuna categoria: servono conti con piatti del menu.
      </p>
    );
  }

  /*
    Cinque e poi il resto sommato in «Altre».

    Un elenco di dodici categorie con le ultime sette sotto il 3% non si legge
    in due secondi, che è il tempo che questa sezione deve costare. Ma le sette
    non si buttano: se sparissero, le percentuali non farebbero più cento e chi
    somma cercherebbe il pezzo mancante.
  */
  const TETTO = 5;
  const principali = categorie.slice(0, TETTO);
  const resto = categorie.slice(TETTO);
  const righe = resto.length
    ? [
        ...principali,
        {
          nome: `Altre ${resto.length}`,
          spesaCents: resto.reduce((n, c) => n + c.spesaCents, 0),
          quota: resto.reduce((n, c) => n + c.quota, 0),
        },
      ]
    : principali;

  return (
    <ul className="space-y-3">
      {righe.map((c) => (
        <li key={c.nome} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{c.nome}</span>
            <span className="shrink-0 tabular-nums">
              {Math.round(c.quota * 100)}%
              <span className="ml-2 text-xs text-muted-foreground">
                {formatCurrency(c.spesaCents, currency)}
              </span>
            </span>
          </div>
          {/* La barra è decorazione del numero già scritto accanto, quindi
              `aria-hidden`: un lettore di schermo leggerebbe due volte la
              stessa percentuale. */}
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-secondary/50">
            <div
              className="h-full rounded-full bg-sage-strong"
              style={{ width: `${Math.max(2, Math.round(c.quota * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Abitudini                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Come viene, quando viene, dove si siede.
 *
 * Ogni voce porta la sua quota — «sabato, 6 visite su 9» — e non è pedanteria:
 * «giorno preferito: sabato» su un cliente che è venuto tre volte di sabato e
 * tre di giovedì è una frase falsa detta con sicurezza. La quota è ciò che
 * permette a chi legge di decidere se fidarsi, ed è la stessa regola delle
 * etichette calcolate in `guest-intelligence`.
 *
 * Le voci non misurabili non compaiono: un cliente senza orari di
 * accomodamento non ha una permanenza media, e una riga «—» occupa spazio per
 * dire che non sappiamo qualcosa che nessuno aveva chiesto.
 */
export function AbitudiniCliente({
  abitudini,
  inColonna = false,
}: {
  abitudini: Abitudini;
  /** Nella colonna stretta di sinistra: da `lg` una tessera per riga. */
  inColonna?: boolean;
}) {
  const a = abitudini;
  const quota = (q: number) => `${Math.round(q * 100)}% delle visite`;

  const voci: { icona: typeof CalendarDays; etichetta: string; valore: string; nota?: string }[] = [];

  if (a.giorno) {
    voci.push({
      icona: CalendarDays,
      etichetta: "Giorno preferito",
      valore: a.giorno.label,
      nota: quota(a.giorno.quota),
    });
  }
  if (a.fascia) {
    voci.push({
      icona: Clock,
      etichetta: "Fascia oraria",
      valore: `${a.fascia.da} – ${a.fascia.a}`,
      nota: quota(a.fascia.quota),
    });
  }
  if (a.copertiMedi != null) {
    voci.push({
      icona: Users,
      etichetta: "Coperti medi",
      valore: `${formatNumber(a.copertiMedi)} ${a.copertiMedi === 1 ? "persona" : "persone"}`,
    });
  }
  if (a.permanenza) {
    const h = Math.floor(a.permanenza.minuti / 60);
    const m = a.permanenza.minuti % 60;
    voci.push({
      icona: Clock,
      etichetta: "Permanenza media",
      valore: h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`,
      // Su quante serate: la permanenza si misura solo dove qualcuno ha
      // segnato l'accomodamento e la chiusura, che non è ogni sera.
      nota: `misurata su ${a.permanenza.misurataSu} ${
        a.permanenza.misurataSu === 1 ? "serata" : "serate"
      }`,
    });
  }
  if (a.quotaPrenotazioni) {
    const p = Math.round(a.quotaPrenotazioni.quota * 100);
    voci.push({
      icona: Armchair,
      etichetta: "Come arriva",
      valore: p >= 50 ? `${p}% prenotando` : `${100 - p}% senza prenotare`,
      nota: `su ${a.quotaPrenotazioni.su} visite`,
    });
  }
  if (a.posto) {
    voci.push({
      icona: MapPin,
      etichetta: "Dove si siede",
      valore: [a.posto.sala, a.posto.tavolo].filter(Boolean).join(" · "),
      nota: quota(a.posto.quota),
    });
  }

  if (voci.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Serve qualche visita in più prima di poter parlare di abitudini.
      </p>
    );
  }

  /*
    Tessere piccole con il dischetto, come la fascia della Panoramica: il
    valore è la riga che si legge, l'etichetta lo accompagna. Niente
    `truncate` — «Sala principale · B2» si legge intero o va a capo.
  */
  return (
    <ul className={cn("grid gap-2.5 sm:grid-cols-2", inColonna ? "lg:grid-cols-1" : "2xl:grid-cols-3")}>
      {voci.map((v) => (
        <li
          key={v.etichetta}
          className="flex min-w-0 items-start gap-3 rounded-xl border border-border/60 bg-card-sunken/70 p-3"
        >
          <span className="vetro kpi-pastiglia grid h-9 w-9 shrink-0 place-items-center rounded-full">
            <v.icona className="h-[18px] w-[18px]" stroke="url(#trattoVetro)" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-muted-foreground">{v.etichetta}</p>
            <p className="break-words text-base font-medium leading-snug">{v.valore}</p>
            {v.nota && <p className="mt-0.5 text-[11px] leading-tight text-tertiary-foreground">{v.nota}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Storico visite                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Ogni serata, con quello che è successo.
 *
 * ## La riga porta alla prenotazione
 *
 * Il brief chiedeva che cliccando una visita si vedesse il dettaglio dello
 * scontrino «se questa informazione esiste già nel sistema». Esiste, e sta
 * sulla prenotazione: `/bookings/[id]` è la pagina che tiene insieme la
 * serata, i coperti e i conti aperti su quel tavolo. Quindi la riga porta lì,
 * invece di ricostruire una seconda vista dello stesso scontrino che poi
 * dovrebbe restare allineata alla prima.
 *
 * ## Nessun conto non è zero euro
 *
 * Una serata senza importo è una serata **non battuta**, non una cena
 * offerta. Scrivere «0,00 €» direbbe che quella sera il cliente non ha speso
 * niente, che è una cosa diversa e che qui non sappiamo.
 */
export function StoricoVisite({
  visite,
  currency,
  timeZone,
}: {
  visite: VisitaStorica[];
  currency: string;
  /** Il fuso del locale: la pagina si disegna sul server, che è in UTC. */
  timeZone?: string | null;
}) {
  if (visite.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nessuna visita registrata.
      </p>
    );
  }

  /*
    Ogni serata è una scheda, non una riga di tabella (3 novembre 2026).

    A sinistra un calendarino — giorno grande, mese e ora piccoli — che si
    scorre con l'occhio come le pagine di un'agenda. Al centro i fatti in
    pastiglie con la loro icona (coperti, tavolo, permanenza) e i piatti con
    la loro foto: la serata si riconosce da cosa c'era in tavola prima che
    dalle parole. A destra il conto, o la pastiglia «nessun conto».
  */
  const fuso = timeZone ? { timeZone } : {};
  const giorno = new Intl.DateTimeFormat("it-IT", { day: "2-digit", ...fuso });
  const mese = new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit", ...fuso });
  const ora = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", ...fuso });

  return (
    <ol className="space-y-2.5">
      {visite.map((v) => {
        const quando = new Date(v.quando);
        const posto = [v.sala, v.tavolo && `tavolo ${v.tavolo}`].filter(Boolean).join(" · ");
        return (
          <li key={v.bookingId}>
            <Link
              href={`/bookings/${v.bookingId}`}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card-sunken/50 p-3 transition-colors hover:border-border-strong hover:bg-card-sunken sm:gap-4"
            >
              {/* Il calendarino */}
              {/* Tre righe, tre pesi: il mese piccolo in maiuscoletto, il
                  giorno grande in serif sul verde della tessera, l'ora sulla
                  fascia grigia sotto. */}
              <div className="flex w-[4.5rem] shrink-0 flex-col overflow-hidden rounded-xl text-center shadow-[0_6px_14px_rgba(16,43,34,0.22)] sm:w-20">
                <div className="bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] px-2 pb-1.5 pt-1.5 text-cream">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-cream/75">
                    {mese.format(quando).replace(".", "")}
                  </span>
                  <span className="text-display block text-[1.75rem] leading-none tabular-nums">
                    {giorno.format(quando)}
                  </span>
                </div>
                <span className="bg-secondary py-1 font-mono text-xs tabular-nums text-foreground">
                  {ora.format(quando)}
                </span>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                {/* Sul telefono il conto sale qui: in colonna a destra
                    toglieva ai piatti lo spazio per stare su una riga. */}
                <div className="flex items-center justify-between gap-2 sm:hidden">
                  {v.spesaCents != null ? (
                    <p className="font-mono text-xl font-medium tabular-nums">
                      {formatCurrency(v.spesaCents, currency)}
                    </p>
                  ) : (
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-tertiary-foreground">
                      nessun conto
                    </span>
                  )}
                  <ApriSerata />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Pastiglia icona={Users}>
                    {v.coperti} {v.coperti === 1 ? "coperto" : "coperti"}
                  </Pastiglia>
                  {posto && <Pastiglia icona={MapPin}>{posto}</Pastiglia>}
                  {v.permanenzaMin != null && (
                    <Pastiglia icona={Clock}>
                      {Math.floor(v.permanenzaMin / 60)}h {String(v.permanenzaMin % 60).padStart(2, "0")}m
                    </Pastiglia>
                  )}
                  {v.senzaPrenotazione && <Pastiglia icona={Footprints}>senza prenotazione</Pastiglia>}
                </div>

                {v.piatti.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Piatti della serata">
                    {v.piatti.map((p) => (
                      <li
                        key={p.nome}
                        className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border/60 bg-card py-0.5 pl-0.5 pr-3 text-xs"
                      >
                        <FotoPiatto
                          src={p.imageUrl}
                          categoria={p.categoria}
                          className="h-7 w-7 rounded-full"
                          icona="h-3.5 w-3.5"
                        />
                        <span className="min-w-0 break-words">{p.nome}</span>
                        {p.quantita > 1 && (
                          <span className="shrink-0 tabular-nums text-muted-foreground">×{p.quantita}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="hidden shrink-0 items-center gap-2.5 self-center sm:flex">
                {v.spesaCents != null ? (
                  <p className="font-mono text-2xl font-medium tabular-nums">
                    {formatCurrency(v.spesaCents, currency)}
                  </p>
                ) : (
                  <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-tertiary-foreground">
                    nessun conto
                  </span>
                )}
                <ApriSerata />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** La freccia verso l'alto accanto al conto: la serata si apre. */
function ApriSerata() {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors group-hover:border-transparent group-hover:bg-[#1C4A3A] group-hover:text-cream"
    >
      <ArrowUpRight className="h-4 w-4" />
    </span>
  );
}

/** Un fatto breve con la sua icona: coperti, tavolo, durata. */
function Pastiglia({
  icona: Icona,
  children,
}: {
  icona: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-2xl bg-secondary/45 px-2.5 py-1 text-xs text-foreground">
      <Icona className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  La foto di un piatto                                                      */
/* -------------------------------------------------------------------------- */

/**
 * L'icona della portata, per i piatti senza foto: un piatto battuto a mano
 * o una carta che le foto non le ha ancora. Un rettangolo grigio vuoto
 * direbbe «immagine mancante»; un tondo verde con il disegno della portata
 * dice comunque che cosa è.
 */
function iconaPortata(categoria: string | null): LucideIcon {
  const c = (categoria ?? "").toLowerCase();
  if (/dolc|dessert|pasticc/.test(c)) return CakeSlice;
  if (/vin|bevand|drink|cocktail|birr/.test(c)) return Wine;
  if (/caff|bar/.test(c)) return Coffee;
  if (/pizz/.test(c)) return Pizza;
  if (/prim|past|zupp|risott/.test(c)) return Soup;
  if (/pesce|mare/.test(c)) return Fish;
  if (/second|carn|grigli/.test(c)) return Beef;
  if (/contorn|insalat|verdur/.test(c)) return Salad;
  if (/antipast|crudi|stuzz/.test(c)) return Sandwich;
  return UtensilsCrossed;
}

export function FotoPiatto({
  src,
  categoria,
  className,
  icona = "h-6 w-6",
}: {
  src: string | null;
  categoria: string | null;
  className: string;
  /** La misura dell'icona di ripiego. */
  icona?: string;
}) {
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={src} alt="" loading="lazy" className={`${className} shrink-0 object-cover`} />
    );
  }
  const Icona = iconaPortata(categoria);
  return (
    <span aria-hidden="true" className={`${className} vetro kpi-pastiglia grid shrink-0 place-items-center`}>
      <Icona className={icona} stroke="url(#trattoVetro)" />
    </span>
  );
}
