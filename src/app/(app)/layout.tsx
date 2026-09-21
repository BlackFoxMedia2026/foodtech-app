import { redirect } from "next/navigation";
import { Fraunces, Inter, Space_Mono } from "next/font/google";
import { Header } from "@/components/shell/header";
import { BrandSetupDialog } from "@/components/settings/brand-setup-dialog";
import { can, getActiveVenue } from "@/lib/tenant";
import { VenueTimeProvider } from "@/components/shell/venue-time-provider";
import { MobileNav } from "@/components/shell/mobile-nav";
import { AvvisiProvider } from "@/components/ui/avvisi";
import { statoCentralino } from "@/server/licenza-centralino";
import { versioneServizio } from "@/server/versione-servizio";
import { statoTelefonoBrowser } from "@/server/telefono-browser";
import { RISPONDE_DAL_BROWSER } from "@/lib/rispondere-da-tavolo";
import { capacitaDi } from "@/server/voice/provider";
import { TelefonoBrowser } from "@/components/telefono/telefono-browser";
import { VoiceGlobale } from "@/components/telefono/voice-globale";
import { risolviContestoStaff } from "@/server/contesto-staff";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
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

    Prima delle letture del telefono, e non dopo: chi viene rimandato alla
    Staff App non deve pagare tre interrogazioni per una schermata che non
    vedrà.
  */
  const staff = await risolviContestoStaff();
  if (staff.stato === "ok" && staff.contesto.staffAppEHome)
    redirect("/staff-app");

  /* Chi ha entrambe le vedute trova la Staff App nel menu del profilo. */
  const conStaffApp = staff.stato === "ok";

  /* La voce «Telefono» in barra compare solo se il locale ce l'ha. La lettura
     è una riga e una firma da verificare, e sta nel guscio perché la barra è
     qui: farla dentro la pagina vorrebbe dire una barra che cambia dopo. */
  const telefono = await statoCentralino(ctx.venueId);
  /* La versione del servizio **al momento di questa pagina**, solo per i
     locali che hanno il telefono: è il punto di partenza della sonda, e senza
     una chiamata che arriva nei primi cinque secondi non farebbe comparire
     niente. Per tutti gli altri — cioè quasi tutti — non si interroga. */
  /*
    Il telefono, per **questa** persona.

    Due condizioni e non una: il locale l'ha collegato, e chi guarda può
    rispondere. Fino a ieri bastava la prima — la voce in barra compariva a
    tutti i membri del locale, e la pagina dietro non guardava il ruolo: un
    accesso in sola lettura leggeva nomi, numeri e chiamate perse.

    Da qui passano tutte e tre le cose del guscio — la voce in barra, quella
    nella barra del telefono, e il pannello della chiamata — così non possono
    divergere.
  */
  const telefonoPerMe = telefono.attivo && can(ctx.role, "use_phone");
  const versione = telefonoPerMe
    ? await versioneServizio(ctx.venueId)
    : undefined;

  /*
    Rispondere **dentro Tavolo**, da qualunque schermata.

    Il telefono nel browser stava sulla pagina Telefono: chi guardava la carta
    vedeva squillare — il riquadro della chiamata è nel guscio dalla fase 3 —
    e per rispondere doveva cambiare pagina. Con una telefonata che dura venti
    secondi, quel cambio di pagina è la telefonata persa.

    Tre condizioni, e nessuna è una ripetizione: il locale ha il telefono e
    chi guarda può rispondere (`telefonoPerMe`), i dati SIP sono configurati
    (`pronto`), e il fornitore sa fare WebRTC (`browser`) — i dati SIP possono
    essere su una linea che non lo fa, e il riquadro si collegherebbe a vuoto.
  */
  /*
    **Spento**: in questo prodotto Tavolo non risponde alle telefonate.

    Risponde il cellulare del locale; se non risponde o è occupato, la
    telefonata la prende il risponditore del centralino. Vedi
    `src/lib/rispondere-da-tavolo.ts` — la costante è una sola perché
    riaccendere questa funzione deve costare una riga, non una caccia.

    Quando è spento non si interroga nemmeno il database per i dati SIP: sono
    due letture per schermata che non servirebbero a niente.
  */
  const sip =
    telefonoPerMe && RISPONDE_DAL_BROWSER
      ? await statoTelefonoBrowser(ctx.venueId)
      : { pronto: false };
  const capacita =
    telefonoPerMe && RISPONDE_DAL_BROWSER && sip.pronto
      ? await capacitaDi(ctx.venueId)
      : null;
  const rispondeQui = Boolean(
    RISPONDE_DAL_BROWSER && telefonoPerMe && sip.pronto && capacita?.browser,
  );
  const showBrandSetup =
    ctx.venue.onboardingStatus === "NOT_STARTED" &&
    can(ctx.role, "manage_venue");

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
      Il telefono addosso, su qualunque pagina.

      Sta qui e non dentro Servizio perché una telefonata dura venti secondi e
      non aspetta che qualcuno cambi pagina: chi guardava la carta o la scheda
      di un cliente non vedeva squillare niente. Quando il locale non ha il
      telefono non interroga nulla — che è il caso di quasi tutti.
    */}
      <VoiceGlobale
        attivo={telefonoPerMe}
        versione={versione}
        telefono={
          rispondeQui && capacita ? (
            <TelefonoBrowser capacita={capacita} discreto />
          ) : null
        }
      >
        <div
          className={`${sans.variable} ${display.variable} ${mono.variable} relative z-0 flex h-screen flex-col overflow-hidden bg-background text-foreground`}
        >
          <Header
            user={{
              name: ctx.session.user?.name,
              email: ctx.session.user?.email,
            }}
            venues={venueList}
            activeVenueId={ctx.venueId}
            role={ctx.role}
            telefonoAttivo={telefonoPerMe}
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
            <VenueTimeProvider timezone={ctx.venue.timezone}>
              {children}
            </VenueTimeProvider>
          </main>

          <MobileNav
            telefonoAttivo={telefonoPerMe}
            canManageBookings={can(ctx.role, "manage_bookings")}
            role={ctx.role}
          />
          {showBrandSetup && <BrandSetupDialog initialName={ctx.venue.name} />}
        </div>
      </VoiceGlobale>
    </AvvisiProvider>
  );
}
