import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  esitoBrevoSms,
  mandaSms,
  mittenteSms,
  numeroPerBrevo,
  smsConfigurato,
} from "@/server/messaging/sms";
import { canalePerTelefono, channelAvailable } from "@/server/messaging/send";
import { testoPromemoriaSms } from "@/server/reminders";

/**
 * Il canale SMS.
 *
 * Non si prova «Brevo funziona» — quello si vede da un messaggio che arriva.
 * Si prova la parte che, sbagliando, produce **un messaggio dichiarato mandato
 * e mai partito**: è la bugia che si scopre solo dal cliente che non si
 * presenta, e la stessa che `esitoResend` esiste per non ripetere.
 *
 * E si prova il costo: un SMS con una lettera accentata cambia alfabeto e i
 * caratteri per messaggio passano da centosessanta a settanta. Nessun errore
 * lo dice — si scopre dalla fattura.
 */

/* Numeri inventati: nessun numero vero entra nel codice. */
const IN_SCHEDA = "333 111 2233";
const E164 = "+393331112233";

const ambiente = { ...process.env };

beforeEach(() => {
  process.env.BREVO_API_KEY = "chiave-di-prova";
  process.env.BREVO_SMS_SENDER = "Tavolo";
});

afterEach(() => {
  process.env = { ...ambiente };
  vi.restoreAllMocks();
});

describe("quando il canale è acceso", () => {
  it("serve la chiave **e** il mittente: con uno solo non si manda", () => {
    expect(smsConfigurato()).toBe(true);

    delete process.env.BREVO_SMS_SENDER;
    /* Un mittente indovinato è un messaggio che arriva a nome di qualcun
       altro: meglio canale spento. */
    expect(smsConfigurato()).toBe(false);
    expect(mittenteSms()).toBeNull();

    process.env.BREVO_SMS_SENDER = "Tavolo";
    delete process.env.BREVO_API_KEY;
    expect(smsConfigurato()).toBe(false);
  });

  it("la disponibilità si legge a ogni chiamata, non all'avvio", () => {
    /* Letta una volta al caricamento del modulo, una chiave aggiunta dopo non
       sarebbe mai vista — e in un test non si potrebbe provare il percorso
       «canale acceso» senza mandare un messaggio vero. */
    expect(channelAvailable("SMS")).toBe(true);
    delete process.env.BREVO_API_KEY;
    expect(channelAvailable("SMS")).toBe(false);
  });

  it("per un telefono si usa l'SMS finché WhatsApp non c'è, e niente se manca tutto", () => {
    expect(canalePerTelefono()).toBe("SMS");
    /* WhatsApp non si finge: vuole un account Business e un modello approvato
       da Meta. Quando ci sarà, questa funzione lo preferirà da sola. */
    expect(channelAvailable("WHATSAPP")).toBe(false);

    delete process.env.BREVO_API_KEY;
    expect(canalePerTelefono()).toBeNull();
  });
});

describe("il numero come lo vuole il fornitore", () => {
  it("prefisso internazionale, senza il più", () => {
    /* Il numero scritto come lo scrive l'operatore in sala verrebbe rifiutato
       con un 400 che parla di «invalid recipient», e si perde mezz'ora a
       cercare la chiave sbagliata. */
    expect(numeroPerBrevo(IN_SCHEDA)).toBe("393331112233");
    expect(numeroPerBrevo(E164)).toBe("393331112233");
  });

  it("un numero che non è un numero non diventa una richiesta", async () => {
    expect(numeroPerBrevo("412")).toBeNull();
    const chiamate = vi.fn();
    globalThis.fetch = chiamate as never;
    await expect(mandaSms({ to: "412", body: "ciao" })).rejects.toThrow(/numero/);
    expect(chiamate).not.toHaveBeenCalled();
  });
});

describe("cosa dice davvero la risposta del fornitore", () => {
  it("accettato: torna l'identificativo del messaggio", () => {
    expect(esitoBrevoSms(201, { messageId: 1949636631 })).toEqual({ providerId: "1949636631" });
  });

  it("rifiutato: il motivo del fornitore si riporta tale e quale", () => {
    /* «Credito esaurito» e «numero non valido» mandano a fare due cose
       diverse, e un generico «invio non riuscito» le confonde. */
    expect(() => esitoBrevoSms(402, { code: "not_enough_credits", message: "Not enough credits" })).toThrow(
      "Not enough credits",
    );
    expect(() => esitoBrevoSms(400, { code: "invalid_parameter" })).toThrow("invalid_parameter");
    expect(() => esitoBrevoSms(500, null)).toThrow(/500/);
  });

  it("accettato senza dirlo non è accettato", () => {
    /* È la stessa lezione di `esitoResend`: se il fornitore non dice quale
       messaggio ha preso in carico, non sappiamo che l'ha preso in carico. Un
       «mandato» qui è un cliente che non riceve niente e un locale convinto
       del contrario. */
    expect(() => esitoBrevoSms(200, {})).toThrow(/non ha confermato/);
    expect(() => esitoBrevoSms(200, { messageId: "" })).toThrow(/non ha confermato/);
  });
});

