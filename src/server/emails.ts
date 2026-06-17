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
