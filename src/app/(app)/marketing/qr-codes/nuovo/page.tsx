import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { origineDa } from "@/lib/origine";
import { contestoEditor } from "@/server/qr-codes";
import { tipoValido } from "@/lib/qr-tipi";
import { bozzaNuova } from "@/components/marketing/qr/bozza";
import { QrCreazione } from "@/components/marketing/qr/qr-creazione";

export const dynamic = "force-dynamic";

/**
 * L'editor di un codice nuovo.
 *
 * Il tipo arriva dall'indirizzo e non da uno stato: chi ricarica la pagina a
 * metà lavoro riprende dallo stesso tipo invece di ritrovarsi la domanda
 * iniziale, e un tipo che non esiste riporta alla domanda invece di aprire un
 * editor che non sa cosa sta modificando.
 */
export default async function NuovoQrPage({
  searchParams,
}: {
  searchParams: { tipo?: string };
}) {
  if (!tipoValido(searchParams.tipo)) redirect("/marketing/qr-codes");

  const venue = await getActiveVenue();
  const ctx = await contestoEditor(venue.venue, origineDa(headers()), can(venue.role, "manage_venue"));

  return <QrCreazione bozzaIniziale={bozzaNuova(searchParams.tipo, ctx)} ctx={ctx} />;
}
