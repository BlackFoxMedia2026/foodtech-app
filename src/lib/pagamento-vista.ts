import type { PaymentKind, PaymentStatus } from "@prisma/client";

/**
 * Come si chiamano, in italiano, i tipi e gli stati di un pagamento.
 *
 * Stava scritto due volte — nella pagina Pagamenti e nella scheda del cliente
 * — e le due copie erano già identiche per caso, non per costruzione:
 * aggiungere uno stato ne sistemava una e lasciava l'altra a mostrare la
 * sigla inglese del database. Adesso è un posto solo, ed è tipizzato sugli
 * enum di Prisma: dimenticare un caso nuovo diventa un errore di compilazione
 * invece di una parola strana in faccia al ristoratore.
 */

export const ETICHETTA_TIPO: Record<PaymentKind, string> = {
  DEPOSIT: "Caparra",
  PREAUTH: "Preautorizzazione",
  TICKET: "Ticket",
  REFUND: "Rimborso",
  PACKAGE: "Pacchetto",
  TABLE_QR: "Al tavolo",
};

export type TonoPagamento = "success" | "warning" | "danger" | "neutral";

export const TONO_STATO: Record<PaymentStatus, TonoPagamento> = {
  PENDING: "warning",
  PROCESSING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "neutral",
};

export const ETICHETTA_STATO: Record<PaymentStatus, string> = {
  PENDING: "In attesa",
  PROCESSING: "In corso",
  SUCCEEDED: "Riuscito",
  FAILED: "Fallito",
  CANCELLED: "Annullato",
  EXPIRED: "Scaduto",
  REFUNDED: "Rimborsato",
  PARTIALLY_REFUNDED: "Rimborsato in parte",
};

/**
 * Gli stati in cui un pagamento **tiene impegnato** del denaro senza averlo
 * ancora incassato.
 *
 * È l'elenco che decide il residuo di un tavolo, e per questo sta qui e non
 * sparso nelle interrogazioni: il giorno in cui si aggiunge uno stato
 * intermedio, dimenticarlo in uno dei punti significherebbe lasciar pagare
 * due volte la stessa cena.
 */
export const STATI_IMPEGNATIVI: PaymentStatus[] = ["PROCESSING"];

/** Gli stati in cui il denaro è entrato davvero. */
export const STATI_INCASSATI: PaymentStatus[] = ["SUCCEEDED", "PARTIALLY_REFUNDED"];
