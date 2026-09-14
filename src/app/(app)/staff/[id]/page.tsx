import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { todayInVenue } from "@/lib/venue-time";
import { costruisciScadenze } from "@/lib/scadenze-dipendente";
import { eTabScheda, type TabScheda } from "@/lib/scheda-dipendente";
import { pickCurrentContract, staffContractTypeLabel } from "@/lib/staff-contracts";
import { getWaiterScheda, listPossibiliResponsabili } from "@/server/waiters";
import { riepilogoPresenze } from "@/server/staff-presenze";
import { listNote } from "@/server/staff-note";
import { listStorico } from "@/server/staff-storico";
import { invitoAperto } from "@/server/staff-account";
import { Testata } from "@/components/staff/scheda/testata";
import { Linguette } from "@/components/staff/scheda/linguette";
import { Panoramica } from "@/components/staff/scheda/panoramica";
import { DatiPersonali } from "@/components/staff/scheda/dati-personali";
import { Lavoro } from "@/components/staff/scheda/lavoro";
import { Documenti } from "@/components/staff/scheda/documenti";
import { Formazione } from "@/components/staff/scheda/formazione";
import { Presenze } from "@/components/staff/scheda/presenze";
import { Account } from "@/components/staff/scheda/account";
import { NoteStorico } from "@/components/staff/scheda/note-storico";
import { aContrattiDTO, aCorsiDTO, aDocumentiDTO, aPersonaDTO, aVisiteDTO } from "@/components/staff/scheda/tipi";

export const dynamic = "force-dynamic";

/**
 * La scheda di una persona dell'organico: `/staff/<id>`.
 *
 * Era una modale da 560 px con otto campi e il contratto. Adesso è una
 * pagina, per tre motivi che una modale non ha: **un indirizzo** («guarda la
 * scheda di Marco», e la si apre in un'altra linguetta mentre si è al
 * telefono con lui), **lo spazio** per quello che un responsabile deve poter
 * trovare senza cercare altrove — documenti, corsi, visita medica, account,
 * turni, note, storico — e **la lettura prima della modifica**: i campi
 * sono testo grande, e diventano un modulo solo nella sezione su cui si
 * preme «Modifica».
 *
 * Le linguette sono `?tab=`: il server rende solo quella aperta, così la
 * Panoramica non paga il registro né i turni dell'anno.
 *
 * ## Chi la vede
 *
 * Chi ha `manage_staff`, tutta. La persona stessa — quando ha un account
 * collegato — vede la sua, in sola lettura e **senza** la linguetta delle
 * note: le note interne sono la promessa che la rende utile scriverle.
 * Chiunque altro: non esiste.
 */
export default async function SchedaDipendentePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; modifica?: string };
}) {
  const ctx = await getActiveVenue();
  const scheda = await getWaiterScheda(ctx.venueId, params.id);
  if (!scheda) notFound();

  const canManageStaff = can(ctx.role, "manage_staff");
  const canManageContracts = can(ctx.role, "manage_contracts");
  const canManageVenue = can(ctx.role, "manage_venue");
  const eSeStesso = scheda.userId === ctx.userId;
  if (!canManageStaff && !eSeStesso) notFound();

  const nascoste: TabScheda[] = canManageStaff ? [] : ["note"];
  const tabChiesta = eTabScheda(searchParams.tab) ? searchParams.tab : "panoramica";
  const tab: TabScheda = nascoste.includes(tabChiesta) ? "panoramica" : tabChiesta;

  const base = `/staff/${scheda.id}`;
  const oggi = todayInVenue(ctx.venue.timezone);
  const persona = aPersonaDTO(scheda);
  const contratti = aContrattiDTO(scheda);
  const corsi = aCorsiDTO(scheda);
  const visite = aVisiteDTO(scheda);
  const documenti = aDocumentiDTO(scheda);
  const contrattoAttuale = pickCurrentContract(scheda.contracts);
  const tipoContratto = contrattoAttuale ? staffContractTypeLabel(contrattoAttuale.contractType) : null;

  const scadenze = costruisciScadenze({
    contratti: scheda.contracts,
    visite: scheda.medicalChecks,
    corsi: scheda.trainings,
    documenti: scheda.documents.map((d) => ({
      id: d.id,
      name: d.name,
      expiresAt: d.expiresAt,
      trainingId: scheda.trainings.find((t) => t.certificateDocumentId === d.id)?.id ?? null,
      medicalCheckId: scheda.medicalChecks.find((m) => m.certificateDocumentId === d.id)?.id ?? null,
    })),
  });
  const urgenti = scadenze.filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza");

  // Ogni linguetta legge solo quello che le serve: la Panoramica i turni
  // della settimana, le note il registro, l'account l'invito aperto.
  const [presenze, note, storico, invito, responsabili] = await Promise.all([
    tab === "panoramica" || tab === "presenze" ? riepilogoPresenze(ctx.venueId, scheda.id, oggi) : null,
    tab === "note" && canManageStaff ? listNote(ctx.venueId, scheda.id) : null,
    tab === "note" ? listStorico(ctx.venueId, scheda.id) : null,
    tab === "account" && canManageVenue && !scheda.userId ? invitoAperto(ctx.venueId, scheda.email, baseUrl()) : null,
    tab === "lavoro" && canManageStaff ? listPossibiliResponsabili(ctx.venueId, scheda.id) : [],
  ]);

  return (
    <div className="schermo animate-fade-in gap-4">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/staff">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Torna allo staff
        </Link>
      </Button>

      {/* Il corpo scorre dentro di sé: testata e linguette scorrono con lui,
          perché su un tablet una testata fissa da 200 px lascerebbe poco spazio
          alle sezioni — che sono la cosa da leggere. */}
      <div className="fill-scroll -mx-1 px-1">
        <div className="mx-auto max-w-6xl space-y-5 pb-8">
          <Testata persona={persona} tipoContratto={tipoContratto} canManageStaff={canManageStaff} base={base} />

          <Linguette
            attiva={tab}
            base={base}
            nascoste={nascoste}
            contatori={{
              documenti: documenti.length,
              formazione: urgenti.filter((s) => s.tab === "formazione").length,
              lavoro: urgenti.filter((s) => s.tab === "lavoro").length,
            }}
          />

          {tab === "panoramica" && (
            <Panoramica persona={persona} tipoContratto={tipoContratto} scadenze={scadenze} presenze={presenze} base={base} />
          )}
          {tab === "personali" && (
            <DatiPersonali persona={persona} canEdit={canManageStaff} modificaIniziale={searchParams.modifica === "1" && canManageStaff} />
          )}
          {tab === "lavoro" && (
            <Lavoro
              persona={persona}
              contratti={contratti}
              responsabili={responsabili.map((r) => ({ id: r.id, nome: `${r.firstName} ${r.lastName}`, primaryRole: r.primaryRole }))}
              canEdit={canManageStaff}
              canContracts={canManageContracts}
            />
          )}
          {tab === "documenti" && (
            <Documenti persona={persona} documenti={documenti} contratti={contratti} canManage={canManageContracts} />
          )}
          {tab === "formazione" && <Formazione persona={persona} corsi={corsi} visite={visite} canEdit={canManageStaff} />}
          {tab === "presenze" && presenze && <Presenze riepilogo={presenze} oggi={oggi} />}
          {tab === "account" && <Account persona={persona} canManage={canManageVenue} invito={invito} eSeStesso={eSeStesso} />}
          {tab === "note" && canManageStaff && (
            <NoteStorico persona={persona} note={note ?? []} storico={storico ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

/** L'indirizzo pubblico di questa installazione, per il link dell'invito. */
function baseUrl(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
