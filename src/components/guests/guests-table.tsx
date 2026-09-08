"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { Guest } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoyaltyPill } from "./loyalty-pill";
import { formatCurrency, formatDate, initials } from "@/lib/utils";
import { Corpo, Riga, RigaVuota, Tabella, Td, Testa, Th } from "@/components/ui/table";

const ALL_TAGS = "__all__";

export function GuestsTable({ rows, availableTags }: { rows: Guest[]; availableTags: string[] }) {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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

      {/* La stessa tabella delle prenotazioni, densità comoda: qui si legge,
          non si lavora durante il servizio. */}
      <Tabella>
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
                        {g.tags?.length > 0 && (
                          <p className="text-xs text-muted-foreground">{g.tags.join(" · ")}</p>
                        )}
                      </div>
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <p>{g.email ?? "—"}</p>
                    <p className="text-xs">{g.phone ?? ""}</p>
                  </Td>
                  <Td className="tabular-nums">{g.totalVisits}</Td>
                  <Td className="tabular-nums">
                    {formatCurrency(Math.round(Number(g.totalSpend) * 100))}
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
  );
}
