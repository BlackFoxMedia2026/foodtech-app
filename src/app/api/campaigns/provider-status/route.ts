import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";

// Segnala solo che la chiave API Brevo è presente — NON verifica il dominio
// mittente (nessuna chiamata Brevo per quello esiste in questo progetto oggi).
export async function GET() {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({ configured: !!process.env.BREVO_API_KEY });
}
