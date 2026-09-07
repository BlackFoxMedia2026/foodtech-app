/**
 * Legge il motivo vero di una risposta non riuscita.
 *
 * I componenti scartavano il messaggio del server e mostravano una frase
 * fissa: "Impossibile salvare. Verifica i dati." compariva anche quando il
 * problema era la sessione scaduta o un ruolo senza permessi — cioè quando
 * "verifica i dati" è un consiglio inutile.
 *
 * Ora le API rispondono con { error, message } e status coerenti
 * (vedi lib/api-auth.ts): questa funzione preferisce sempre il messaggio del
 * server e ricade sul testo di riserva solo se non ce n'è uno.
 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) {
    return "La sessione è scaduta. Ricarica la pagina e rientra.";
  }

  let body: { message?: string; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (body?.message) return body.message;

  if (res.status === 403) return "Il tuo ruolo non consente questa operazione.";
  if (res.status === 404) return "Questo elemento non esiste più. Ricarica la pagina.";
  if (res.status === 429) return "Troppe richieste di seguito. Riprova fra qualche istante.";

  return fallback;
}
