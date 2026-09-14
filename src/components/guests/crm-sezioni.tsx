import Link from "next/link";
import {
  Armchair,
  CalendarDays,
  Clock,
  MapPin,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Base } from "@/components/ui/base-del-numero";
import { formatCurrency, formatDate, formatNumber, formatTime } from "@/lib/utils";
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Dato
          etichetta="Valore storico"
          valore={formatCurrency(spesa.totaleCents, currency)}
          nota={<Base base="misurato" dettaglio={`Somma dei conti chiusi, ${misurataSu}.`} />}
          grande
        />
        <Dato
          etichetta="Spesa media"
          valore={spesa.mediaContoCents != null ? formatCurrency(spesa.mediaContoCents, currency) : null}
          nota={misurataSu}
          grande
        />
        <Dato
          etichetta="Conto più alto"
          valore={spesa.massimoCents != null ? formatCurrency(spesa.massimoCents, currency) : null}
          grande
        />
        <Dato
          etichetta="Ultimi 30 giorni"
          // Zero qui è una misura vera — «in questo mese non ha speso» — e non
          // un dato mancante: i conti ci sono, semplicemente non in questo
          // periodo.
          valore={formatCurrency(spesa.ultimi30Cents, currency)}
          grande
        />
      </div>

      {/*
        La variazione, e solo quando i due periodi hanno entrambi qualcosa
        dentro. Una percentuale calcolata su un periodo vuoto è sempre
        «+infinito» o «-100%», che descrive l'aritmetica e non il cliente.
      */}
      {spesa.variazione90 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card-sunken p-3 text-sm">
          {spesa.variazione90.delta >= 0 ? (
            <TrendingUp className="h-4 w-4 shrink-0 text-sage-strong" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
          )}
          <span className={spesa.variazione90.delta >= 0 ? "text-sage-strong" : "text-accent-strong"}>
            {spesa.variazione90.delta >= 0 ? "+" : "−"}
            {Math.abs(Math.round(spesa.variazione90.delta * 100))}%
          </span>
          <span className="text-muted-foreground">
            negli ultimi 90 giorni ({formatCurrency(spesa.variazione90.correnteCents, currency)}) rispetto
            ai 90 precedenti ({formatCurrency(spesa.variazione90.precedenteCents, currency)})
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

  return (
    <ol className="divide-y divide-border/60">
      {prodotti.map((p, i) => (
        <li key={`${p.menuItemId ?? p.nome}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          {/* Il numero d'ordine in tabellare e a larghezza fissa: una
              classifica in cui «1.» e «10.» hanno larghezze diverse fa
              ballare tutti i nomi. */}
          <span className="w-5 shrink-0 text-sm tabular-nums text-tertiary-foreground">{i + 1}.</span>
          {p.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={p.imageUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
              width={40}
              height={40}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.nome}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.categoria ?? "fuori menu"}
              {p.quantita > p.volte && ` · ${p.quantita} pezzi in tutto`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm tabular-nums">
              {p.volte} {p.volte === 1 ? "volta" : "volte"}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatCurrency(p.spesaCents, currency)}
            </p>
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
            <span className="truncate">{c.nome}</span>
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
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-secondary/50">
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
export function AbitudiniCliente({ abitudini }: { abitudini: Abitudini }) {
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

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3">
      {voci.map((v) => (
        <div key={v.etichetta} className="min-w-0">
          <p className="t-etichetta flex items-center gap-1.5">
            <v.icona className="h-3 w-3 shrink-0" aria-hidden="true" />
            {v.etichetta}
          </p>
          <p className="mt-0.5 truncate text-base" title={v.valore}>
            {v.valore}
          </p>
          {v.nota && <p className="t-nota">{v.nota}</p>}
        </div>
      ))}
    </div>
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
export function StoricoVisite({ visite, currency }: { visite: VisitaStorica[]; currency: string }) {
  if (visite.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nessuna visita registrata.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {visite.map((v) => {
        const quando = new Date(v.quando);
        return (
          <li key={v.bookingId}>
            <Link
              href={`/bookings/${v.bookingId}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 transition-colors hover:bg-secondary/20"
            >
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium tabular-nums">{formatDate(quando)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{formatTime(quando)}</p>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {v.coperti} {v.coperti === 1 ? "coperto" : "coperti"}
                  {v.tavolo && ` · ${[v.sala, `tavolo ${v.tavolo}`].filter(Boolean).join(" · ")}`}
                  {v.senzaPrenotazione && (
                    <span className="ml-2 text-xs text-tertiary-foreground">senza prenotazione</span>
                  )}
                </p>
                {v.piatti.length > 0 && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <UtensilsCrossed className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="line-clamp-1">
                      {v.piatti
                        .map((p) => (p.quantita > 1 ? `${p.nome} ×${p.quantita}` : p.nome))
                        .join(", ")}
                    </span>
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {v.spesaCents != null ? (
                  <p className="text-sm font-medium tabular-nums">
                    {formatCurrency(v.spesaCents, currency)}
                  </p>
                ) : (
                  <p className="text-xs text-tertiary-foreground">nessun conto</p>
                )}
                {v.permanenzaMin != null && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {Math.floor(v.permanenzaMin / 60)}h {String(v.permanenzaMin % 60).padStart(2, "0")}m
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
