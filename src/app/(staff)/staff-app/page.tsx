import Link from "next/link";
import { ArrowRight, BellRing, FileText } from "lucide-react";
import { getContestoStaff } from "@/lib/staff-auth";
import { puo } from "@/lib/permessi-staff";
import { salutoCon } from "@/lib/saluto";
import { TestataSaluto } from "@/components/staff-app/testata-staff";
import { CardTurno, ProssimoTurno } from "@/components/staff-app/card-turno";
import { Sezione } from "@/components/staff-app/sezioni-home";
import { DaGestireOra } from "@/components/staff-app/da-gestire";
import { TavoliHome } from "@/components/staff-app/tavoli-home";
import { SondaHome } from "@/components/staff-app/sonda-home";
import { prossimoTurno, turnoDiOggi } from "@/server/staff-app/turno";
import {
  daGestireOra,
  MAX_DA_GESTIRE,
  salaDelCameriere,
  soloMiei,
  tavoliLiberi,
} from "@/server/staff-app/sala";
import { contaComandePronte } from "@/server/comande/comande";
import { scadenzeDi } from "@/server/staff-app/documenti";

export const dynamic = "force-dynamic";

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
 * 3. **da gestire ora** — la coda: chi aspetta in piedi e i tavoli che
 *    chiedono qualcosa, in ordine di urgenza vera;
 * 4. **i miei tavoli** — righe compatte, quelli che sto seguendo;
 * 5. **i tavoli liberi** — pastiglie in una riga che scorre di lato.
 *
 * ## Perché la terza sezione è nuova, e perché le altre si sono ristrette
 *
 * La domanda che questa schermata deve risolvere in meno di un secondo è
 * **«chi devo gestire adesso?»**. Prima non la risolveva: c'erano quattro
 * sezioni — da fare, da accomodare, i miei tavoli, i tavoli disponibili — e
 * una famiglia appena accomodata non stava in nessuna delle quattro. Non
 * aveva un piatto pronto né un conto chiesto, quindi non era «da fare»; non
 * era assegnata a nessuno, quindi non era «un mio tavolo»; non era libera.
 * Compariva solo per caso, quando aveva una nota qualsiasi da mostrare.
 *
 * Nel frattempo sei tasti quadrati di **tavoli vuoti** si prendevano più di
 * mezza schermata: i posti liberi pesavano più dei clienti già seduti.
 *
 * Adesso c'è **una coda sola** in cima, e tutto il resto è rimpicciolito
 * fino alla misura del suo compito: ritrovare un tavolo che sto già
 * seguendo (una riga), sapere dove far sedere quattro persone (una
 * pastiglia).
 *
 * ## Cosa continua a non esserci
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
              I liberi e gli **scoperti** arrivano nella stessa lettura dei
              propri tavoli, non in una seconda: `salaDelCameriere` fa poche
              interrogazioni in tutto qualunque sia il numero di tavoli, e
              chiederle due volte per separare «i miei» dagli altri
              raddoppierebbe il costo della schermata che si apre più spesso
              di tutte.

              `ancheScoperti` è la riga che fa esistere questa dashboard: senza
              di essa un tavolo appena accomodato dal maître, su cui nessuno è
              stato assegnato, non comparirebbe sul telefono di nessuno. Il
              perché per esteso sta su `OpzioniSala`.
            */
            ancheLiberi: true,
            ancheScoperti: true,
          },
        )
      : null,
    puo(ctx.permessi, "view_kitchen_status")
      ? contaComandePronte(ctx.venueId, ctx.persona.waiterId)
      : 0,
  ]);

  const coda = sala ? daGestireOra(sala, MAX_DA_GESTIRE) : [];
  const restanti = sala ? Math.max(0, daGestireOra(sala).length - coda.length) : 0;

  /*
    **Tutti i liberi**, non i primi quattro.

    Erano tagliati a quattro, con un «Tutti i 12» che rimandava alla Sala.
    Aveva senso quando erano tasti quadrati: dodici tasti sono sei righe di
    schermo. Da quando sono pastiglie su una riga che scorre di lato, dodici
    costano quanto quattro — e cercare il tavolo dodici senza trovarlo era il
    difetto che il taglio produceva.
  */
  const miei = sala ? soloMiei(sala) : [];
  const liberi = sala ? tavoliLiberi(sala) : [];
  const ospitiInAttesa = sala?.daAccomodare ?? [];

  /*
    La riga della cucina compare **solo quando nessun tavolo la copre**.
    «T4 · 2 piatti da servire» dice dove andare, «2 comande pronte al passe»
    no, e messe una sopra l'altra sono la ripetizione che questa schermata
    aveva in tre punti su quattro. Resta per il caso in cui il piatto pronto è
    di un tavolo che non si sta guardando, ed è l'unico in cui aggiunge
    qualcosa.
  */
  const cucinaScoperta =
    pronteInCucina > 0 && !coda.some((t) => t.richiamo?.tipo === "PIATTI_PRONTI");

  return (
    <div className="schermo">
      <SondaHome />
      {testata}
      <div className="fill-scroll space-y-5 px-5 pb-6">
        <CardTurno turno={turno} />

        <DaGestireOra
          tavoli={coda}
          ospiti={ospitiInAttesa}
          permessi={ctx.permessi}
          restanti={restanti}
        />

        {cucinaScoperta && (
          <Link
            href="/staff-app/comande"
            className="sa-tocco flex min-h-[56px] items-center gap-3 rounded-[14px] border border-accent/40 bg-accent/10 px-3.5"
          >
            <BellRing
              className="h-5 w-5 shrink-0 animate-respiro text-accent-strong motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sa-corpo min-w-0 flex-1 truncate font-medium">
              {pronteInCucina === 1
                ? "1 comanda pronta al passe"
                : `${pronteInCucina} comande pronte al passe`}
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}

        {sala && (
          /*
            I tavoli liberi sono tasti, e un tasto su un tavolo libero apre le
            **scelte** invece della schermata del tavolo: il perché sta in
            `tavoli-home.tsx`. Da qui passano solo i dati.
          */
          <TavoliHome
            miei={miei}
            liberi={liberi}
            inAttesa={ospitiInAttesa.length}
            puoAccomodare={puo(ctx.permessi, "manage_tables")}
            codaVuota={coda.length === 0 && ospitiInAttesa.length === 0}
          />
        )}
      </div>
    </div>
  );
}
