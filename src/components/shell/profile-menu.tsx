"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Smartphone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROFILE_NAV, isNavActive, profiloPerGruppo } from "@/components/shell/nav-items";
import type { StaffRole } from "@prisma/client";
import { cn, initials } from "@/lib/utils";

/**
 * Il menu del profilo è il **secondo piano** della navigazione.
 *
 * Prima portava due voci — Impostazioni ed Esci — e la barra in alto portava
 * un dropdown «Altro» con dentro sia le cose del servizio sia quelle
 * dell'ufficio. Adesso la divisione è una sola, e si spiega in una riga: in
 * barra ciò che si tocca a locale aperto, qui ciò che si apre a locale chiuso.
 *
 * Perché sotto l'avatar e non in un terzo posto: è dove chiunque cerca le
 * impostazioni, quindi non c'è niente da insegnare — e l'avatar c'è su tutti
 * gli schermi, telefono compreso, dove la barra in alto non porta voci.
 *
 * Tre cose lo tengono leggibile con cinque voci invece di due:
 *
 * - **due gruppi con l'etichetta**, «Gestione» e «Account»: il ristorante che
 *   cresce da una parte, chi sta usando il prodotto dall'altra;
 * - **«Esci» staccato in fondo**, dopo un separatore: è l'unica voce che non
 *   porta da nessuna parte, e un clic per sbaglio costa una riconnessione;
 * - **la voce aperta si vede**, come nella barra: senza, una sezione del menu
 *   profilo è l'unico posto del prodotto dove non si sa dove si è.
 */
export function ProfileMenu({
  user,
  role,
  /** Vero quando questa persona ha anche l'app di servizio: si offre la strada. */
  conStaffApp = false,
}: {
  user: { name?: string | null; email?: string | null };
  role: StaffRole;
  conStaffApp?: boolean;
}) {
  const pathname = usePathname();
  const gruppi = profiloPerGruppo(role);
  /*
    Chi sta dentro una voce del menu profilo (Esperienze, Pagamenti, Attesa,
    Impostazioni) non ha nessuna voce accesa in barra: l'unico segno di dove si
    trova è l'avatar. Un anello crema — lo stesso
    colore della pillola attiva — e la domanda «da dove ci sono arrivato?» ha
    una risposta visibile senza aprire niente.
  */
  const dentroIlMenu = PROFILE_NAV.some((item) => isNavActive(pathname, item));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu profilo"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar
            className={cn(
              "h-[46px] w-[46px] rounded-lg border border-border",
              dentroIlMenu && "border-cream ring-2 ring-cream/40",
            )}
          >
            <AvatarFallback className="rounded-lg bg-foreground text-background">
              {initials(user.name ?? user.email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {gruppi.map((gruppo, i) => (
          <div key={gruppo.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {gruppo.label}
            </DropdownMenuLabel>
            {gruppo.voci.map((item) => {
              const Icon = item.icon;
              const attiva = isNavActive(pathname, item);
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={attiva ? "page" : undefined}
                    className={cn("flex items-center gap-2.5", attiva && "font-medium text-popover-foreground")}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}

        {conStaffApp && (
          /*
            La strada per l'app di servizio.
            
            Sta qui e non in barra perché chi ha tutte e due le vedute è un
            responsabile che lavora in ufficio e ogni tanto scende in sala:
            passa di qua una volta a servizio, non venti volte al giorno. Chi
            invece **vive** in sala non vede mai questa testata — entra
            direttamente nella Staff App.
          */
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/staff-app" className="flex items-center gap-2.5">
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                Vista di servizio
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/sign-in" })}>
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Esci
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
