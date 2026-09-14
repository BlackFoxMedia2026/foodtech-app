/* eslint-disable no-console */
import { PrismaClient, type StaffPrimaryRole, type StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Dà un **accesso** alle persone che sono già in organico.
 *
 * Il modello lo prevedeva da sempre — `Waiter.userId` esiste, con tanto di
 * commento che parla della «vista dipendente» — ma nessuno lo popolava: ogni
 * profilo di personale era un'anagrafica senza nessuno dietro. Finché è così,
 * un ordine o una comanda non si possono attribuire a chi li ha presi: manca
 * proprio il soggetto a cui attribuirli.
 *
 * Questo script crea quel soggetto. Per ogni persona in organico senza
 * account: un `User` con la sua email, il collegamento sul `Waiter`, e una
 * `VenueMembership` sul suo locale con un ruolo derivato dal mestiere.
 *
 *   npx tsx scripts/account-staff-demo.ts            # mostra cosa farebbe
 *   npx tsx scripts/account-staff-demo.ts --applica  # scrive
 *   npx tsx scripts/account-staff-demo.ts --applica --locale=aurora-milano
 *
 * Di proposito non scrive niente senza `--applica`: crea credenziali valide
 * su un database vero, e va visto prima di essere fatto.
 */

const db = new PrismaClient();
const applica = process.argv.includes("--applica");
const localeChiesto = process.argv.find((a) => a.startsWith("--locale="))?.slice("--locale=".length);

/**
 * Una sola password per tutti, e scritta qui in chiaro.
 *
 * Sono account **dimostrativi**, che servono a entrare e guardare il prodotto
 * dagli occhi di un cameriere. Una password per persona vorrebbe dire un
 * elenco da conservare da qualche parte, cioè un elenco di credenziali vere
 * appoggiato in un file — che è peggio. Il giorno in cui questi profili
 * diventano accessi veri, la strada è l'invito con impostazione della
 * password (`VenueInvite`), non questo script.
 */
const PASSWORD = process.env.DEMO_STAFF_PASSWORD ?? "staff2026";

/**
 * Che poteri ha una persona dentro Tavolo, in base al mestiere che fa in sala.
 *
 * Non è un dettaglio di comodo: `StaffRole` è quello su cui gira `can()`, cioè
 * quello che decide se uno vede gli incassi del locale. Un cameriere non li
 * vede; chi pianifica i turni sì, perché deve poterli pianificare.
 *
 * Tutto ciò che non è elencato qui finisce `WAITER`: il ruolo minimo che
 * serve a lavorare — prenotazioni e servizio — e niente di più.
 */
const RUOLO_ACCESSO: Partial<Record<StaffPrimaryRole, StaffRole>> = {
  RESTAURANT_MANAGER: "MANAGER",
  MAITRE: "MANAGER",
  EXECUTIVE_CHEF: "MANAGER",
  HOST: "RECEPTION",
};

function ruoloAccesso(primaryRole: StaffPrimaryRole | null): StaffRole {
  return (primaryRole && RUOLO_ACCESSO[primaryRole]) || "WAITER";
}

/** `Youssef Amrani` → `youssef.amrani`. Senza accenti e senza spazi: finisce
 * in un indirizzo email, e un indirizzo con dentro «é» funziona ovunque
 * tranne dove serve. */
function pezzoEmail(testo: string): string {
  return testo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
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

  let creati = 0;
  let collegati = 0;
  let saltati = 0;

  for (const locale of locali) {
    const persone = await db.waiter.findMany({
      where: { venueId: locale.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    if (persone.length === 0) continue;

    console.log(`\n${locale.name} (${locale.slug}) — ${persone.length} in organico`);
    console.log("─".repeat(92));

    // Gli indirizzi già presi nel database, più quelli che questo giro sta per
    // prendere: due «Mario Rossi» nello stesso locale devono ricevere due
    // indirizzi diversi, e l'unicità di `User.email` non perdona.
    const presi = new Set(
      (await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()),
    );

    for (const persona of persone) {
      const nome = `${persona.firstName} ${persona.lastName}`;
      const ruolo = ruoloAccesso(persona.primaryRole);

      if (persona.userId) {
        const esistente = await db.user.findUnique({ where: { id: persona.userId }, select: { email: true } });
        console.log(`· ${nome.padEnd(26)} ${"già collegato".padEnd(16)} ${esistente?.email ?? "—"}`);
        saltati++;
        continue;
      }

      let email = (persona.email ?? "").trim().toLowerCase();
      if (!email || presi.has(email)) {
        const base = `${pezzoEmail(persona.firstName)}.${pezzoEmail(persona.lastName)}@${locale.slug}.demo`;
        email = base;
        let n = 2;
        while (presi.has(email)) email = base.replace("@", `${n++}@`);
      }
      presi.add(email);

      /*
        Un indirizzo che appartiene già a qualcuno **non** si riusa a forza:
        si collega e basta, senza toccargli la password. Riscrivere l'hash di
        un account esistente perché per caso ha la stessa email di un
        cameriere significa chiudere fuori una persona vera.
      */
      const gia = await db.user.findUnique({ where: { email }, select: { id: true } });

      if (!applica) {
        console.log(
          `· ${nome.padEnd(26)} ${(gia ? "collega a" : "crea").padEnd(16)} ${email.padEnd(38)} ${ruolo}`,
        );
        gia ? collegati++ : creati++;
        continue;
      }

      const utente = gia
        ? await db.user.update({ where: { id: gia.id }, data: { name: nome } })
        : await db.user.create({
            data: { email, name: nome, passwordHash: await bcrypt.hash(PASSWORD, 10) },
          });

      await db.venueMembership.upsert({
        where: { userId_venueId: { userId: utente.id, venueId: locale.id } },
        update: { role: ruolo },
        create: { userId: utente.id, venueId: locale.id, role: ruolo },
      });

      await db.waiter.update({ where: { id: persona.id }, data: { userId: utente.id } });

      console.log(`· ${nome.padEnd(26)} ${(gia ? "collegato" : "creato").padEnd(16)} ${email.padEnd(38)} ${ruolo}`);
      gia ? collegati++ : creati++;
    }
  }

  console.log("\n" + "═".repeat(92));
  console.log(`${creati} da creare · ${collegati} da collegare · ${saltati} già a posto`);
  console.log(applica ? `Password per tutti i nuovi account: ${PASSWORD}` : "Niente è stato scritto: aggiungi --applica.");
}

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
