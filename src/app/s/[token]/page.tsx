import type { Metadata } from "next";
import { readSurveyByToken } from "@/server/surveys";
import { SurveyForm } from "@/components/surveys/survey-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Com'è andata? · Tavolo",
};

/** La pagina che l'ospite apre dal messaggio dopo la visita. */
export default async function SurveyPage({ params }: { params: { token: string } }) {
  const survey = await readSurveyByToken(params.token);

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md">
        {survey ? (
          <SurveyForm survey={survey} />
        ) : (
          <div className="surface rounded-md border border-border p-6 text-center">
            <h1 className="text-display text-2xl">Link non più valido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Questo link è scaduto o non è corretto. Se vuoi dirci qualcosa, chiamaci: ci fa piacere
              sentirti.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
