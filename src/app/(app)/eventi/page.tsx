import { notFound } from "next/navigation";
import { can, getActiveVenue } from "@/lib/tenant";
import { elencaRichieste } from "@/server/eventi";
import { Trattative, type Trattativa } from "@/components/eventi/trattative";

export const dynamic = "force-dynamic";

/**
 * Eventi e gruppi: la coda delle trattative.
 *
 * ## Cosa c'è qui e cosa no
 *
 * C'è **il lavoro da fare**: le richieste che aspettano un preventivo e quelle
 * a cui il preventivo è stato mandato. Le chiuse si vedono chiedendole — una
 * coda che mostra anche le vinte e le perse non è una coda, è un archivio, e
 * un archivio non si smaltisce.
 *
 * ## Perché non è in barra
 *
 * Perché un preventivo per quaranta persone si scrive la mattina dopo, non
 * alle nove di sabato. Ma **scade**: chi chiede un prezzo lo chiede a tre
 * ristoranti lo stesso pomeriggio, e per questo ogni richiesta suona nella
 * campanella — che è il posto che si guarda durante il servizio.
 */
export default async function EventiPage({
  searchParams,
}: {
  searchParams: { tutte?: string };
}) {
  const ctx = await getActiveVenue();
  /* Chi risponde al telefono deve poter scrivere una richiesta e fare un
     preventivo: è il gesto di chi prende le prenotazioni, non di chi
     configura il locale. */
  if (!can(ctx.role, "manage_bookings")) notFound();

  const tutte = searchParams.tutte === "1";
  const righe = await elencaRichieste(ctx.venueId, { stato: tutte ? "tutte" : "aperte" });

  const trattative: Trattativa[] = righe.map((r) => ({
    id: r.id,
    nome: r.nome,
    telefono: r.telefono,
    email: r.email,
    persone: r.persone,
    quando: r.quando?.toISOString() ?? null,
    quandoTesto: r.quandoTesto,
    tipo: r.tipo,
    stato: r.stato,
    budgetCents: r.budgetCents,
    preventivoCents: r.preventivoCents,
    perPersonaCents: r.perPersonaCents,
    menuConcordato: r.menuConcordato,
    note: r.note,
    motivo: r.motivo,
    bookingId: r.bookingId,
    giorniFerma: r.giorniFerma,
  }));

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-4xl gap-4">
      <header className="fissa">
        <p className="t-etichetta">Gestione</p>
        <h1 className="text-display text-2xl">Eventi e gruppi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le richieste per un gruppo grande o una festa: un preventivo da fare, una data da
          fissare, e poi finisce in agenda. Finché è una trattativa non occupa la sala.
        </p>
        <p className="mt-2 text-sm">
          <a className="underline" href={tutte ? "/eventi" : "/eventi?tutte=1"}>
            {tutte ? "Mostra solo quelle aperte" : "Mostra anche le chiuse"}
          </a>
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <Trattative
          iniziali={trattative}
          valuta={ctx.venue.currency}
          canManage={can(ctx.role, "manage_bookings")}
        />
      </div>
    </div>
  );
}
