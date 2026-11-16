"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronRight, Mail, Phone, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoyaltyPill } from "./loyalty-pill";
import { Etichetta } from "@/components/ui/etichetta";
import { formatCurrency, formatDate, initials } from "@/lib/utils";
import { Corpo, Riga, RigaVuota, Tabella, Td, Testa, Th } from "@/components/ui/table";
import type { PaginaOspiti } from "@/server/guests";

const ALL_TAGS = "__all__";

export function GuestsTable({
  rows,
  availableTags,
  spesaCents,
  piedeTelefono,
}: {
  /**
   * La paginazione del telefono, messa in fondo alla lista e non sotto: sul
   * telefono scorre con gli ospiti invece di tagliarli a metà riga.
   */
  piedeTelefono?: ReactNode;
  /**
   * Solo le colonne che l'elenco mostra, non la riga intera del database: la
   * spesa è un `Decimal` di Prisma e non attraversa il confine col client, e
   * le note riservate di un ospite non hanno ragione di arrivare fin qui.
   */
  rows: PaginaOspiti["items"];
  availableTags: string[];
  /**
   * Quanto ha speso ciascuno, contato dai conti chiusi. Un ospite che non c'è
   * dentro non ha conti chiusi: si scrive «non ancora», non «0,00 €».
   */
  spesaCents: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function onSearch(q: string) {
    const sp = new URLSearchParams(search);
    if (q) sp.set("q", q);
    else sp.delete("q");
    // Cambiare la ricerca riporta alla prima pagina: cercare stando a pagina
    // due e trovare «nessun risultato» perché i risultati sono tre è il modo
    // più rapido di far credere che la ricerca sia rotta.
    sp.delete("pagina");
    router.push(`${pathname}?${sp.toString()}`);
  }

  function onTagFilter(tag: string) {
    const sp = new URLSearchParams(search);
    if (tag && tag !== ALL_TAGS) sp.set("tag", tag);
    else sp.delete("tag");
    sp.delete("pagina");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    // La ricerca resta fissa, la tabella prende l'altezza che avanza: si
    // cerca senza perdere il campo di ricerca sotto lo scorrimento.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/*
        Una barra sola, larga quanto la tabella.

        Prima erano tre cose su due righe: un conteggio («Da 1 a 50 di 65»)
        sopra, poi un campo di ricerca largo `max-w-md` e un filtro, con
        mezza pagina di verde vuoto a destra. Il conteggio era la prima cosa
        che si leggeva ed è la meno utile: lo si guarda dopo aver cercato, non
        prima — quindi è sceso in fondo, accanto ai pulsanti di pagina, dove
        si legge nel momento in cui serve.

        Quello che resta in cima è **il gesto**: si cerca. Il campo prende
        tutto lo spazio che avanza perché è l'unica cosa che si tocca cento
        volte al giorno, e il filtro resta a misura fissa — un menu a tendina
        largo un terzo di schermo non contiene più opzioni, contiene più aria.
      */}
      <div className="fissa flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            defaultValue={search.get("q") ?? ""}
            placeholder="Cerca per nome, email o telefono…"
            aria-label="Cerca fra gli ospiti"
            className="h-11 pl-10 text-base md:text-sm"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        {availableTags.length > 0 && (
          <Select defaultValue={search.get("tag") ?? ALL_TAGS} onValueChange={onTagFilter}>
            <SelectTrigger className="h-11 w-full shrink-0 sm:w-52" aria-label="Filtra per tag">
              <SelectValue placeholder="Tutti i tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS}>Tutti i tag</SelectItem>
              {availableTags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Sul telefono una tabella a sei colonne mostra due colonne e mezzo:
          visite, ultima visita e livello — cioè le informazioni per cui si apre
          il CRM — restavano fuori dallo schermo, raggiungibili solo scorrendo
          in orizzontale. Sotto `md` le stesse righe diventano un elenco come
          quello dei Contatti del telefono: un gruppo solo, righe piatte divise
          da un filo, nome in grassetto e una riga di numeri sotto. Le schede
          una per ospite pesavano il doppio — email e telefono su due righe,
          l'email sempre troncata — e su uno schermo se ne leggevano tre.
          L'email intera resta nella scheda, a un tocco: qui si mostra il
          telefono, che è il contatto che si usa dal telefono. */}
      {/* L'elenco scorre fin sotto la barra dell'app e ci passa dietro
          sfumando, invece di fermarsi su un bordo netto a metà ospite
          (`.scorre-sotto-barra` in globals.css). */}
      <div className="fill-scroll scorre-sotto-barra md:hidden">
        {rows.length === 0 ? (
          <p className="riquadro comodo text-center text-[15px] text-muted-foreground">Nessun ospite trovato.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card-sunken">
            {rows.map((g) => {
              const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
              return (
                <li key={g.id}>
                  <Link
                    href={`/guests/${g.id}`}
                    className="flex min-h-[4rem] items-center gap-3 px-3.5 py-3 transition-colors active:bg-secondary/40"
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="text-sm">{initials(name)}</AvatarFallback>
                    </Avatar>
                    {/* Tre cose sole: chi è, il livello, il numero per
                        chiamarlo. I tag scritti a mano e la riga di numeri
                        (visite, spesa, ultima data) allungavano ogni ospite;
                        sono nella scheda, a un tocco, e nella tabella da
                        tablet in su. */}
                    <div className="min-w-0 flex-1">
                      {/* Il livello sta accanto al nome, non sotto: la riga
                          resta di due linee per tutti, con o senza livello. */}
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate text-base font-semibold leading-snug">{name}</p>
                        <span className="shrink-0">
                          <LoyaltyPill tier={g.loyaltyTier} />
                        </span>
                      </div>
                      {g.phone && (
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-snug text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
                          <span className="truncate tabular-nums">{g.phone}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {piedeTelefono}
      </div>

      {/*
        La tabella, densità ariosa e piano incassato.

        Il verde è `bg-card-sunken` — lo stesso dei reparti in Staff, e per la
        stessa ragione scritta in `globals.css`: `--card` e la capsula della
        barra in alto sono indistinguibili a occhio, e una tabella a tutta
        pagina dipinta di `--card` si legge come navigazione che continua nel
        contenuto invece che come dati.
      */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <Tabella fill densita="ariosa" piano="incassato" minWidth="min-w-[700px]">
          <Testa piano="incassato">
            <Th densita="ariosa">Ospite</Th>
            <Th densita="ariosa">Contatti</Th>
            <Th densita="ariosa" allineamento="right">Visite</Th>
            <Th densita="ariosa" allineamento="right">Spesa totale</Th>
            <Th densita="ariosa">Ultima visita</Th>
            <Th densita="ariosa">Fedeltà</Th>
          </Testa>
          <Corpo>
            {rows.length === 0 && <RigaVuota colonne={6}>Nessun ospite trovato.</RigaVuota>}
            {rows.map((g) => {
              const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
              return (
                <Riga
                  key={g.id}
                  // La riga intera porta alla scheda. Il link vero resta sul
                  // nome: questo è solo il bersaglio grande per il mouse.
                  onClick={() => router.push(`/guests/${g.id}`)}
                  className="cursor-pointer"
                >
                  {/*
                    Le due colonne elastiche hanno un tetto, ed è ciò che fa
                    stare la tabella dentro un tablet.

                    Senza, una cella di tabella non scende mai sotto la
                    larghezza del proprio contenuto: un indirizzo lungo
                    allargava la colonna dei contatti, la tabella arrivava a
                    985 px e a 834 «Ultima visita» e «Fedeltà» finivano fuori
                    schermo — due delle sei informazioni per cui si apre il
                    CRM. Col tetto è l'indirizzo ad accorciarsi, con i puntini
                    e il testo intero nel suggerimento, che è la perdita
                    giusta: l'email si legge per riconoscerla, non si trascrive
                    da qui.
                  */}
                  <Td densita="ariosa" className="max-w-[13rem] lg:max-w-[17rem]">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback className="text-sm">{initials(name)}</AvatarFallback>
                      </Avatar>
                      {/*
                        Il nome è la cosa più grande della riga, e il tag gli
                        sta **accanto**, non sotto.

                        Sotto, il tag partiva un'altra riga di testo e la riga
                        cresceva di quindici pixel per una parola: due persone
                        di fila con un tag ciascuna facevano scendere la
                        quarta fuori dallo schermo. Accanto, la riga resta di
                        un'altezza sola e il tag pesa quello che vale — è
                        un'aggiunta al nome, non un secondo dato.
                      */}
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/guests/${g.id}`}
                          className="truncate text-base font-medium leading-tight hover:text-accent-strong lg:text-lg"
                        >
                          {name}
                        </Link>
                        <Tag tags={g.tags} />
                      </div>
                    </div>
                  </Td>
                  <Td densita="ariosa" className="max-w-[9rem] lg:max-w-[13rem]">
                    <Contatti email={g.email} phone={g.phone} />
                  </Td>
                  <Td densita="ariosa" allineamento="right" className="text-base tabular-nums">
                    {g.totalVisits}
                  </Td>
                  {/* Non `Guest.totalSpend`, che nessuno scrive: la somma dei
                      conti chiusi di questa persona. Chi non ne ha, non ha
                      speso «zero» — non l'abbiamo ancora misurato, e le due
                      cose vanno dette in modo diverso. */}
                  <Td densita="ariosa" allineamento="right">
                    {spesaCents[g.id] != null ? (
                      <span className="text-base font-medium tabular-nums">
                        {formatCurrency(spesaCents[g.id])}
                      </span>
                    ) : (
                      <span className="text-sm text-tertiary-foreground">non ancora</span>
                    )}
                  </Td>
                  {/* Una data non va a capo: su tablet «10 set 2026» si
                      spezzava in «10 set» e «2026», due righe per un dato che
                      si legge in un colpo d'occhio — e che facevano crescere
                      l'altezza di ogni riga della tabella. */}
                  <Td densita="ariosa" className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {g.lastVisitAt ? formatDate(g.lastVisitAt) : "—"}
                  </Td>
                  <Td densita="ariosa"><LoyaltyPill tier={g.loyaltyTier} /></Td>
                </Riga>
              );
            })}
          </Corpo>
        </Tabella>
      </div>
    </div>
  );
}

/**
 * Email e telefono: due righe, e si vede quale è quale.
 *
 * Erano `<p>{email}</p>` e `<p class="text-xs">{phone}</p>`, entrambe grigio
 * spento e attaccate: due stringhe lunghe, della stessa forma, senza niente
 * che dicesse quale fosse l'indirizzo e quale il numero se non leggerle. Su
 * una riga di elenco che si guarda per un secondo, questo vuol dire leggerle
 * tutte e due.
 *
 * Adesso l'icona dice il tipo prima che il testo venga letto, e le due righe
 * hanno peso diverso: l'email è il contatto principale — è quello che si
 * copia per scrivere — e sta nel colore del testo; il telefono le sta sotto,
 * più tenue e in cifre tabellari, che è la forma con cui si legge un numero.
 *
 * Le icone sono `text-tertiary-foreground` e non l'accento: devono dire di
 * che cosa si tratta, non attirare l'occhio. Sei righe con dodici icone
 * terracotta sarebbero una tabella di icone con del testo in mezzo.
 */
function Contatti({
  email,
  phone,
  compatto = false,
}: {
  email: string | null;
  phone: string | null;
  compatto?: boolean;
}) {
  if (!email && !phone) return <span className="text-sm text-tertiary-foreground">nessun contatto</span>;

  return (
    <div className={compatto ? "space-y-1" : "space-y-1.5"}>
      {email && (
        <p className="flex items-center gap-2 text-sm leading-tight">
          <Mail className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
          <span className="truncate" title={email}>{email}</span>
        </p>
      )}
      {phone && (
        <p className="flex items-center gap-2 text-sm leading-tight text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
          <span className="whitespace-nowrap tabular-nums">{phone}</span>
        </p>
      )}
    </div>
  );
}

/**
 * I tag scritti a mano, in riga.
 *
 * Erano testo separato da punti, indistinguibile dal resto della riga —
 * «3 visite · ultima il 12 agosto · VIP» — e quindi indistinguibile anche dai
 * tag che calcoliamo noi sulla scheda. Adesso sono pillole piene: chi legge
 * sa che quelle parole le ha scritte una persona del locale (§29).
 *
 * Due e poi il resto contato, non più tre: da quando le pillole stanno
 * **accanto** al nome invece che sotto, sono loro a contendergli la riga —
 * tre tag lunghi spingevano il nome a farsi troncare, ed è il nome la cosa
 * che si cerca. Il tetto senza il totale sarebbe una bugia («questo cliente
 * ha due tag» quando ne ha sette), quindi il resto si conta.
 */
const TAG_IN_RIGA = 2;

function Tag({ tags }: { tags?: string[] | null }) {
  if (!tags || tags.length === 0) return null;
  const restanti = tags.length - TAG_IN_RIGA;
  return (
    <>
      {tags.slice(0, TAG_IN_RIGA).map((t) => (
        <Etichetta key={t} linguaggio="manuale">
          {t}
        </Etichetta>
      ))}
      {restanti > 0 && (
        <span className="text-xs text-muted-foreground" title={tags.slice(TAG_IN_RIGA).join(" · ")}>
          +{restanti}
        </span>
      )}
    </>
  );
}