describe("la richiesta che parte", () => {
  it("porta la chiave, il mittente e il tipo transazionale", async () => {
    const chiamate = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ messageId: 42 }),
    });
    globalThis.fetch = chiamate as never;

    expect(await mandaSms({ to: E164, body: "Ti aspettiamo domani" })).toEqual({ providerId: "42" });

    const [url, opzioni] = chiamate.mock.calls[0]!;
    expect(String(url)).toContain("transactionalSMS");
    const o = opzioni as { headers: Record<string, string>; body: string };
    expect(o.headers["api-key"]).toBe("chiave-di-prova");
    const corpo = JSON.parse(o.body);
    expect(corpo).toMatchObject({
      sender: "Tavolo",
      recipient: "393331112233",
      content: "Ti aspettiamo domani",
      /* `transactional` e non `marketing`: un promemoria di una prenotazione
         mandato come marketing sarebbe classificato male da entrambe le parti,
         e il marketing ha regole di orario e consenso diverse. */
      type: "transactional",
    });
  });

  it("senza canale non prova nemmeno", async () => {
    delete process.env.BREVO_API_KEY;
    const chiamate = vi.fn();
    globalThis.fetch = chiamate as never;
    await expect(mandaSms({ to: E164, body: "ciao" })).rejects.toThrow("sms_not_configured");
    expect(chiamate).not.toHaveBeenCalled();
  });
});

describe("il testo del promemoria", () => {
  const dati = {
    nome: "Mario",
    locale: "Nomad",
    quando: "domani" as const,
    ora: "20:30",
    persone: 4,
    linkAnnulla: "https://prova.test/b/abc",
  };

  it("dice quando, quante persone, e come annullare in un tocco", () => {
    const t = testoPromemoriaSms(dati);
    expect(t).toContain("Mario");
    expect(t).toContain("domani alle 20:30");
    expect(t).toContain("Nomad");
    expect(t).toContain("4 persone");
    /* Chi viene non deve fare niente; chi non viene deve poterlo dire in un
       tocco — una telefonata da fare è la frizione che produce i no-show. */
    expect(t).toContain("https://prova.test/b/abc");
  });

  it("**nessuna lettera accentata**: costerebbe il doppio", () => {
    /*
      Un SMS con una sola lettera accentata passa da GSM-7 (160 caratteri per
      messaggio) a UCS-2 (70). Lo stesso testo costa il doppio o il triplo e
      nessun errore lo dice: si scopre dalla fattura.

      Questo test esiste perché la tentazione di scrivere «può» invece di
      «puoi» per far suonare meglio la frase è forte, e il costo non si vede.
    */
    const t = testoPromemoriaSms(dati);
    expect(t).not.toMatch(/[àèéìòóùÀÈÉÌÒÓÙ]/);
    expect(t).toMatch(/non puoi venire/);
  });

  it("senza nome comincia con la maiuscola, e non con un segnaposto", () => {
    /* «ti aspettiamo…» con la minuscola si legge come un messaggio tagliato a
       meta, e un messaggio che sembra rotto si legge come un imbroglio. */
    const t = testoPromemoriaSms({ ...dati, nome: null });
    expect(t.startsWith("Ti aspettiamo")).toBe(true);
    /* Attenzione al controllo facile: «annulla» contiene «null», quindi
       cercare quella stringa nel testo non prova niente. Si guarda l'inizio. */
    expect(t.slice(0, 20)).not.toContain("null");
  });

  it("una persona non diventa «1 persone»", () => {
    expect(testoPromemoriaSms({ ...dati, persone: 1 })).toContain("1 persona");
  });

  it("sta in due messaggi, link compreso", () => {
    /* Il tetto pratico: due segmenti GSM-7. Oltre, il promemoria di una cena
       costa come tre. Il link e la parte lunga, e non si puo accorciare. */
    expect(testoPromemoriaSms(dati).length).toBeLessThanOrEqual(320);
  });
});
