import { permanentRedirect } from "next/navigation";

/**
 * `/waiters` è diventato `/staff`.
 *
 * Il reindirizzamento non è cortesia: fuori da qui esistono link già scritti
 * che puntano al vecchio percorso — la notifica di contratto in scadenza
 * (`src/server/staff-contracts-cron.ts`) manda a `/waiters?waiterId=…`, e
 * quelle notifiche sono già nel database di chi usa il prodotto. Conserva la
 * query, così il profilo si apre lo stesso.
 */
export default function WaitersRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const query = qs.toString();
  permanentRedirect(query ? `/staff?${query}` : "/staff");
}
