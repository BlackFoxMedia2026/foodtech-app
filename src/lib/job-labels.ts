/** Come si chiama un lavoro in coda, per chi non ha scritto il codice. */
export const JOB_LABELS: Record<string, string> = {
  "message.send": "Messaggio a un ospite",
  "campaign.send": "Invio di una campagna",
};

export function jobLabel(kind: string): string {
  return JOB_LABELS[kind] ?? kind;
}
