export const dynamic = "force-dynamic";

export default function Onboarding() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <h1 className="text-display text-2xl">Account creato</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Non risultano locali associati al tuo profilo. Chiedi al tuo manager di
          aggiungerti come membro o esegui di nuovo il seed di esempio.
        </p>
      </div>
    </main>
  );
}
