import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { getContestoStaff } from "@/lib/staff-auth";
import { puo } from "@/lib/permessi-staff";
import { salutoCon } from "@/lib/saluto";
import { TestataSaluto } from "@/components/staff-app/testata-staff";
import { CardTurno, ProssimoTurno } from "@/components/staff-app/card-turno";
import {
  DaAccomodareHome,
  DaFare,
  Sezione,
  type CosaDaFare,
} from "@/components/staff-app/sezioni-home";
import { TavoliHome } from "@/components/staff-app/tavoli-home";
import { RIQUADRO_GLIFO, scalaPerGlifi } from "@/components/staff-app/glifo-tavolo";
import { prossimoTurno, turnoDiOggi } from "@/server/staff-app/turno";
import { salaDelCameriere, soloMiei, tavoliLiberi } from "@/server/staff-app/sala";
import { contaComandePronte } from "@/server/comande/comande";
import { scadenzeDi } from "@/server/staff-app/documenti";
import type { TavoloStaff } from "@/server/staff-app/sala";

export const dynamic = "force-dynamic";

/** Quante cose da fare stanno in Home. Il resto si trova in Sala e Comande. */
const MAX_DA_FARE = 3;

/**
 * **La Home della Staff App.**
 *
 * Una pagina, due profili. Non due rotte: chi apre l'app non deve sapere
 * quale versione gli tocca, e un cameriere promosso a sous-chef non deve
 * trovare un indirizzo che non funziona più.
 *
 * ## L'ordine, che è il progetto
 *
 * 1. **chi sei e dove sei** — due righe;
 * 2. **il turno**, due righe: un badge e una barra;
 * 3. **da accomodare** — chi è già dentro il locale e aspetta un tavolo;
 * 4. **da fare** — le tre cose che chiedono di alzarsi, se ce ne sono;
 * 5. **i miei tavoli** — disegnati, non descritti;
 * 6. **i tavoli liberi** — quattro, non dodici.
 *
 * Il terzo punto sta sopra il quarto perché una persona in piedi che guarda
 * la sala non aspetta il suo turno dietro a un piatto pronto.
 *
 * I primi tre punti stanno dentro i primi 300 px, che è quello che si vede
 * senza scorrere su un iPhone SE: turno, azione urgente e l'inizio dei
 * propri tavoli. Prima la sola card del turno ne occupava 210.
 *
 * ## Cosa è uscito, ed è la parte che conta
 *
 * - **ruolo, area e conteggio tavoli** dalla card del turno: il ruolo è chi
 *   sei, l'area la dice la Sala, i tavoli sono disegnati più in basso;
 * - **il riquadro delle comande**: le comande hanno una voce in barra, e
 *   quello che di loro riguarda *adesso* — un piatto pronto — è una riga di
 *   «Da fare», dove c'è scritto anche a quale tavolo portarlo;
 * - **il testo dalle card dei tavoli**: nome ospite, minuti, conto e stato
 *   per esteso si leggono aprendo il tavolo. In griglia erano sei righe per
 *   sei card, cioè la schermata che si scorre invece di guardarla.
 *
 * Niente incassi, niente coperti del giorno, niente andamento: durante il
 * servizio ogni riga che non risponde a «dove devo andare e cosa devo fare»
 * è una riga da scorrere per arrivare a quelle che rispondono.
 */
