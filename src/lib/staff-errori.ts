import { ZodError } from "zod";
import { apiError, apiErrorResponse } from "./api-auth";
import { ASSIGN_ERROR_MESSAGE, BookingAssignError } from "@/server/booking-floor";
import { ComandaError, MESSAGGIO_COMANDA } from "@/server/comande/comande";
import { AccoglienzaError } from "@/server/staff-app/accoglienza";
import { MESSAGGIO_TAVOLO, TavoloError } from "@/server/staff-app/tavolo";

/**
 * Gli errori della Staff App, tradotti in qualcosa che si legge in sala.
 *
 * Esiste separato da `apiErrorResponse` per una ragione sola, e non è
 * l'ordine: **chi legge questi messaggi ha le mani occupate**. In back office
 * un «Operazione non possibile» costa una riflessione; in mezzo alla sala
 * costa un tavolo che aspetta mentre qualcuno cerca di capire cosa è successo.
 * Ogni codice qui ha una frase che dice *cosa fare*, non *cosa è andato male*.
 *
 * Gli status contano come altrove: 409 per un conflitto (la comanda è già
 * partita), 422 per un dato che non sta in piedi, 404 per una cosa che non
 * c'è. Quello che cambia è il corpo.
 */

/** 409 è la risposta giusta a «questa comanda è già in cucina»: non è un dato
 * sbagliato, è il mondo che è andato avanti mentre si guardava lo schermo. */
const STATUS_COMANDA: Record<ComandaError["code"], number> = {
  not_found: 404,
  already_closed: 409,
  not_available: 409,
  empty_comanda: 422,
  gia_inviata: 409,
  modifica_da_confermare: 409,
  transizione_non_valida: 409,
  allergene_sconosciuto: 422,
};

const STATUS_TAVOLO: Record<TavoloError["code"], number> = {
  not_found: 404,
  nessuna_seduta: 409,
  non_assegnato: 403,
};

/**
 * Gli errori dell'accomodamento.
 *
 * Quasi tutti sono `409`, e non è pigrizia: accomodare è il gesto più
 * contestato del servizio — due persone che guardano la stessa sala da due
 * telefoni diversi toccano lo stesso tavolo libero nello stesso momento.
 * Quello che il cameriere deve capire non è «hai sbagliato», è «qualcuno è
 * arrivato prima», e la risposta giusta è ricaricare la sala.
 */
const STATUS_ASSEGNAZIONE: Record<BookingAssignError["code"], number> = {
  booking_not_found: 404,
  table_not_found: 404,
  table_conflict: 409,
  capacity_mismatch: 409,
  retry: 409,
  needs_two_tables: 422,
  not_combinable: 422,
  different_rooms: 422,
  reason_required: 422,
};

export function staffErrorResponse(err: unknown) {
  if (err instanceof ComandaError) {
    return apiError(
      STATUS_COMANDA[err.code],
      err.code,
      MESSAGGIO_COMANDA[err.code],
      err.detail,
    );
  }
  if (err instanceof TavoloError) {
    return apiError(STATUS_TAVOLO[err.code], err.code, MESSAGGIO_TAVOLO[err.code]);
  }
  if (err instanceof BookingAssignError) {
    return apiError(
      STATUS_ASSEGNAZIONE[err.code],
      err.code,
      ASSIGN_ERROR_MESSAGE[err.code],
      err.detail,
    );
  }
  if (err instanceof AccoglienzaError) {
    return apiError(err.codice === "nessun_tavolo" ? 422 : 409, err.codice, err.message);
  }
  if (err instanceof ZodError) {
    /* Passa al traduttore comune: i messaggi di validazione sono già curati
       là, e riscriverli qui creerebbe due vocabolari per gli stessi campi. */
    return apiErrorResponse(err);
  }
  return apiErrorResponse(err);
}
