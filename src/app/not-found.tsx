/**
 * La pagina che non esiste.
 *
 * Senza questo file Next.js mostrava la sua, con il testo nero su fondo
 * scuro del tema Sera: illeggibile. Il tono è quello di `error.tsx`, perché
 * qui arriva soprattutto chi ha in mano un link del ristorante, non un utente
 * di Tavolo; per la stessa ragione non c'è un tasto che porti al gestionale.
 */
export default function PaginaInesistente() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="surface w-full max-w-md riquadro p-8 text-center">
        <h1 className="text-display text-2xl">Pagina non trovata</h1>
        <p className="mt-2 text-base text-muted-foreground md:text-sm">
          L&apos;indirizzo non porta da nessuna parte: forse il link è incompleto o non è più valido. Se cercavi un
          ristorante, chiamalo direttamente.
        </p>
      </div>
    </div>
  );
}
