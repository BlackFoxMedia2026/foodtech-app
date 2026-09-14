/* eslint-disable no-console */
import { PrismaClient, type StaffPrimaryRole, type Waiter } from "@prisma/client";
import { DEFAULT_CAPABILITIES_BY_ROLE, ROLE_DEPARTMENT, staffPrimaryRoleLabel } from "../src/lib/staff-roles";

/**
 * Porta l'organico di anteprima alla brigata minima di una trattoria.
 *
 * Il seed ne mette tredici, e con tredici persone che lavorano tutte tutte le
 * sere il calendario dei turni diventa una colonna di undici card: tecnicamente
 * corretto, inutile come anteprima. Un locale vero di quella taglia ne ha otto,
 * ed è con otto che si vede se la schermata funziona.
 *
 *   npx tsx scripts/preview-organico-ridotto.ts            # mostra cosa farebbe
 *   npx tsx scripts/preview-organico-ridotto.ts --applica  # scrive
 *   npx tsx scripts/preview-organico-ridotto.ts --applica --locale=aurora-bistrot
 *
 * **Cancella delle righe**, e con loro i turni, i contratti e le assegnazioni
 * di chi esce (tutte le relazioni di `Waiter` sono `onDelete: Cascade`). Per
 * questo non scrive niente senza `--applica`: si guarda l'elenco, e poi si
 * decide.
 */

const db = new PrismaClient();
const applica = process.argv.includes("--applica");
const localeChiesto = process.argv.find((a) => a.startsWith("--locale="))?.slice("--locale=".length);

/**
 * La squadra che si vuole vedere in anteprima.
 *
 * Otto persone, e sono quelle che una trattoria ha davvero: uno che comanda in
 * cucina, uno che comanda in sala, tre che servono, uno al banco, uno ai vini,
 * uno all'ingresso. L'ordine conta — chi è più in alto sceglie per primo fra
 * le persone già in organico, quindi i ruoli insostituibili vengono prima di
 * quelli che si possono riassegnare.
 */
const COMPOSIZIONE: { ruolo: StaffPrimaryRole; quante: number }[] = [
  { ruolo: "EXECUTIVE_CHEF", quante: 1 },
  { ruolo: "MAITRE", quante: 1 },
  { ruolo: "SOMMELIER", quante: 1 },
  { ruolo: "BARTENDER", quante: 1 },
  { ruolo: "HOST", quante: 1 },
  { ruolo: "CAMERIERE", quante: 3 },
];

/**
 * Chi tiene il posto, per ogni casella della composizione.
 *
 * Tre passaggi, dal meno invasivo al più: **chi ha già quel ruolo**, poi **chi
 * lavora nello stesso reparto** (un chef de rang diventa cameriere senza
 * cambiare mestiere davvero), poi chiunque resti. Solo nei casi due e tre il
 * ruolo viene riscritto, e lo script lo dice.
 */
function scegli(candidati: Waiter[], ruolo: StaffPrimaryRole): Waiter | null {
  const reparto = ROLE_DEPARTMENT[ruolo];
  return (
    candidati.find((p) => p.primaryRole === ruolo) ??
    candidati.find((p) => p.primaryRole && ROLE_DEPARTMENT[p.primaryRole] === reparto) ??
    candidati[0] ??
    null
  );
}

