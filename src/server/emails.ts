import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM || "noreply@tavolo.local";

export async function sendBookingConfirmationEmail(
  guestEmail: string,
  guestName: string,
  venueName: string,
  bookingDate: Date,
  bookingTime: string,
  partySize: number,
  reference: string
) {
  if (!resend) {
    console.log(`[EMAIL] Booking confirmation (Resend not configured): ${guestEmail}`);
    return;
  }

  const dateStr = bookingDate.toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a;">✅ Prenotazione Confermata</h1>
      <p style="font-size: 16px; color: #333;">Ciao ${guestName},</p>
      <p style="font-size: 16px; color: #333;">La tua prenotazione presso <strong>${venueName}</strong> è stata confermata!</p>

      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>Data:</strong> ${dateStr}</p>
        <p style="margin: 8px 0;"><strong>Ora:</strong> ${bookingTime}</p>
        <p style="margin: 8px 0;"><strong>Persone:</strong> ${partySize}</p>
        <p style="margin: 8px 0;"><strong>Referenza:</strong> ${reference}</p>
      </div>

      <p style="font-size: 16px; color: #333;">Riceverai un promemoria 24 ore prima della tua prenotazione.</p>
      <p style="font-size: 14px; color: #666; margin-top: 30px;">A presto!<br/><strong>${venueName}</strong></p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: guestEmail,
      subject: `Prenotazione confermata - ${venueName}`,
      html: htmlContent,
    });
    console.log(`[EMAIL] Booking confirmation sent to ${guestEmail}`);
  } catch (error) {
    console.error(`[EMAIL] Failed to send confirmation to ${guestEmail}:`, error);
  }
}

export async function sendPendingBookingNotificationEmail(
  managerEmail: string,
  managerName: string,
  guestName: string,
  venueName: string,
  bookingDate: Date,
  bookingTime: string,
  partySize: number,
  reference: string,
  guestPhone: string
) {
  if (!resend) {
    console.log(`[EMAIL] Pending notification (Resend not configured): ${managerEmail}`);
    return;
  }

  const dateStr = bookingDate.toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #f59e0b;">⏳ Prenotazione in Sospeso</h1>
      <p style="font-size: 16px; color: #333;">Ciao ${managerName},</p>
      <p style="font-size: 16px; color: #333;">Una nuova prenotazione da <strong>${guestName}</strong> è in attesa di approvazione.</p>

      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 8px 0;"><strong>Nome:</strong> ${guestName}</p>
        <p style="margin: 8px 0;"><strong>Telefono:</strong> ${guestPhone}</p>
        <p style="margin: 8px 0;"><strong>Data richiesta:</strong> ${dateStr}</p>
        <p style="margin: 8px 0;"><strong>Ora richiesta:</strong> ${bookingTime}</p>
        <p style="margin: 8px 0;"><strong>Persone:</strong> ${partySize}</p>
        <p style="margin: 8px 0;"><strong>Referenza:</strong> ${reference}</p>
      </div>

      <p style="font-size: 14px; color: #666;">Accedi al dashboard per approvare o rifiutare questa prenotazione.</p>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">Questa prenotazione scadrà automaticamente se non approvata entro 24 ore.</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: managerEmail,
      subject: `Nuova prenotazione in sospeso - ${venueName}`,
      html: htmlContent,
    });
    console.log(`[EMAIL] Pending notification sent to ${managerEmail}`);
  } catch (error) {
    console.error(`[EMAIL] Failed to send pending notification to ${managerEmail}:`, error);
  }
}

export async function sendContractExpiringEmail(
  recipientEmail: string,
  recipientName: string,
  waiterName: string,
  venueName: string,
  endDate: Date,
  daysRemaining: number,
  profileUrl: string,
) {
  if (!resend) {
    console.log(`[EMAIL] Contract expiring (Resend not configured): ${recipientEmail}`);
    return;
  }

  const dateStr = endDate.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" });
  const timing = daysRemaining === 0 ? "scade oggi" : daysRemaining === 1 ? "scade domani" : `scade tra ${daysRemaining} giorni`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #A98804;">Contratto in scadenza</h1>
      <p style="font-size: 16px; color: #333;">Ciao ${recipientName},</p>
      <p style="font-size: 16px; color: #333;">Il contratto di <strong>${waiterName}</strong> presso <strong>${venueName}</strong> ${timing} (${dateStr}).</p>
      <p style="font-size: 14px; color: #666;"><a href="${profileUrl}">Visualizza profilo</a></p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `Contratto in scadenza - ${waiterName}`,
      html: htmlContent,
    });
    console.log(`[EMAIL] Contract expiring email sent to ${recipientEmail}`);
  } catch (error) {
    console.error(`[EMAIL] Failed to send contract expiring email to ${recipientEmail}:`, error);
  }
}

