import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleAlert, UserCog } from "lucide-react";
import { can, getActiveVenue } from "@/lib/tenant";
import { origineFidata } from "@/lib/origine";
import { headers } from "next/headers";
import { getWaiterScheda, listPossibiliResponsabili } from "@/server/waiters";
import { invitoAperto } from "@/server/staff-account";
import { postaAttiva } from "@/server/email-invito-staff";
import { DatiPersonali } from "@/components/staff/scheda/dati-personali";
import { Lavoro } from "@/components/staff/scheda/lavoro";
import { Documenti } from "@/components/staff/scheda/documenti";
import { Formazione } from "@/components/staff/scheda/formazione";
import { Account } from "@/components/staff/scheda/account";
import { Sezione } from "@/components/staff/scheda/sezione";
import { aContrattiDTO, aCorsiDTO, aDocumentiDTO, aPersonaDTO, aVisiteDTO } from "@/components/staff/scheda/tipi";
import {
  Anteprima,
  BarraPassiCompatta,
  GuidaPassi,
  ImpaginazioneNuova,
  PASSI_NUOVA,
  TestataNuova,
  ePassoNuova,
  type PassoNuova,
} from "@/components/staff/nuova/passi";
import { staffPrimaryRoleLabel } from "@/lib/staff-roles";
import { ModuloIniziale } from "@/components/staff/nuova/modulo-iniziale";
import { PassoAccesso } from "@/components/staff/nuova/passo-accesso";
import { CLASSE_AVANTI, CLASSE_INDIETRO, PiedePassi } from "@/components/staff/nuova/piede-passi";

export const dynamic = "force-dynamic";

/**
 * «Nuova persona»: la registrazione di un nuovo assunto, a passi.
 *
 * Era una modale. Con anagrafica, residenza, emergenza, ruolo, contratto,
 * documenti, corsi e accesso, una finestra da 560 px non bastava, e metà
 * dei campi restava da cercare nella scheda dopo. Ora è una pagina con i
 * passi della scheda — Dati personali, Lavoro, Documenti, Formazione,
 * Accesso — così quello che si scrive qui si ritrova là, nello stesso posto.
 *
 * ## Quando nasce la persona
 *
 * Alla fine del passo 2. I primi due passi vivono nel browser
 * (`ModuloIniziale`); con «Registra e continua» la persona entra in organico
 * e l'indirizzo diventa `?id=…&passo=documenti`. Da lì ogni passo è **la
 * sezione vera della scheda**, con i suoi caricamenti e le sue regole: niente
 * seconda copia dei moduli di documenti e corsi da tenere allineata.
 * Chi si ferma a metà ha comunque una persona registrata, con i dati scritti.
 *
 * ## L'invito
 *
 * L'ultimo passo crea l'accesso e manda l'email con «Configura password»
 * (`email-invito-staff.ts`).
 */
export default async function NuovaPersonaPage({
  searchParams,
}: {
  searchParams: { id?: string; passo?: string; contratto?: string };
}) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_staff")) notFound();
  const canManageContracts = can(ctx.role, "manage_contracts");
  const canManageVenue = can(ctx.role, "manage_venue");

  if (!searchParams.id) return <ModuloIniziale canManageContracts={canManageContracts} />;

  const scheda = await getWaiterScheda(ctx.venueId, searchParams.id);
  if (!scheda) notFound();

  const passo: PassoNuova =
    ePassoNuova(searchParams.passo) ? searchParams.passo : "documenti";
  const indice = PASSI_NUOVA.findIndex((p) => p.chiave === passo);
  const precedente = PASSI_NUOVA[indice - 1]?.chiave ?? null;
  const successivo = PASSI_NUOVA[indice + 1]?.chiave ?? null;
  const qui = (p: string) => `/staff/nuova?id=${scheda.id}&passo=${p}`;
  const scheda_url = `/staff/${scheda.id}`;

  const persona = aPersonaDTO(scheda);
  const contratti = aContrattiDTO(scheda);
  const nome = `${scheda.firstName} ${scheda.lastName}`;

  const [responsabili, invito] = await Promise.all([
    passo === "lavoro" ? listPossibiliResponsabili(ctx.venueId, scheda.id) : Promise.resolve([]),
    passo === "account" && canManageVenue && !scheda.userId
      ? invitoAperto(ctx.venueId, scheda.email, origineFidata(headers()))
      : Promise.resolve(null),
  ]);

  const piede = (
    <PiedePassi
      indietro={
        precedente ? (
          <Link href={qui(precedente)} scroll={false} className={CLASSE_INDIETRO}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Indietro
          </Link>
        ) : null
      }
      nota={successivo ? "Ogni sezione si salva da sé: puoi saltarla e tornarci dalla scheda." : null}
    >
      {successivo ? (
        <Link href={qui(successivo)} scroll={false} className={CLASSE_AVANTI}>
          Avanti <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <Link href={scheda_url} className={CLASSE_AVANTI}>
          Fine, apri la scheda <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </PiedePassi>
  );

  return (
    <ImpaginazioneNuova
      testata={<TestataNuova titolo={nome} sottotitolo="Registrata in organico · completa la scheda" />}
      colonna={<GuidaPassi attivo={passo} idPersona={scheda.id} />}
      sottoColonna={
        <Anteprima
          nome={scheda.firstName}
          cognome={scheda.lastName}
          ruolo={scheda.primaryRole ? staffPrimaryRoleLabel(scheda.primaryRole) : scheda.role}
          telefono={scheda.phone}
          email={scheda.email}
        />
      }
      barraCompatta={<BarraPassiCompatta attivo={passo} />}
      piede={piede}
    >
        <div className="space-y-4">
          {passo === "lavoro" && searchParams.contratto === "errore" && (
            <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-soft">
              <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {scheda.firstName} è registrata, ma il contratto non è stato salvato. Aggiungilo qui sotto.
            </p>
          )}

          {passo === "personali" && <DatiPersonali persona={persona} canEdit />}
          {passo === "lavoro" && (
            <Lavoro
              persona={persona}
              contratti={contratti}
              responsabili={responsabili.map((r) => ({ id: r.id, nome: `${r.firstName} ${r.lastName}`, primaryRole: r.primaryRole }))}
              canEdit
              canContracts={canManageContracts}
            />
          )}
          {passo === "documenti" && (
            <Documenti persona={persona} documenti={aDocumentiDTO(scheda)} contratti={contratti} canManage={canManageContracts} />
          )}
          {passo === "formazione" && (
            <Formazione persona={persona} corsi={aCorsiDTO(scheda)} visite={aVisiteDTO(scheda)} canEdit />
          )}
          {passo === "account" &&
            (!canManageVenue ? (
              <Sezione titolo="Accesso al gestionale" icona={UserCog}>
                <p className="text-base text-muted-foreground">
                  L&apos;accesso al gestionale lo crea un manager del locale, dalla scheda di {scheda.firstName}.
                </p>
              </Sezione>
            ) : scheda.userId || invito ? (
              <Account persona={persona} canManage invito={invito} eSeStesso={false} />
            ) : (
              <PassoAccesso
                waiterId={scheda.id}
                nome={scheda.firstName}
                emailIniziale={scheda.email}
                postaAttiva={postaAttiva()}
              />
            ))}
        </div>
    </ImpaginazioneNuova>
  );
}
