import { createVerify } from "node:crypto";
import { NextResponse } from "next/server";
import { logAttenzione, logErrore, logEvento } from "@/lib/observability";
import { ricevi } from "@/server/dem/eventi";

/**
 * Gli esiti delle email: consegne, aperture, click, rimbalzi, segnalazioni.
 *
 * ## Perché la firma si verifica davvero
 *
 * Questo è un indirizzo **pubblico** che scrive statistiche, mette indirizzi in
 * lista di soppressione e toglie il consenso a dei clienti. Senza verifica,
 * chiunque conosca l'indirizzo potrebbe inviare un finto rimbalzo e far
 * smettere di ricevere le newsletter a un cliente qualsiasi di un locale
 * qualsiasi. Un segreto nell'indirizzo non basterebbe: finisce nei log dei
 * proxy e nella cronologia di chi lo configura.
 *
 * Quindi tre controlli, in quest'ordine, e nessuno è facoltativo:
 *
 * 1. **il certificato viene dal dominio giusto.** Se si accettasse un
 *    `SigningCertURL` qualunque, chi firma il messaggio potrebbe anche fornire
 *    la chiave con cui verificarlo: la verifica sarebbe teatro;
 * 2. **la firma corrisponde** al messaggio, ricomposto nell'ordine esatto dei
 *    campi previsto;
 * 3. **l'argomento è il nostro.** Un messaggio firmato bene ma di un altro
 *    argomento non ci riguarda.
 *
 * ## Perché risponde 200 quasi sempre
 *
 * Chi consegna ritenta per giorni su un errore, e ritentare non serve quando
 * il problema è che il messaggio non ci interessa. L'unico 500 legittimo è
 * «l'ho ricevuto e non sono riuscito a scriverlo».
 */

export const dynamic = "force-dynamic";

type MessaggioSns = {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  Token?: string;
  SubscribeURL?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
};

export async function POST(req: Request) {
  const corpo = await req.text();

  let msg: MessaggioSns;
  try {
    msg = JSON.parse(corpo) as MessaggioSns;
  } catch {
    return NextResponse.json({ error: "corpo_non_valido" }, { status: 400 });
  }

  const atteso = process.env.SES_EVENT_SNS_TOPIC_ARN;
  if (!atteso) {
    // Non configurato: si dice che non siamo pronti invece di accettare in
    // silenzio eventi che non sappiamo a chi attribuire.
    return NextResponse.json({ error: "eventi_non_configurati" }, { status: 503 });
  }
  if (msg.TopicArn !== atteso) {
    logAttenzione("dem.eventi.argomento_estraneo", { argomento: msg.TopicArn ?? "assente" });
    return NextResponse.json({ error: "argomento_non_riconosciuto" }, { status: 403 });
  }

  if (!(await firmaValida(msg))) {
    logAttenzione("dem.eventi.firma_non_valida", { messaggio: msg.MessageId ?? "assente" });
    return NextResponse.json({ error: "firma_non_valida" }, { status: 403 });
  }

  /*
    La conferma dell'iscrizione.

    Si conferma **dopo** aver verificato firma e argomento: confermare a scatola
    chiusa significherebbe permettere a chiunque di agganciare il nostro
    indirizzo a un argomento suo, e poi mandarci quello che vuole.
  */
  if (msg.Type === "SubscriptionConfirmation" && msg.SubscribeURL) {
    try {
      await fetch(msg.SubscribeURL);
      logEvento("dem.eventi.iscrizione_confermata", { argomento: msg.TopicArn });
    } catch (err) {
      logErrore("dem.eventi.iscrizione_non_confermata", err);
    }
    return NextResponse.json({ ok: true });
  }

  if (msg.Type !== "Notification" || !msg.Message) {
    return NextResponse.json({ ok: true });
  }

  try {
    const evento = JSON.parse(msg.Message) as unknown;
    await ricevi([evento]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Qui il ritentativo serve davvero: l'evento è arrivato e non l'abbiamo
    // scritto. Riceverlo di nuovo non produce doppioni — ci pensa il vincolo
    // di unicità sull'identificativo dell'evento.
    logErrore("dem.eventi.non_registrato", err, { messaggio: msg.MessageId ?? "" });
    return NextResponse.json({ error: "non_registrato" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */

/** I certificati già scaricati: cambiano di rado, e uno scarico per evento
 *  significherebbe una chiamata in uscita per ogni apertura di ogni email. */
const certificati = new Map<string, string>();

async function firmaValida(msg: MessaggioSns): Promise<boolean> {
  if (!msg.Signature || !msg.SigningCertURL) return false;

  let url: URL;
  try {
    url = new URL(msg.SigningCertURL);
  } catch {
    return false;
  }

  // Solo i domini di chi ci manda gli eventi, e solo in https: è il controllo
  // che impedisce a chi firma di fornire anche la chiave per verificarsi.
  if (url.protocol !== "https:" || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) {
    return false;
  }

  let certificato = certificati.get(url.href);
  if (!certificato) {
    try {
      const res = await fetch(url.href);
      if (!res.ok) return false;
      certificato = await res.text();
      certificati.set(url.href, certificato);
    } catch {
      return false;
    }
  }

  const daFirmare = stringaDaFirmare(msg);
  if (!daFirmare) return false;

  try {
    const verificatore = createVerify(msg.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256");
    verificatore.update(daFirmare, "utf8");
    return verificatore.verify(certificato, msg.Signature, "base64");
  } catch {
    return false;
  }
}

/**
 * Il messaggio ricomposto **nell'ordine esatto** in cui è stato firmato.
 *
 * L'ordine dei campi non è una convenzione estetica: è parte della firma. Un
 * campo fuori posto, o presente quando non doveva esserci, produce una firma
 * che non corrisponde — e il messaggio viene rifiutato anche se era buono.
 */
function stringaDaFirmare(msg: MessaggioSns): string | null {
  const campi =
    msg.Type === "Notification"
      ? (["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const)
      : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);

  const pezzi: string[] = [];
  for (const campo of campi) {
    const valore = msg[campo];
    // `Subject` c'è solo quando c'è: includerlo vuoto cambierebbe la firma.
    if (valore === undefined || valore === null) continue;
    pezzi.push(campo, String(valore));
  }
  return pezzi.length > 0 ? `${pezzi.join("\n")}\n` : null;
}
