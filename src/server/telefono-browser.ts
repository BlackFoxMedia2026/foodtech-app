import { db } from "@/lib/db";
import { cifra, cifraturaAttiva, decifra } from "@/lib/cifratura";

/**
 * Il telefono nel browser: rispondere dentro Tavolo.
 *
 * ## Cosa fa e cosa no
 *
 * **Risponde.** Non compone, non trasferisce, non mette in attesa, non
 * registra. Non è una riduzione da completare più avanti: è quello che serve
 * in un ristorante, dove il telefono squilla e qualcuno risponde. Comporre un
 * numero si fa dal telefono che si ha in tasca; il resto — code, trasferimenti,
 * IVR — è il mestiere del centralino, e Tavolo non lo rifà.
 *
 * ## La credenziale esce dal server, e va detto
 *
 * SIP.js si autentica da solo dal browser, quindi la password SIP arriva al
 * browser. Non c'è modo di evitarlo e non serve girarci intorno: quello che si
 * può fare è limitare cosa apre quella credenziale, e dirlo.
 *
 *  - vale verso **un solo** centralino e per **un solo** locale;
 *  - non è la password di nessuna persona e non apre nessuna API di Tavolo;
 *  - la dà solo chi in Tavolo può già gestire le prenotazioni, cioè chi in
 *    quel locale risponde al telefono;
 *  - si cambia da Impostazioni, e cambiarla invalida la precedente.
 *
 * A riposo è cifrata (`lib/cifratura.ts`). Senza chiave di cifratura si salva
 * in chiaro con l'etichetta, come la password del Wi-Fi: una funzione che
 * dipende da una credenziale che non c'è dichiara il suo stato invece di
 * rifiutare il lavoro.
 *
 * ## Una credenziale per locale, non per persona
 *
 * Il telefono del ristorante è **uno**. Registrando lo stesso utente da più
 * schermi, il centralino li fa squillare tutti e risponde il primo che alza —
 * che è esattamente come funziona un telefono su più derivati. Una credenziale
 * a testa darebbe a ognuno il *suo* telefono, e nessuno risponderebbe a quello
 * del locale.
 */

export type TelefonoBrowser = {
  /** `wss://…`: il browser non apre un WebSocket in chiaro da una pagina sicura. */
  server: string;
  utente: string;
  password: string;
};

export type StatoTelefonoBrowser = {
  /** Se ci sono tutti e tre i dati per registrarsi. */
  pronto: boolean;
  server: string | null;
  utente: string | null;
  /** Se la password c'è. **Mai** il suo valore. */
  passwordPresente: boolean;
  /** Se questa installazione ha una chiave di cifratura. */
  sottoChiave: boolean;
};

export async function statoTelefonoBrowser(venueId: string): Promise<StatoTelefonoBrowser> {
  const v = await db.venue.findUnique({
    where: { id: venueId },
    select: { phoneSipServer: true, phoneSipUser: true, phoneSipPassword: true },
  });
  return {
    pronto: Boolean(v?.phoneSipServer && v?.phoneSipUser && v?.phoneSipPassword),
    server: v?.phoneSipServer ?? null,
    utente: v?.phoneSipUser ?? null,
    passwordPresente: Boolean(v?.phoneSipPassword),
    sottoChiave: cifraturaAttiva(),
  };
}

/**
 * Le credenziali, in chiaro, per il browser che deve registrarsi.
 *
 * Questa è la funzione che fa uscire la password. Sta da sola e si chiama in
 * un posto solo — la rotta che la serve — così «chi legge questo segreto» è
 * una domanda con una riga di risposta.
 */
export async function credenzialiTelefonoBrowser(
  venueId: string,
): Promise<TelefonoBrowser | null> {
  const v = await db.venue.findUnique({
    where: { id: venueId },
    select: { phoneSipServer: true, phoneSipUser: true, phoneSipPassword: true },
  });
  if (!v?.phoneSipServer || !v.phoneSipUser || !v.phoneSipPassword) return null;

  const password = decifra(v.phoneSipPassword);
  if (!password) return null;

  return { server: v.phoneSipServer, utente: v.phoneSipUser, password };
}

export class TelefonoBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelefonoBrowserError";
  }
}

/**
 * Salva i dati del telefono nel browser.
 *
 * L'indirizzo deve essere `wss://`, e il rifiuto è netto: con `ws://` il
 * browser non aprirebbe la connessione da una pagina sicura e non c'è modo di
 * forzarlo. Accettarlo vorrebbe dire salvare una configurazione che non
 * funzionerà mai, e scoprirlo la prima volta che squilla.
 */
export async function salvaTelefonoBrowser(
  venueId: string,
  dati: { server?: string | null; utente?: string | null; password?: string | null },
): Promise<StatoTelefonoBrowser> {
  const server = dati.server?.trim() || null;
  if (server && !server.startsWith("wss://")) {
    throw new TelefonoBrowserError(
      "L'indirizzo deve cominciare con wss://. Un indirizzo non sicuro il browser non lo apre, e non c'è modo di forzarlo.",
    );
  }

  await db.venue.update({
    where: { id: venueId },
    data: {
      ...(dati.server !== undefined ? { phoneSipServer: server } : {}),
      ...(dati.utente !== undefined ? { phoneSipUser: dati.utente?.trim() || null } : {}),
      /* La password si tocca **solo se arriva**: il modulo non la rimanda
         indietro — non la mostra nemmeno — e un campo vuoto significa «non
         cambiarla», non «cancellala». Per cancellarla si manda `null`. */
      ...(dati.password !== undefined
        ? { phoneSipPassword: dati.password === null ? null : cifra(dati.password.trim() || null) }
        : {}),
    },
  });

  return statoTelefonoBrowser(venueId);
}