export async function sendContractExpiredEmail(
  recipientEmail: string,
  recipientName: string,
  waiterName: string,
  venueName: string,
  endDate: Date,
  profileUrl: string,
) {
  if (!resend) {
    console.log(`[EMAIL] Contract expired (Resend not configured): ${recipientEmail}`);
    return;
  }

  const dateStr = endDate.toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #D53434;">Contratto scaduto</h1>
      <p style="font-size: 16px; color: #333;">Ciao ${recipientName},</p>
      <p style="font-size: 16px; color: #333;">Il contratto di <strong>${waiterName}</strong> presso <strong>${venueName}</strong> è scaduto il ${dateStr}.</p>
      <p style="font-size: 14px; color: #666;"><a href="${profileUrl}">Visualizza profilo</a></p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `Contratto scaduto - ${waiterName}`,
      html: htmlContent,
    });
    console.log(`[EMAIL] Contract expired email sent to ${recipientEmail}`);
  } catch (error) {
    console.error(`[EMAIL] Failed to send contract expired email to ${recipientEmail}:`, error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Pagamento al tavolo col QR                                                */
/* -------------------------------------------------------------------------- */

/**
 * Il testo che finisce dentro un attributo o un corpo HTML, reso innocuo.
 *
 * Le email più vecchie di questo file interpolano i nomi direttamente nel
 * markup. Lì i valori arrivano da campi che compila lo staff, quindi il danno
 * possibile è un'email sformattata. Qui no: il nome del locale e soprattutto
 * **l'indirizzo scritto dal cliente al tavolo** sono testo che arriva da
 * fuori, e un `<` di troppo in un messaggio che il ristoratore apre nella
 * propria casella non è un difetto estetico.
 */
function testoSicuro(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EURO = (cents: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(cents / 100);

export type EmailPagamentoTavolo = {
  locale: string;
  localeEmail: string | null;
  clienteEmail: string | null;
  tavolo: string;
  currency: string;
  billCents: number;
  tipCents: number;
  residuoCents: number;
  saldato: boolean;
  metodo: string | null;
  quando: Date;
};

/**
 * Le due email di un pagamento al tavolo: una al locale, una al cliente.
 *
 * Partono insieme e falliscono separatamente: se l'indirizzo che il cliente ha
 * digitato sul telefono è sbagliato — e a volte lo è — il ristoratore deve
 * comunque ricevere la sua. Per questo `allSettled` e non `all`.
 *
 * Al cliente si scrive **solo se ha lasciato un indirizzo**. Non è un
 * ripiego: chiedere un'email per poter pagare un conto già consumato sarebbe
 * raccogliere contatti con la leva sbagliata, e questo prodotto ha già i modi
 * onesti per farlo.
 */
export async function sendTablePaymentEmails(dati: EmailPagamentoTavolo): Promise<void> {
  if (!resend) {
    console.log(`[EMAIL] Pagamento al tavolo (Resend non configurato): tavolo ${dati.tavolo}`);
    return;
  }

  const locale = testoSicuro(dati.locale);
  const tavolo = testoSicuro(dati.tavolo);
  const totale = dati.billCents + dati.tipCents;
  const ora = dati.quando.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

  const riga = (etichetta: string, valore: string, forte = false) => `
    <tr>
      <td style="padding:6px 0;color:#4F351B;font-size:14px;">${testoSicuro(etichetta)}</td>
      <td style="padding:6px 0;text-align:right;font-size:14px;color:#2F1F11;${
        forte ? "font-weight:700;" : ""
      }">${testoSicuro(valore)}</td>
    </tr>`;

  const invii: Promise<unknown>[] = [];

  /* --- Al ristorante: è denaro entrato senza che nessuno in sala l'abbia visto. --- */
  if (dati.localeEmail) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h1 style="color:#AF6648;font-size:22px;">Pagamento al tavolo ${tavolo}</h1>
        <p style="font-size:16px;color:#333;">
          Un cliente ha pagato dal proprio telefono, inquadrando il QR del tavolo.
        </p>
        <table style="width:100%;background:#F2E7D0;border-radius:12px;padding:16px;margin:20px 0;">
          ${riga("Conto", EURO(dati.billCents, dati.currency))}
          ${dati.tipCents > 0 ? riga("Mancia", EURO(dati.tipCents, dati.currency)) : ""}
          ${riga("Totale transazione", EURO(totale, dati.currency), true)}
          ${dati.metodo ? riga("Metodo", dati.metodo) : ""}
          ${riga("Quando", ora)}
          ${
            dati.saldato
              ? riga("Stato", "Conto saldato", true)
              : riga("Ancora da incassare", EURO(dati.residuoCents, dati.currency), true)
          }
        </table>
        ${
          dati.saldato
            ? `<p style="font-size:15px;color:#13332C;"><strong>Il tavolo ha saldato.</strong> Non deve passare in cassa.</p>`
            : ""
        }
        <p style="font-size:13px;color:#666;margin-top:28px;">${locale} · Tavolo</p>
      </div>`;

    invii.push(
      resend.emails
        .send({
          from: FROM_EMAIL,
          to: dati.localeEmail,
          subject: dati.saldato
            ? `Tavolo ${tavolo} saldato — ${EURO(dati.billCents, dati.currency)}`
            : `Pagamento tavolo ${tavolo} — ${EURO(dati.billCents, dati.currency)}`,
          html,
        })
        .catch((e) => console.error("[EMAIL] pagamento al tavolo, copia al locale:", e)),
    );
  }

  /* --- Al cliente: la ricevuta che ha chiesto lasciando l'indirizzo. --- */
  if (dati.clienteEmail) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h1 style="color:#13332C;font-size:22px;">Pagamento riuscito</h1>
        <p style="font-size:16px;color:#333;">
          Grazie. Ecco la conferma del pagamento al tavolo ${tavolo} di <strong>${locale}</strong>.
        </p>
        <table style="width:100%;background:#F2E7D0;border-radius:12px;padding:16px;margin:20px 0;">
          ${riga("Conto", EURO(dati.billCents, dati.currency))}
          ${dati.tipCents > 0 ? riga("Mancia", EURO(dati.tipCents, dati.currency)) : ""}
          ${riga("Hai pagato", EURO(totale, dati.currency), true)}
          ${riga("Quando", ora)}
        </table>
        ${
          dati.saldato
            ? `<p style="font-size:15px;color:#13332C;">Il conto del tavolo è saldato.</p>`
            : `<p style="font-size:15px;color:#4F351B;">Sul conto del tavolo restano ${EURO(
                dati.residuoCents,
                dati.currency,
              )} a carico degli altri commensali.</p>`
        }
        <p style="font-size:13px;color:#666;margin-top:28px;">
          Questa è una conferma di pagamento, non una fattura fiscale: per quella chiedi al locale.
        </p>
      </div>`;

    invii.push(
      resend.emails
        .send({
          from: FROM_EMAIL,
          to: dati.clienteEmail,
          subject: `Pagamento riuscito — ${locale}`,
          html,
        })
        .catch((e) => console.error("[EMAIL] ricevuta al cliente:", e)),
    );
  }

  await Promise.allSettled(invii);
}

/**
 * L'email amministrativa del modulo DEM.
 *
 * Una sola forma per tutte — pagamento non riuscito, dominio pronto, invii
 * sospesi — perché sono tutte la stessa cosa: un fatto successo mentre nessuno
 * guardava, e un posto dove andare a vederlo. Un modello per ciascuna avrebbe
 * prodotto cinque impaginazioni leggermente diverse della stessa busta.
 *
 * Non nomina mai chi spedisce per noi: il servizio è Foodtech, e da dove
 * escono materialmente le email non è una cosa che riguarda il ristoratore.
 */
export async function sendDemOperationalEmail(opts: {
  to: string;
  nome: string;
  venueName: string;
  titolo: string;
  testo: string;
  link?: string;
}) {
  if (!resend) {
    console.log(`[EMAIL] DEM (Resend not configured): ${opts.to} — ${opts.titolo}`);
    return;
  }

  const saluto = opts.nome ? `Ciao ${testoSicuro(opts.nome)},` : "Ciao,";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1a1a1a; font-size: 20px;">${testoSicuro(opts.titolo)}</h1>
      <p style="font-size: 16px; color: #333;">${saluto}</p>
      <p style="font-size: 16px; color: #333;">${testoSicuro(opts.testo)}</p>
      ${opts.link ? `<p style="font-size: 14px;"><a href="${opts.link}">Apri Foodtech</a></p>` : ""}
      <p style="font-size: 14px; color: #666; margin-top: 30px;">${testoSicuro(opts.venueName)}</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.titolo,
      html: htmlContent,
    });
  } catch (error) {
    console.error(`[EMAIL] Failed to send DEM email to ${opts.to}:`, error);
  }
}
