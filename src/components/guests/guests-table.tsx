"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { Guest } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { LoyaltyPill } from "./loyalty-pill";
import { formatCurrency, formatDate, initials } from "@/lib/utils";

export function GuestsTable({ rows }: { rows: Guest[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function onSearch(q: string) {
    const sp = new URLSearchParams(search);
    if (q) sp.set("q", q);
    else sp.delete("q");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          defaultValue={search.get("q") ?? ""}
          placeholder="Cerca per nome, email o telefono…"
          className="pl-8"
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Ospite</th>
              <th className="px-4 py-3 text-left">Contatti</th>
              <th className="px-4 py-3 text-left">Visite</th>
              <th className="px-4 py-3 text-left">Spesa totale</th>
              <th className="px-4 py-3 text-left">Ultima visita</th>
              <th className="px-4 py-3 text-left">Fedeltà</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  Nessun ospite trovato.
                </td>
              </tr>
            )}
            {rows.map((g) => {
              const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
              return (
                <tr key={g.id} className="cursor-pointer transition-colors hover:bg-secondary/30">
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>{g.email ?? "—"}</p>
                    <p className="text-xs">{g.phone ?? ""}</p>
                  </td>
                  <td className="px-4 py-3">{g.totalVisits}</td>
                  <td className="px-4 py-3">
                    {formatCurrency(Math.round(Number(g.totalSpend) * 100))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {g.lastVisitAt ? formatDate(g.lastVisitAt) : "—"}
                  </td>
                  <td className="px-4 py-3"><LoyaltyPill tier={g.loyaltyTier} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
