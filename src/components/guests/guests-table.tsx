"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
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
}: {
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
    router.push(`${pathname}?${sp.toString()}`);
  }

  function onTagFilter(tag: string) {
    const sp = new URLSearchParams(search);
    if (tag && tag !== ALL_TAGS) sp.set("tag", tag);
    else sp.delete("tag");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    // La ricerca resta fissa, la tabella prende l'altezza che avanza: si
    // cerca senza perdere il campo di ricerca sotto lo scorrimento.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="fissa flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            defaultValue={search.get("q") ?? ""}
            placeholder="Cerca per nome, email o telefono…"
            className="pl-8"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        {availableTags.length > 0 && (
          <Select defaultValue={search.get("tag") ?? ALL_TAGS} onValueChange={onTagFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtra per tag" />
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
          in orizzontale. Sotto `md` le stesse righe diventano schede, dove
          tutto ciò che conta sta su due righe di testo. */}
      <ul className="fill-scroll space-y-2 pr-0.5 md:hidden">
        {rows.length === 0 && (
          <li className="riquadro comodo text-center text-sm text-muted-foreground">Nessun ospite trovato.</li>
        )}
        {rows.map((g) => {
          const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
          return (
            <li key={g.id}>
              <Link href={`/guests/${g.id}`} className="riquadro denso flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {g.totalVisits} {g.totalVisits === 1 ? "visita" : "visite"}
                    {g.lastVisitAt ? ` · ultima il ${formatDate(g.lastVisitAt)}` : " · mai venuto"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{g.email ?? g.phone ?? "nessun contatto"}</p>
                  <Tag tags={g.tags} />
                </div>
                <LoyaltyPill tier={g.loyaltyTier} />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* La stessa tabella delle prenotazioni, densità comoda: qui si legge,
          non si lavora durante il servizio. */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
      <Tabella fill>
        <Testa>
          <Th>Ospite</Th>
          <Th>Contatti</Th>
          <Th>Visite</Th>
          <Th>Spesa totale</Th>
          <Th>Ultima visita</Th>
          <Th>Fedeltà</Th>
        </Testa>
        <Corpo>
            {rows.length === 0 && <RigaVuota colonne={6}>Nessun ospite trovato.</RigaVuota>}
            {rows.map((g) => {
              const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
              return (
                <Riga key={g.id} className="cursor-pointer">
                  <Td>
                    <Link href={`/guests/${g.id}`} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{name}</p>
                        <Tag tags={g.tags} />
                      </div>
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <p>{g.email ?? "—"}</p>
                    <p className="text-xs">{g.phone ?? ""}</p>
                  </Td>
                  <Td className="tabular-nums">{g.totalVisits}</Td>
                  {/* Non `Guest.totalSpend`, che nessuno scrive: la somma dei
                      conti chiusi di questa persona. Chi non ne ha, non ha
                      speso «zero» — non l'abbiamo ancora misurato, e le due
                      cose vanno dette in modo diverso. */}
                  <Td className="tabular-nums">
                    {spesaCents[g.id] != null ? (
                      formatCurrency(spesaCents[g.id])
                    ) : (
                      <span className="text-tertiary-foreground">non ancora</span>
                    )}
                  </Td>
                  <Td className="text-muted-foreground tabular-nums">
                    {g.lastVisitAt ? formatDate(g.lastVisitAt) : "—"}
                  </Td>
                  <Td><LoyaltyPill tier={g.loyaltyTier} /></Td>
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
 * I tag scritti a mano, in riga.
 *
 * Erano testo separato da punti, indistinguibile dal resto della riga —
 * «3 visite · ultima il 12 agosto · VIP» — e quindi indistinguibile anche dai
 * tag che calcoliamo noi sulla scheda. Adesso sono pillole piene: chi legge
 * sa che quelle parole le ha scritte una persona del locale (§29).
 *
 * Tre e poi il resto contato. Il tetto senza il totale sarebbe una bugia
 * — «questo cliente ha tre tag» quando ne ha sette — e su una riga di elenco
 * sette pillole mangiano la riga.
 */
const TAG_IN_RIGA = 3;

function Tag({ tags }: { tags?: string[] | null }) {
  if (!tags || tags.length === 0) return null;
  const restanti = tags.length - TAG_IN_RIGA;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
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
    </span>
  );
}