async function main() {
  const locali = await db.venue.findMany({
    where: localeChiesto ? { OR: [{ slug: localeChiesto }, { id: localeChiesto }] } : {},
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (locali.length === 0) {
    console.log(localeChiesto ? `Nessun locale «${localeChiesto}».` : "Nessun locale nel database.");
    return;
  }

  for (const locale of locali) {
    const organico = await db.waiter.findMany({
      where: { venueId: locale.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    if (organico.length === 0) continue;

    console.log(`\n${locale.name} (${locale.slug}) — ${organico.length} in organico`);
    console.log("─".repeat(84));

    const disponibili = [...organico];
    const tenuti: { persona: Waiter; ruolo: StaffPrimaryRole }[] = [];

    for (const casella of COMPOSIZIONE) {
      for (let i = 0; i < casella.quante; i++) {
        const scelto = scegli(disponibili, casella.ruolo);
        if (!scelto) break;
        disponibili.splice(disponibili.indexOf(scelto), 1);
        tenuti.push({ persona: scelto, ruolo: casella.ruolo });
      }
    }

    for (const { persona, ruolo } of tenuti) {
      const nome = `${persona.firstName} ${persona.lastName}`;
      const cambia = persona.primaryRole !== ruolo;
      const nota = cambia ? `${staffPrimaryRoleLabel(persona.primaryRole ?? ruolo)} → ${staffPrimaryRoleLabel(ruolo)}` : "invariato";
      console.log(`  resta   ${nome.padEnd(24)} ${staffPrimaryRoleLabel(ruolo).padEnd(20)} ${nota}`);

      if (!applica || !cambia) continue;

      await db.waiter.update({
        where: { id: persona.id },
        data: {
          primaryRole: ruolo,
          role: staffPrimaryRoleLabel(ruolo),
          // Le capability seguono il ruolo: un ex commis di cucina passato in
          // sala senza capability non comparirebbe fra i candidati quando il
          // maître assegna un tavolo, cioè sarebbe in organico e invisibile.
          capabilities: DEFAULT_CAPABILITIES_BY_ROLE[ruolo],
          // L'override di reparto sui suoi turni si azzera: era quello del
          // mestiere di prima, e adesso mentirebbe sul colore della card.
          shifts: { updateMany: { where: { waiterId: persona.id }, data: { department: null } } },
        },
      });
    }

    /*
      Gli override di reparto sui turni si azzerano.

      `WorkShift.department` esiste per **l'eccezione**: la sera in cui il
      commis di sala copre il bar. Il seed invece lo scriveva su ogni turno,
      con il reparto del servizio — e da quando il colore della card è il
      reparto, quel campo ha smesso di essere un dettaglio: il bartender
      compariva blu come la sala, perché il suo turno diceva SALA mentre lui
      è BAR. Nullo vuol dire «il suo», che nel novanta per cento dei casi è
      la verità e nel restante dieci si riscrive dal dettaglio del turno.
    */
    const conOverride = await db.workShift.count({
      where: { venueId: locale.id, department: { not: null } },
    });
    if (conOverride > 0) {
      console.log(`  reparto  ${conOverride} turni con reparto scritto a mano → segue la persona`);
      if (applica) {
        await db.workShift.updateMany({ where: { venueId: locale.id }, data: { department: null } });
      }
    }

    if (disponibili.length === 0) {
      console.log("  (nessuno da togliere)");
      continue;
    }

    for (const persona of disponibili) {
      const nome = `${persona.firstName} ${persona.lastName}`;
      const turni = await db.workShift.count({ where: { waiterId: persona.id } });
      console.log(
        `  esce    ${nome.padEnd(24)} ${staffPrimaryRoleLabel(persona.primaryRole ?? "CAMERIERE").padEnd(20)} ${turni} turni`,
      );
      if (!applica) continue;

      const utenteId = persona.userId;
      await db.waiter.delete({ where: { id: persona.id } });

      /*
        L'account demo se ne va con la persona, ma solo se **era solo suo**.

        Le tre guardie servono tutte: un account con una membership di
        organizzazione è un titolare, non un cameriere; un account collegato a
        un altro profilo lavora in un secondo locale; e senza `userId` non c'è
        niente da cancellare. Sbagliarne una vuol dire chiudere fuori qualcuno
        per fare pulizia in una demo.
      */
      if (!utenteId) continue;
      const [altriProfili, membershipOrg] = await Promise.all([
        db.waiter.count({ where: { userId: utenteId } }),
        db.orgMembership.count({ where: { userId: utenteId } }),
      ]);
      if (altriProfili === 0 && membershipOrg === 0) {
        await db.user.delete({ where: { id: utenteId } });
      }
    }
  }

  console.log("\n" + "═".repeat(84));
  console.log(
    applica
      ? "Fatto. Ricontrolla gli accessi con: npx tsx scripts/account-staff-demo.ts"
      : "Niente è stato scritto: aggiungi --applica.",
  );
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
