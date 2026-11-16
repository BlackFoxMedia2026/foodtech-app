"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronRight, LogOut, Smartphone } from "lucide-react";
import type { StaffRole } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  primarieFuoriDallaBarra,
  profiloPerGruppo,
  type NavItem,
} from "@/components/shell/nav-items";
import { initials } from "@/lib/utils";

const NOME_RUOLO: Record<string, string> = {
  MANAGER: "Manager",
  RECEPTION: "Reception",
  WAITER: "Cameriere",
  MARKETING: "Marketing",
  READ_ONLY: "Sola lettura",
};

/**
 * La schermata «Altro» del telefono, fatta come la scheda «Profilo» di
 * un'app: chi sei in cima, poi le sezioni in gruppi di righe con la freccia,
 * in fondo l'uscita staccata.
 *
 * **Tre livelli di testo, e si distinguono a colpo d'occhio**: il titolo del
 * gruppo nel carattere dei titoli (20 px), il nome della voce a 17 px pieno,
 * la descrizione a 14 px spenta. La prima versione aveva tutto fra 12 e
 * 15 px con lo stesso peso, e nome e descrizione si leggevano come una
 * riga sola spezzata in due.
 *
 * La ricerca qui non c'è: è un gesto da fare dalla schermata in cui si sta,
 * non una destinazione.
 *
 * I gruppi sono gli stessi della scrivania, con gli stessi nomi: le sezioni
 * che non entrano in barra, gli strumenti del marketing (distesi, non a
 * fisarmonica — in una pagina c'è posto), «Gestione» e «Account» del menu
 * profilo. Le liste vengono da `nav-items.ts`, quindi permessi e telefono
 * comprato si applicano da soli.
 */
export function PaginaAltro({
  user,
  venueName,
  role,
  telefonoAttivo,
  conStaffApp,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  venueName: string;
  role: StaffRole;
  telefonoAttivo: boolean;
  conStaffApp: boolean;
}) {
  const sezioni = primarieFuoriDallaBarra(telefonoAttivo, role);
  const semplici = sezioni.filter((s) => !s.sottovoci);
  const conSottovoci = sezioni.filter((s) => s.sottovoci);
  const profilo = profiloPerGruppo(role);
  const vistaServizio: NavItem = {
    href: "/staff-app",
    label: "Vista di servizio",
    icon: Smartphone,
    descrizione: "L'app di chi lavora in sala",
  };

  return (
    <div className="animate-fade-in mx-auto flex w-full max-w-xl flex-col gap-8 pb-6">
      {/* Chi sei: centrato e grande, come la testata del profilo di un'app,
          dentro una scheda sua. Senza la scheda il profilo galleggiava sullo
          sfondo e «Sezioni» sembrava la sua riga successiva: la cornice
          dice che sono due cose diverse — chi sei, e dove puoi andare. */}
      <section className="riquadro relative mb-2 flex flex-col items-center overflow-hidden px-6 pb-6 pt-8 text-center">
        {/* La fascia verde di copertina dietro la foto è stata provata e tolta
            (16 nov): pesava più del ritratto. Basta la scheda. */}
        <Avatar className="avatar-cornice relative h-28 w-28 rounded-full border-4 border-background shadow-lg">
          {user.image && (
            <AvatarImage src={user.image} alt="" className="object-cover" />
          )}
          <AvatarFallback className="avatar-oro rounded-full bg-foreground text-3xl text-background">
            {initials(user.name ?? user.email)}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-display mt-4 text-[28px] leading-tight">
          {user.name ?? "Il tuo profilo"}
        </h1>
        {user.email && (
          <p className="mt-1 text-base text-muted-foreground">{user.email}</p>
        )}
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-sm font-medium text-foreground">
          {NOME_RUOLO[role] ?? role}
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          {venueName}
        </p>
      </section>

      {semplici.length > 0 && (
        <Gruppo titolo="Sezioni">
          {semplici.map((v) => (
            <Riga key={v.href} voce={v} />
          ))}
        </Gruppo>
      )}

      {conSottovoci.map((s) => (
        <Gruppo key={s.href} titolo={s.label}>
          {s.sottovoci!.map((v) => (
            <Riga key={v.href} voce={v} />
          ))}
        </Gruppo>
      ))}

      {profilo.map((g) => (
        <Gruppo key={g.label} titolo={g.label}>
          {g.voci.map((v) => (
            <Riga key={v.href} voce={v} />
          ))}
          {g.label === "Account" && conStaffApp && <Riga voce={vistaServizio} />}
        </Gruppo>
      ))}

      {/* Se il ruolo non ha «Account» (niente Impostazioni), la Staff App
          resta raggiungibile in un gruppo suo. */}
      {conStaffApp && !profilo.some((g) => g.label === "Account") && (
        <Gruppo titolo="Account">
          <Riga voce={vistaServizio} />
        </Gruppo>
      )}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/sign-in" })}
        className="riquadro flex min-h-[56px] w-full items-center justify-center gap-2 px-4 text-[17px] font-semibold text-destructive active:bg-current/10"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        Esci
      </button>
    </div>
  );
}

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-display mb-3 px-1 text-[20px] leading-tight text-foreground">{titolo}</h2>
      <ul className="riquadro divide-y divide-border overflow-hidden">{children}</ul>
    </section>
  );
}

function Riga({ voce }: { voce: NavItem }) {
  const Icon = voce.icon;
  return (
    <li>
      <Link
        href={voce.href}
        className="flex min-h-[64px] items-center gap-4 px-4 py-3 transition-colors active:bg-current/10"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cta text-cta-ink shadow-sm">
          <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-snug text-foreground">
            {voce.label}
          </span>
          {voce.descrizione && (
            <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
              {voce.descrizione}
            </span>
          )}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
