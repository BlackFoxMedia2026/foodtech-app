import { db } from "../src/lib/db";

/**
 * Il listino di partenza: il minimo indispensabile perché il ledger sappia
 * quanto costa un invio.
 *
 * Mette **una** riga: l'invio SES, al prezzo di listino pubblicato da Amazon.
 * Gli altri servizi (tenant, deliverability, validazione indirizzi, traffico
 * dati, IP dedicato) non li scrive nessuno qui, e non è una dimenticanza: i
 * loro prezzi dipendono da cosa attiviamo e da quale piano tariffario abbiamo,
 * e una riga inventata produrrebbe un costo per cliente che sembra un dato e
 * non lo è. Si aggiungono dal pannello quando li attiviamo davvero.
 *
 *   npm run listino:iniziale
 *   npm run listino:iniziale -- --cambio 0.87
 *
 * Il cambio è facoltativo: senza, i costi restano in dollari e le schermate lo
 * dicono, invece di convertire a un tasso inventato.
 */

async function main() {
  const arg = process.argv.indexOf("--cambio");
  const cambio = arg > -1 ? Number(process.argv[arg + 1]) : null;

  const esistente = await db.providerPrice.findFirst({
    where: { provider: "AWS", service: "SES_SEND", active: true },
  });

  if (esistente) {
    console.log(`Listino già presente: SES_SEND a ${esistente.unitPrice} ${esistente.currency} / ${esistente.unit}`);
  } else {
    const riga = await db.providerPrice.create({
      data: {
        provider: "AWS",
        service: "SES_SEND",
        label: "Invio email",
        unit: "EMAIL_1000",
        unitPrice: "0.10",
        currency: "USD",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    console.log(`Creato: SES_SEND a ${riga.unitPrice} USD / 1.000 email`);
  }

  if (cambio && Number.isFinite(cambio) && cambio > 0) {
    await db.cambioValuta.create({ data: { da: "USD", a: "EUR", tasso: cambio } });
    console.log(`Cambio registrato: 1 USD = ${cambio} EUR`);
  } else {
    const ultimo = await db.cambioValuta.findFirst({ where: { da: "USD", a: "EUR" }, orderBy: { lettoIl: "desc" } });
    console.log(
      ultimo
        ? `Cambio già noto: 1 USD = ${ultimo.tasso} EUR (${ultimo.lettoIl.toISOString().slice(0, 10)})`
        : "Nessun cambio USD→EUR: i costi resteranno in dollari finché non ne registri uno.",
    );
  }
}

main().then(() => process.exit(0));
