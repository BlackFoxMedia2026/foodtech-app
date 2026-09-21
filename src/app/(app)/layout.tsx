import { redirect } from "next/navigation";
import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { Header } from "@/components/shell/header";
import { BrandSetupDialog } from "@/components/settings/brand-setup-dialog";
import { can, getActiveVenue } from "@/lib/tenant";
import { VenueTimeProvider } from "@/components/shell/venue-time-provider";
import { MobileNav } from "@/components/shell/mobile-nav";
import { AvvisiProvider } from "@/components/ui/avvisi";
import { ProviderImpostazioni } from "@/components/settings/contesto-impostazioni";
import { risolviContestoStaff } from "@/server/contesto-staff";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveVenue();

  /*
    **Il bivio fra i due ambienti** (§48 del brief).

    Chi lavora durante il servizio non deve atterrare nel back office e poi
    cercare la strada: la Staff App è casa sua, e ci arriva entrando. La
    regola sta in `staffAppEHome()` ed è scritta sul ruolo d'accesso, cioè su
    una decisione che qualcuno ha preso creando l'account.

    Sta qui e non nel middleware perché il middleware gira sull'edge, senza
    Prisma: per sapere se questo account ha un'anagrafica collegata serve una
    lettura del database, e questo è il primo punto del rendering in cui si
    può fare. Non è una difesa — le difese stanno nelle rotte e nelle pagine,
    una per una — è un instradamento.
  */
  const staff = await risolviContestoStaff();
  if (staff.stato === "ok" && staff.contesto.staffAppEHome) redirect("/staff-app");

  /* Chi ha entrambe le vedute trova la Staff App nel menu del profilo. */
  const conStaffApp = staff.stato === "ok";

  const showBrandSetup = ctx.venue.onboardingStatus === "NOT_STARTED" && can(ctx.role, "manage_venue");

  const venueList = ctx.allMemberships.map((m) => ({
    id: m.venue.id,
    name: m.venue.name,
    city: m.venue.city,
  }));

  return (
    /*
      `AvvisiProvider` avvolge l'area operativa e non le pagine pubbliche: gli
      avvisi con «annulla» servono a chi lavora, e un cliente che prenota non
      deve poter annullare niente da un messaggio che passa.
    */
    <AvvisiProvider>
    {/*
      Le quattro sezioni delle Impostazioni stanno nella pagina, e le quattro
      voci che ci portano stanno nella testata — che è qui, fuori dalla pagina.
      Il provider è il filo fra le due: sta a questo livello perché è il primo
      antenato che contiene sia l'una sia l'altra, e non costa niente alle
      schermate che non lo usano (un contesto senza consumatori non
      ri-renderizza nessuno).
    */}
    <ProviderImpostazioni>
    <div className={`${sans.variable} ${display.variable} ${mono.variable} relative z-0 flex h-screen flex-col overflow-hidden bg-background text-foreground`}>
      <Header
        user={{ name: ctx.session.user?.name, email: ctx.session.user?.email }}
        venues={venueList}
        activeVenueId={ctx.venueId}
        role={ctx.role}
        conStaffApp={conStaffApp}
      />
      {/*
        `main` dà la sua altezza alle pagine invece di scorrere.
        
        Prima era lui il contenitore che scorreva, e una pagina più alta dello
        schermo si trascinava: è lo scroll che non vogliamo. Adesso ha
        un'altezza definita (quello che avanza sotto la testata) e
        `min-h-0`, così una pagina costruita con `.schermo` la riceve tutta e
        decide **al suo interno** cosa scorre. Resta `overflow-y-auto` come
        rete: una pagina non ancora convertita scorre invece di tagliare il
        contenuto, che sarebbe peggio.
        
        `pb-24` su telefono è lo spazio della barra in basso, altrimenti
        l'ultima riga finisce sotto la navigazione.
      */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-24 pt-4 md:px-6 md:pb-6 md:pt-5 lg:px-8">
        <VenueTimeProvider timezone={ctx.venue.timezone}>{children}</VenueTimeProvider>
      </main>

      <MobileNav canManageBookings={can(ctx.role, "manage_bookings")} role={ctx.role} />
      {showBrandSetup && <BrandSetupDialog initialName={ctx.venue.name} />}
    </div>
    </ProviderImpostazioni>
    </AvvisiProvider>
  );
}
