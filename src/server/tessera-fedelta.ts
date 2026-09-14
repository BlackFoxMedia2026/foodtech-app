import QRCode from "qrcode";
import { db } from "@/lib/db";
import { generaCodiceTessera } from "@/lib/tessera";

/**
 * Il numero di tessera di un cliente, assegnandolo se non ce l'ha.
 *
 * ## Perché non è un backfill
 *
 * La tentazione era generare un codice per tutti e sessantacinque i clienti
 * dell'archivio con uno script. Non serve: un numero di tessera esiste per
 * essere mostrato, e la maggior parte delle schede non verrà mai aperta. Un
 * codice generato per chi non lo userà è un valore in più da tenere unico, da
 * migrare e da spiegare, in cambio di niente.
 *
 * Si assegna quindi **la prima volta che qualcuno guarda la tessera**, e da
 * lì in poi è quello per sempre. Il costo è una `UPDATE` la prima volta che
 * si apre un profilo; il guadagno è che il database non contiene identificativi
 * che nessuno ha mai chiesto.
 *
 * ## Perché il ciclo
 *
 * L'unicità la garantisce il vincolo sulla colonna, non il calcolo delle
 * probabilità. Una collisione su 32^8 combinazioni è remota, ma «remota» in
 * un database che gira per anni vuol dire che prima o poi capita, e quando
 * capita non deve essere un errore 500 su una scheda cliente: si riprova con
 * un altro codice. Tre tentativi, poi si alza le mani — se fallisce tre volte
 * di fila il problema non è la collisione.
 *
 * La `UPDATE` è condizionata a `loyaltyCardCode: null`: due richieste in
 * parallelo sulla stessa scheda — due schede aperte, il refresh e un clic —
 * non devono assegnare due codici diversi, e la seconda trova zero righe da
 * aggiornare invece di sovrascrivere il codice appena stampato.
 */
export async function assicuraCodiceTessera(
  venueId: string,
  guestId: string,
  codiceEsistente: string | null,
): Promise<string | null> {
  if (codiceEsistente) return codiceEsistente;

  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const codice = generaCodiceTessera();
    try {
      const aggiornate = await db.guest.updateMany({
        where: { id: guestId, venueId, loyaltyCardCode: null },
        data: { loyaltyCardCode: codice },
      });
      if (aggiornate.count === 1) return codice;

      // Zero righe: qualcun altro è arrivato prima. Il codice giusto è il suo.
      const gia = await db.guest.findFirst({
        where: { id: guestId, venueId },
        select: { loyaltyCardCode: true },
      });
      return gia?.loyaltyCardCode ?? null;
    } catch {
      // Collisione sul vincolo di unicità: si riprova con un altro codice.
    }
  }

  /*
    Tre tentativi andati male non sono una ragione per far fallire la scheda
    di un cliente: la pagina sa già dire «tessera non ancora emessa», ed è
    meglio di una schermata d'errore davanti a chi sta servendo qualcuno.
  */
  return null;
}

/**
 * Il QR della tessera, come immagine pronta da mettere nella pagina.
 *
 * ## Cosa ci sta dentro
 *
 * **Il numero di tessera e basta.** Non un indirizzo web, non un JSON, non un
 * token firmato: la stringa `TV-4K7P-9RX2`, quella che è scritta sotto il
 * disegno. È una scelta, e regge su tre cose.
 *
 * Un URL dentro il QR sarebbe un URL che qualcuno può aprire: la scheda di un
 * cliente sta dietro l'autenticazione, quindi chi inquadra la tessera con il
 * telefono personale finirebbe su una pagina di accesso, e chi la inquadra
 * con un telefono già collegato aprirebbe la scheda di un cliente **senza
 * passare da nessun controllo su chi sta scansionando**. Un identificativo,
 * invece, non apre niente da solo.
 *
 * Il codice puro si legge con qualunque lettore, anche con la fotocamera di
 * serie del telefono, che lo mostra come testo copiabile — e quel testo,
 * incollato nella ricerca degli ospiti, trova la persona
 * (`sembraCodiceTessera` in `server/guests.ts`). È il giro completo: si
 * inquadra, si incolla, si trova.
 *
 * E il giorno in cui servirà un indirizzo — una pagina pubblica dove il
 * cliente vede i suoi punti — il codice è già l'identificativo su cui
 * costruirla, senza dover ristampare le tessere.
 *
 * ## Perché sul server
 *
 * `qrcode` gira uguale nei due posti, ma qui il disegno è **deterministico**:
 * dallo stesso codice esce sempre la stessa immagine. Generarlo nel browser
 * vorrebbe dire un componente client, un `useEffect`, uno stato di
 * caricamento e un riquadro grigio che lampeggia a ogni apertura della
 * scheda, in cambio di niente.
 *
 * I colori: moduli scuri su fondo crema, cioè la coppia del prodotto. Il
 * contrasto fra i due è quello che un lettore misura per decidere dove
 * finisce un modulo, e questi due stanno a 15 : 1 — abbondantemente sopra il
 * minimo. Il margine di 2 moduli è la «quiet zone»: senza, i lettori
 * sbagliano l'aggancio sui bordi.
 */
export async function qrTessera(codice: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(codice, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0B1511ff", light: "#F2E7D0ff" },
    });
  } catch {
    // Un QR che non si disegna non deve portarsi via la scheda del cliente:
    // il numero resta scritto, e a mano si digita lo stesso.
    return null;
  }
}
