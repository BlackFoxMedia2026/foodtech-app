import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { Header } from "@/components/shell/header";
import { BrandSetupDialog } from "@/components/settings/brand-setup-dialog";
import { can, getActiveVenue } from "@/lib/tenant";
import { VenueTimeProvider } from "@/components/shell/venue-time-provider";
import { MobileNav } from "@/components/shell/mobile-nav";
import { AvvisiProvider } from "@/components/ui/avvisi";
import { ProviderImpostazioni } from "@/components/settings/contesto-impostazioni";
import { statoCentralino } from "@/server/licenza-centralino";

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
  /* La voce «Telefono» in barra compare solo se il locale ce l'ha. La lettura
     è una riga e una firma da verificare, e sta nel guscio perché la barra è
     qui: farla dentro la pagina vorrebbe dire una barra che cambia dopo. */
  const telefono = await statoCentralino(ctx.venueId);
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
        telefonoAttivo={telefono.attivo}
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

      <MobileNav telefonoAttivo={telefono.attivo} canManageBookings={can(ctx.role, "manage_bookings")} />
      {showBrandSetup && <BrandSetupDialog initialName={ctx.venue.name} />}
    </div>
    </ProviderImpostazioni>
    </AvvisiProvider>
  );
}
