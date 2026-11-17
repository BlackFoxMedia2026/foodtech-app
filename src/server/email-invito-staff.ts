import { brevoAdapter } from "@/server/marketing/brevo-adapter";

/**
 * L'email che arriva a una persona appena registrata in organico.
 *
 * Prima l'invito era solo un link da copiare e consegnare a mano: il
 * responsabile lo mandava su WhatsApp, o se lo dimenticava, e la persona non
 * entrava mai. Ora, se la posta è configurata, parte da sola nel momento in
 * cui si crea l'accesso: un pulsante «Configura la password» che apre
 * `/invito/<token>`, dove la persona sceglie la password ed entra.
 *
 * Il link resta comunque visibile nella scheda: se l'email finisce nello
 * spam, o la posta non è attiva su questa installazione, c'è ancora la
 * consegna a mano.
 */

/** Questa installazione sa mandare email? Stesso controllo del recupero password. */
export function postaAttiva() {
  return !!process.env.BREVO_API_KEY;
}

export type EsitoInvioInvito = "inviata" | "posta_non_configurata" | "invio_non_riuscito";

export async function inviaEmailInvitoStaff(opts: {
  email: string;
  nome: string | null;
  locale: string;
  ruolo: string;
  link: string;
  scadeIl: Date;
}): Promise<EsitoInvioInvito> {
  if (!postaAttiva()) return "posta_non_configurata";
  try {
    await brevoAdapter.sendTransactionalEmail({
      to: opts.email,
      subject: `Benvenuto nel team di ${opts.locale}: configura la tua password`,
      html: corpoEmailInvito(opts),
    });
    return "inviata";
  } catch (err) {
    console.error("[invito-staff] invio non riuscito", err);
    return "invio_non_riuscito";
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function corpoEmailInvito(opts: { nome: string | null; locale: string; ruolo: string; link: string; scadeIl: Date }) {
  const saluto = opts.nome ? `Ciao ${esc(opts.nome)},` : "Ciao,";
  const scadenza = opts.scadeIl.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
  return `
    <div style="background:#f3efe6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1b2a22;">
      <div style="max-width:520px;margin:0 auto;background:#fdfbf5;border:1px solid #d5cdb9;border-radius:16px;padding:32px;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a5a1c;">Nuova registrazione</p>
        <h1 style="font-size:22px;line-height:1.3;margin:0 0 20px;font-family:Georgia,serif;font-weight:normal;">
          Sei nel team di ${esc(opts.locale)}
        </h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">${saluto}</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
          ${esc(opts.locale)} ti ha registrato su Tavolo, il gestionale del locale, come
          <strong>${esc(opts.ruolo)}</strong>. Da qui vedrai i tuoi turni e potrai lavorare in servizio.
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
          Per entrare ti manca solo una cosa: scegliere la tua password.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${opts.link}" style="background:#1d3227;color:#f7f3ea;text-decoration:none;padding:14px 24px;border-radius:999px;font-size:15px;font-weight:bold;display:inline-block;">
            Configura password
          </a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#3d4f45;margin:0 0 8px;">
          Il link vale fino al ${scadenza} e si usa una volta sola. Se il pulsante non funziona, copia questo indirizzo nel browser:
        </p>
        <p style="font-size:12px;line-height:1.5;word-break:break-all;color:#556659;margin:0 0 20px;">${opts.link}</p>
        <p style="font-size:13px;line-height:1.6;color:#3d4f45;margin:0;">
          Non lavori da ${esc(opts.locale)}? Ignora questa email: senza password l'accesso non si attiva.
        </p>
      </div>
    </div>
  `;
}
