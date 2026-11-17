"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MailCheck, Send, UserCog } from "lucide-react";
import type { StaffRole } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoModulo, GrigliaCampi, Sezione } from "@/components/staff/scheda/sezione";
import { CLASSE_AVANTI } from "@/components/staff/nuova/piede-passi";
import { readApiError } from "@/lib/api-client";
import { RUOLI_ACCESSO } from "@/lib/scheda-dipendente";

type Esito = { email: string; inviata: boolean; link: string };

/**
 * L'ultimo passo: l'accesso al gestionale, con l'invito per email.
 *
 * Il responsabile conferma l'indirizzo e il ruolo, preme «Invia l'invito», e
 * alla persona arriva un'email con «Configura password»: la apre, sceglie la
 * password, entra. Niente link da copiare e mandare su WhatsApp — a meno che
 * la posta non sia attiva su questa installazione o l'invio non riesca, e
 * allora il link si vede qui, da consegnare a mano.
 *
 * È facoltativo: chi non deve entrare nel gestionale (un lavapiatti, uno
 * stagionale di due settimane) si chiude con «Fine» senza accesso.
 */
export function PassoAccesso({
  waiterId,
  nome,
  emailIniziale,
  postaAttiva,
}: {
  waiterId: string;
  nome: string;
  emailIniziale: string | null;
  postaAttiva: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(emailIniziale ?? "");
  const [role, setRole] = useState<StaffRole>("WAITER");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [copiato, setCopiato] = useState(false);

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pulita = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pulita)) return setErrore("Serve un indirizzo email valido.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${waiterId}/account`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: pulita, role, inviaEmail: true }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile creare l'accesso."));
    const dati = await res.json();
    if (dati.collegato) {
      // L'indirizzo aveva già un account in questo locale: collegato e basta.
      router.refresh();
      return;
    }
    setEsito({ email: dati.email, inviata: dati.email_invito === "inviata", link: dati.link });
    router.refresh();
  }

  async function copia(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiato(true);
      window.setTimeout(() => setCopiato(false), 2000);
    } catch {
      /* Il browser non lo permette: il link resta selezionabile a mano. */
    }
  }

  if (esito) {
    return (
      <Sezione titolo="Accesso al gestionale" icona={UserCog}>
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[hsl(var(--turno-sala)/0.12)] text-[hsl(var(--turno-sala))]">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          {esito.inviata ? (
            <>
              <p className="text-display text-xl">Invito inviato</p>
              <p className="max-w-md text-sm text-muted-foreground">
                A <strong className="text-foreground">{esito.email}</strong> è arrivata l&apos;email di registrazione con il
                pulsante «Configura password». Quando {nome} sceglie la password, l&apos;account si collega da solo a questa
                scheda.
              </p>
            </>
          ) : (
            <>
              <p className="text-display text-xl">Accesso creato, email non partita</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {postaAttiva
                  ? "Il servizio di posta ha rifiutato l'invio."
                  : "L'invio delle email non è attivo su questa installazione."}{" "}
                Consegna a {nome} questo link: aprendolo sceglie la password.
              </p>
            </>
          )}
          <div className="mt-2 flex w-full max-w-lg items-center gap-2 rounded-full border border-border/70 bg-card py-1 pl-4 pr-1">
            <span className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground">{esito.link}</span>
            <button
              type="button"
              onClick={() => void copia(esito.link)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium hover:bg-veil-10"
            >
              {copiato ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copiato ? "Copiato" : "Copia link"}
            </button>
          </div>
        </div>
      </Sezione>
    );
  }

  return (
    <form onSubmit={invia} noValidate>
      <Sezione
        titolo="Accesso al gestionale"
        icona={UserCog}
        descrizione={`Facoltativo. Con l'accesso ${nome} vede i suoi turni e lavora in servizio dal telefono.`}
      >
        <div className="space-y-5">
          <GrigliaCampi colonne={2}>
            <CampoModulo
              etichetta="Email"
              htmlFor="emailAccesso"
              errore={errore ?? undefined}
              nota="Qui arriva l'email di registrazione. Diventa anche l'email della scheda."
            >
              <Input
                id="emailAccesso"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.it"
                aria-invalid={!!errore}
              />
            </CampoModulo>
            <CampoModulo
              etichetta="Ruolo nel gestionale"
              htmlFor="ruoloAccesso"
              nota={RUOLI_ACCESSO.find((r) => r.value === role)?.descrizione}
            >
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger id="ruoloAccesso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUOLI_ACCESSO.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoModulo>
          </GrigliaCampi>

          {/* Come sarà l'email: chi la manda vuole sapere cosa riceverà
              l'altro, prima di premere. */}
          <div className="rounded-xl border border-border/60 bg-card-sunken p-4">
            <p className="t-etichetta mb-2">Cosa riceve</p>
            <p className="text-sm text-foreground">
              Un&apos;email «Benvenuto nel team» con il pulsante <strong>Configura password</strong>. Aprendolo sceglie la
              sua password ed entra. Il link vale una settimana e si usa una volta sola.
            </p>
            {!postaAttiva && (
              <p className="mt-2 text-xs text-destructive-soft">
                L&apos;invio delle email non è attivo su questa installazione: l&apos;accesso si crea lo stesso, e il link
                te lo mostriamo qui da consegnare a mano.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={inCorso} className={CLASSE_AVANTI}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {inCorso ? "Invio…" : "Crea accesso e invia l'invito"}
            </button>
          </div>
        </div>
      </Sezione>
    </form>
  );
}
