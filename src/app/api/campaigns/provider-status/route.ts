import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";

// Segnala solo che la chiave API Brevo è presente — NON verifica il dominio
// mittente (nessuna chiamata Brevo per quello esiste in questo progetto oggi).
export async function GET() {
  await getActiveVenue();
  return NextResponse.json({ configured: !!process.env.BREVO_API_KEY });
}
