import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { statoTelefonoBrowser } from "@/server/telefono-browser";
import { saluteVoice } from "@/server/voice/salute";
import { vistaIngresso } from "@/server/voice/ingresso";
import { vistaBenvenuto } from "@/server/voice/benvenuto";
import { CollegaTelefono } from "@/components/settings/collega-telefono";

export const dynamic = "force-dynamic";

/**
 * Collegare il telefono: la pagina con i passi.
 *
 * ## Perché non sta nelle Impostazioni con le altre righe
 *
 * Perché collegare un telefono è **un lavoro che si fa una volta**, in un
 * ordine preciso, e le righe di una scheda di impostazioni sono fatte per
 * mostrare dei valori — tutti insieme, senza ordine. Dodici righe che
 * mostravano contemporaneamente la chiave, i dati SIP, il codice del locale e
 * la chiave di collegamento non dicevano da dove cominciare, e chi le
 * guardava doveva sapere già cosa fare.
 *
 * La scheda in Impostazioni → Sistema → Telefono resta, e dice **com'è
 * adesso**: collegato o no, l'ultima chiamata, cosa la linea non sa fare. Le
 * cose da **fare** sono qui.
 *
 * ## Perché non è protetta dalla licenza
 *
 * Le altre pagine del telefono rispondono 404 senza licenza — una funzione non
 * comprata non esiste. Questa no, e sarebbe un errore: è la pagina che serve
 * **prima** che la licenza ci sia, e chiuderla a chi deve incollarla vorrebbe
 * dire un telefono che non si può accendere.
 *
 * Chiede `manage_phone`: la chiave della licenza e le credenziali SIP sono un
 * numero da cui si telefona a spese del locale.
 */
export default async function CollegaTelefonoPage() {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_phone")) notFound();

  /* L'indirizzo di **questa** installazione, non uno scritto a mano: è quello
     che il centralino deve chiamare, e se qui ci fosse una costante il giorno
     del cambio di dominio nessuno se ne accorgerebbe fino alla prima chiamata
     non consegnata. */
  const hdrs = headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const indirizzo = `${proto}://${host}`;

  const [stato, sip, salute, ingresso, benvenuto] = await Promise.all([
    statoCentralino(ctx.venueId),
    statoTelefonoBrowser(ctx.venueId),
    saluteVoice(ctx.venueId),
    vistaIngresso(ctx.venueId),
    vistaBenvenuto(ctx.venueId),
  ]);

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-3xl gap-4">
      <div className="fissa">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings?sez=centralino">
            <ArrowLeft className="h-4 w-4" /> Torna alle impostazioni
          </Link>
        </Button>
      </div>

      <header className="fissa">
        <p className="t-etichetta">Telefono</p>
        <h1 className="text-display text-2xl">Collega il telefono</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un passo per volta. Quello che è già fatto porta la spunta: si può
          chiudere questa pagina e riprendere da dove si era.
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <CollegaTelefono
          venueId={ctx.venueId}
          indirizzo={indirizzo}
          licenzaAttiva={stato.attivo}
          chiaveLeggibile={stato.chiaveLeggibile}
          motivoSpento={stato.motivoSpento}
          collegamentoAttivo={salute.collegamentoAttivo}
          ultimaChiamata={salute.ultimaChiamata?.toISOString() ?? null}
          sip={{
            pronto: sip.pronto,
            server: sip.server,
            utente: sip.utente,
            passwordPresente: sip.passwordPresente,
            sottoChiave: sip.sottoChiave,
          }}
          accesoDaNoi={stato.origine === "piattaforma"}
          benvenuto={benvenuto}
          ingresso={{
            ingresso: ingresso.ingresso,
            numeroPubblico: ingresso.numeroPubblico,
            operatore: ingresso.operatore,
            squilliChiesti: ingresso.squilliChiesti,
            numeroTavolo: ingresso.numeroTavolo,
            provata: ingresso.provata,
          }}
          canManage={can(ctx.role, "manage_phone")}
        />
      </div>
    </div>
  );
}