export default async function HomeStaff() {
  const ctx = await getContestoStaff();
  const adesso = new Date();

  const turno = await turnoDiOggi(ctx.venueId, ctx.persona.waiterId, ctx.timezone, adesso);

  const testata = (
    <TestataSaluto
      saluto={salutoCon(ctx.timezone, ctx.persona.nome, adesso)}
      locale={ctx.venueName}
      persona={ctx.persona}
    />
  );

  if (ctx.profilo === "CUCINA") {
    const [prossimo, scadenze] = await Promise.all([
      prossimoTurno(ctx.venueId, ctx.persona.waiterId, ctx.timezone, adesso),
      scadenzeDi(ctx.venueId, ctx.persona.waiterId),
    ]);

    return (
      <div className="schermo">
        {testata}
        <div className="fill-scroll space-y-5 px-5 pb-6">
          <div className="space-y-2.5">
            <CardTurno turno={turno} />
            <ProssimoTurno turno={prossimo} />
          </div>

          {scadenze.length > 0 && (
            <Sezione titolo="Documenti in scadenza">
              <div className="sa-piano border-accent/50 p-4">
                <ul className="space-y-2">
                  {scadenze.map((s) => (
                    <li key={s.id} className="sa-corpo flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{s.titolo}</span>
                      <span
                        className={
                          s.scaduto
                            ? "sa-dato shrink-0 text-destructive-soft"
                            : "sa-dato shrink-0 text-accent-strong"
                        }
                      >
                        {s.quando}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/staff-app/documenti"
                  className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[0.9375rem] font-medium text-accent-strong"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Vedi i documenti
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </Sezione>
          )}
        </div>
      </div>
    );
  }

  /* Profilo sala. */
  const [sala, pronteInCucina] = await Promise.all([
    puo(ctx.permessi, "view_tables")
      ? salaDelCameriere(
          { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
          {
            adesso,
            tuttaLaSala: puo(ctx.permessi, "view_all_tables"),
            /*
              I liberi arrivano nella **stessa** lettura dei propri tavoli, non
              in una seconda: `salaDelCameriere` fa tre interrogazioni in tutto
              qualunque sia il numero di tavoli, e chiederle due volte per
              separare «i miei» dai «liberi» raddoppierebbe il costo della
              schermata che si apre più spesso di tutte.
            */
            ancheLiberi: true,
          },
        )
      : null,
    puo(ctx.permessi, "view_kitchen_status")
      ? contaComandePronte(ctx.venueId, ctx.persona.waiterId)
      : 0,
  ]);

  /*
    **Tutti**, non i primi quattro.

    I tavoli erano tagliati a quattro liberi e sei propri, con un «Tutti i 12»
    che rimandava alla Sala. Aveva senso quando erano righe di testo da
    leggere: sei righe sono mezzo schermo. Da quando sono tasti da premere il
    taglio è un difetto — si cerca il tavolo dodici, non lo si trova, e si
    scopre che bisogna aprire un'altra schermata per premere un tasto che
    qui c'era spazio per mostrare. Dodici tasti in griglia sono sei righe:
    si scorre una volta.
  */
  const miei = sala ? soloMiei(sala) : [];
  const liberi = sala ? tavoliLiberi(sala) : [];
  const daFare = cosaCeDaFare(sala?.tavoli ?? [], pronteInCucina);

  /*
    Una scala sola per tutti i disegni della schermata, calcolata sui tavoli
    che si stanno davvero mostrando. Sta qui e non dentro le griglie perché
    due griglie con due scale diverse renderebbero incomparabili i tavoli di
    sopra con quelli di sotto — e la ragione per cui li si disegna è proprio
    poterli confrontare a colpo d'occhio.
  */
  const scalaGlifi = scalaPerGlifi([...miei, ...liberi], RIQUADRO_GLIFO);

  return (
    <div className="schermo">
      {testata}
      <div className="fill-scroll space-y-5 px-5 pb-6">
        <CardTurno turno={turno} />

        {/* Chi è in piedi all'ingresso prima di tutto il resto: §1 e §2. */}
        {sala && <DaAccomodareHome ospiti={sala.daAccomodare} />}

        <DaFare cose={daFare} />

        {sala && (
          /*
            I tavoli sono tasti, e un tasto su un tavolo libero apre le
            **scelte** invece della schermata del tavolo: il perché sta in
            `tavoli-home.tsx`. Da qui passano solo i dati.
          */
          <TavoliHome
            miei={miei}
            liberi={liberi}
            scala={scalaGlifi}
            inAttesa={sala.daAccomodare.length}
            puoAccomodare={puo(ctx.permessi, "manage_tables")}
          />
        )}
      </div>
    </div>
  );
}

/**
 * **Cosa c'è da fare adesso**, in tre righe al massimo.
 *
 * I tavoli arrivano già ordinati per urgenza da `salaDelCameriere` — piatti
 * pronti, poi conti, poi allergie, poi note — quindi qui non si riordina
 * niente: si prendono i primi con un richiamo e si traducono in righe.
 *
 * ## La riga della cucina, e quando non c'è
 *
 * Un piatto pronto può arrivare da due parti: dal tavolo che lo aspetta
 * (`richiamo.tipo === "PIATTI_PRONTI"`) o dal conteggio delle comande
 * battute da questa persona. Sono lo stesso fatto visto dalla sala e dal
 * passe.
 *
 * Quando il tavolo lo dice già, **la riga della cucina non si aggiunge**:
 * «T4 · Piatti pronti» dice dove andare, «1 pronta in cucina» no, e messe
 * una sopra l'altra sono la ripetizione che questa schermata aveva in tre
 * punti su quattro. La riga della cucina compare solo quando nessun tavolo
 * visibile la copre — cioè quando il piatto pronto è di un tavolo che non
 * si sta guardando, ed è l'unico caso in cui aggiunge qualcosa.
 */
function cosaCeDaFare(tavoli: TavoloStaff[], pronteInCucina: number): CosaDaFare[] {
  const cose: CosaDaFare[] = tavoli
    .filter((t) => t.richiamo)
    .slice(0, MAX_DA_FARE)
    .map((t) => ({
      id: t.tableId,
      href: `/staff-app/tavolo/${t.tableId}`,
      tipo: t.richiamo!.tipo,
      dove: t.label,
      testo: t.richiamo!.testo,
    }));

  const unTavoloLoDiceGia = cose.some((c) => c.tipo === "PIATTI_PRONTI");
  if (pronteInCucina > 0 && !unTavoloLoDiceGia && cose.length < MAX_DA_FARE) {
    cose.push({
      id: "cucina",
      href: "/staff-app/comande",
      tipo: "PIATTI_PRONTI",
      dove: null,
      testo: pronteInCucina === 1 ? "1 comanda pronta al passe" : `${pronteInCucina} comande pronte al passe`,
    });
  }

  return cose;
}
