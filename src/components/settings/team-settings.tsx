"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, LogOut, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";
import { initials } from "@/lib/utils";
import type { InvitoView, MembroView } from "@/server/team";

/**
 * Chi lavora qui, e come gli si dà accesso.
 *
 * Prima questa scheda **elencava** le persone e nient'altro: i cinque ruoli
 * esistevano e non c'era modo di assegnarli. Ora si invita, si cambia ruolo e
 * si toglie l'accesso.
 *
 * L'invito è un **link da consegnare a mano**, e la scheda lo dice: l'invio
 * automatico non c'è finché manca la chiave del fornitore email, e far finta
 * di aver spedito è la bugia che questo progetto non racconta. Il link si
 * copia e si manda su WhatsApp, come si fa già col QR del menu.
 */

const RUOLI = [
  { valore: "MANAGER", nome: "Manager", cosa: "tutto, compresi team e impostazioni" },
  { valore: "RECEPTION", nome: "Reception", cosa: "prenotazioni, sala, ospiti" },
  { valore: "WAITER", nome: "Cameriere", cosa: "prenotazioni e sala durante il servizio" },
  { valore: "MARKETING", nome: "Marketing", cosa: "campagne, coupon e numeri" },
  { valore: "READ_ONLY", nome: "Sola lettura", cosa: "guarda, non tocca" },
] as const;

const NOME_RUOLO: Record<string, string> = Object.fromEntries(RUOLI.map((r) => [r.valore, r.nome]));

export function TeamSettings({
  membri,
  inviti,
  canManage,
}: {
  membri: MembroView[];
  inviti: InvitoView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [email, setEmail] = useState("");
  const [ruolo, setRuolo] = useState<string>("RECEPTION");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiato, setCopiato] = useState<string | null>(null);

  async function invita(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role: ruolo }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a creare l'invito."));
      return;
    }
    setEmail("");
    setApri(false);
    router.refresh();
  }

  async function azione(url: string, init: RequestInit, fallback: string) {
    setError(null);
    const res = await fetch(url, init);
    if (!res.ok) {
      setError(await readApiError(res, fallback));
      return;
    }
    router.refresh();
  }

  async function copia(link: string) {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopiato(link);
    setTimeout(() => setCopiato(null), 2500);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Team</CardTitle>
          <CardDescription>Chi ha accesso a questo locale, e con quale ruolo.</CardDescription>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setApri(!apri)}>
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {apri ? "Annulla" : "Invita"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {apri && canManage && (
          <form onSubmit={invita} className="space-y-3 riquadro p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-1.5">
                <Label htmlFor="team-email">Email della persona</Label>
                <Input
                  id="team-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="maria@ristorante.it"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="team-ruolo">Ruolo</Label>
                <Select value={ruolo} onValueChange={setRuolo}>
                  <SelectTrigger id="team-ruolo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUOLI.map((r) => (
                      <SelectItem key={r.valore} value={r.valore}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-tertiary-foreground">
              {RUOLI.find((r) => r.valore === ruolo)?.cosa}. Creando l&apos;invito ottieni un{" "}
              <strong>link da consegnare</strong>: Tavolo non manda email finché non è configurato il
              fornitore, quindi il link si copia e si manda a mano. Vale sette giorni e una volta sola.
            </p>
            <Button type="submit" variant="accent" size="sm" disabled={inCorso || !email.trim()}>
              {inCorso ? "Creo l'invito…" : "Crea l'invito"}
            </Button>
          </form>
        )}

        {inviti.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Inviti in attesa
            </p>
            {inviti.map((i) => (
              <div key={i.id} className="rounded-md border border-accent/30 bg-accent/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {NOME_RUOLO[i.role]} · scade il{" "}
                      {new Date(i.scadeIl).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => copia(i.link)}>
                        {copiato === i.link ? (
                          <>
                            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copiato
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copia il link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Ritira l'invito di ${i.email}`}
                        onClick={() =>
                          azione(
                            `/api/team/invites/${i.id}`,
                            { method: "DELETE" },
                            "Non siamo riusciti a ritirare l'invito.",
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {membri.map((m) => (
          <div
            key={m.membershipId}
            className="flex flex-wrap items-center justify-between gap-3 riquadro p-3 text-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(m.nome ?? m.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.nome ?? m.email}
                  {m.seiTu && <span className="ml-2 text-xs text-muted-foreground">(tu)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>

            {canManage && !m.seiTu ? (
              <div className="flex items-center gap-1">
                <Select
                  value={m.role}
                  onValueChange={(v) =>
                    azione(
                      `/api/team/members/${m.membershipId}`,
                      {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ role: v }),
                      },
                      "Non siamo riusciti a cambiare il ruolo.",
                    )
                  }
                >
                  <SelectTrigger className="w-[10.5rem]" aria-label={`Ruolo di ${m.nome ?? m.email}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUOLI.map((r) => (
                      <SelectItem key={r.valore} value={r.valore}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Chiudere le sessioni non è togliere l'accesso: la persona
                    rientra con la sua password. Serve per il tablet lasciato
                    aperto in sala, e come prima cosa da fare quando qualcuno
                    non lavora più qui — prima ancora di togliergli il ruolo. */}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Chiudi le sessioni di ${m.nome ?? m.email} su tutti i dispositivi`}
                  title="Chiudi le sessioni su tutti i dispositivi"
                  onClick={() =>
                    azione(
                      `/api/team/members/${m.membershipId}/sessioni`,
                      { method: "DELETE" },
                      "Non siamo riusciti a chiudere le sessioni.",
                    )
                  }
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Togli l'accesso a ${m.nome ?? m.email}`}
                  onClick={() =>
                    azione(
                      `/api/team/members/${m.membershipId}`,
                      { method: "DELETE" },
                      "Non siamo riusciti a togliere l'accesso.",
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              /* Su di sé non si agisce: il ruolo si legge, non si cambia. È la
                 difesa contro il modo più comune di restare fuori dal proprio
                 locale, e vale anche sul server. */
              <Badge tone="neutral">{NOME_RUOLO[m.role]}</Badge>
            )}
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
