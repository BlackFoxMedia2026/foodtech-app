import { NextResponse } from "next/server";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { WifiError, registraLead } from "@/server/wifi";
import { messaggioDiValidazione } from "@/lib/validation-message";
import { ZodError } from "zod";

/**
 * Chi si collega alla rete lascia il contatto e riceve la password.
 *
 * Nessun accesso: è una pagina pubblica, aperta dal telefono di chi è appena
 * entrato nel locale. Il limite di frequenza è nel middleware, severo come le
 * altre azioni pubbliche — è un endpoint che scrive nel CRM.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("venue")?.trim() ?? "";
    if (!slug) return apiError(400, "bad_request", "Manca il locale.");

    const esito = await registraLead(slug, await req.json(), {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
      source: url.searchParams.get("da")?.slice(0, 40) ?? "PORTAL",
    });

    return NextResponse.json(esito, { status: 201 });
  } catch (err) {
    if (err instanceof WifiError) {
      if (err.code === "not_configured") {
        return apiError(
          409,
          err.code,
          "La rete di questo locale non è ancora configurata. Chiedi la password al personale.",
        );
      }
      return apiError(404, "not_found", "Locale non trovato.");
    }
    if (err instanceof ZodError) {
      // Dire quale campo manca, non «alcuni campi non sono validi»: qui c'è
      // una persona in piedi con il telefono in mano.
      return apiError(400, "validation_error", messaggioDiValidazione(err));
    }
    return apiErrorResponse(err);
  }
}
