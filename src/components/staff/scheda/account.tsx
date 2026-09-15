"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Link2, Pencil, ShieldCheck, UserCog } from "lucide-react";
import type { StaffPermission, StaffRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import {
  PERMESSI,
  PERMESSI_PREDEFINITI,
  RUOLI_ACCESSO,
  coincideConPreset,
  permessiEffettivi,
  ruoloAccessoLabel,
} from "@/lib/scheda-dipendente";
import { formatDateTime } from "@/lib/utils";
import { Campo, CampoModulo, GrigliaCampi, PiedeModifica, Sezione } from "./sezione";
import type { PersonaDTO } from "./tipi";

type Invito = { link: string; scadeIl: Date; role: StaffRole } | null;

/**
 * L'account con cui la persona entra in Tavolo, e cosa può farci.
 *
 * ## La password non si vede
 *
 * Non c'è un campo «Password: ••••••» con l'occhio per rivelarla, e non ci
 * sarà: il prodotto non conosce la password di nessuno (c'è un hash). Le due
 * strade sono un **link di reimpostazione** da consegnare a mano — come
 * l'invito, perché l'email di Tavolo è spenta — oppure una **password nuova
 * scelta dal responsabile**, che chiude le sessioni aperte.
 *
 * ## Permessi
 *
 * Il ruolo dà un preset; le caselle permettono di scostarsene. Finché
 * coincidono con il preset si salvano *come* preset, così un cambio di ruolo
 * domani li aggiorna. La matrice che le route applicano davvero resta
 * `abilities.ts`: questa è la lista che il responsabile legge e ritocca.
 */
export function Account({ persona, canManage, invito, eSeStesso }: { persona: PersonaDTO; canManage: boolean; invito: Invito; eSeStesso: boolean }) {
  const account = persona.account;
  const membership = account?.membership ?? null;

  return (
    <div className="space-y-5">
      {account && membership ? (
        <AccountAttivo persona={persona} canManage={canManage && !eSeStesso} eSeStesso={eSeStesso} />
      ) : account ? (
        <Sezione titolo="Account gestionale" icona={UserCog}>
          <p className="text-base text-muted-foreground">
            Questa persona ha un account Tavolo (<strong className="text-foreground">{account.email}</strong>) ma non ha accesso a questo locale:
            l&apos;accesso è stato tolto, o l&apos;account è nato in un altro locale del gruppo. Per ridarglielo serve un manager del locale.
          </p>
        </Sezione>
      ) : (
        <SenzaAccount persona={persona} canManage={canManage} invito={invito} />
      )}

      {account && membership && <Permessi persona={persona} canManage={canManage && !eSeStesso} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Senza account: si crea                                                    */
/* -------------------------------------------------------------------------- */

function SenzaAccount({ persona, canManage, invito }: { persona: PersonaDTO; canManage: boolean; invito: Invito }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [aperto, setAperto] = useState(false);
  const [email, setEmail] = useState(persona.email ?? "");
  const [role, setRole] = useState<StaffRole>("WAITER");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [linkCreato, setLinkCreato] = useState<{ link: string; scadeIl: string } | null>(null);

  async function crea(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return setErrore("Serve un indirizzo email.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${persona.id}/account`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile creare l'accesso."));
    const esito = await res.json();
    if (esito.collegato) {
      setAperto(false);
      avvisi.mostra("Account collegato");
      router.refresh();
      return;
    }
    setLinkCreato({ link: esito.link, scadeIl: esito.scadeIl });
    router.refresh();
  }

  return (
    <Sezione
      id="account"
      titolo="Account gestionale"
      icona={UserCog}
      descrizione="Questa persona non ha ancora un accesso a Tavolo."
      azione={
        canManage && (
          <Button type="button" variant="accent" onClick={() => setAperto(true)}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Crea accesso
          </Button>
        )
      }
    >
      {invito ? (
        <div className="space-y-3">
          <p className="text-base text-foreground">
            C&apos;è un invito aperto come <strong>{ruoloAccessoLabel(invito.role)}</strong>, valido fino al {formatDateTime(invito.scadeIl)}.
          </p>
          <LinkDaConsegnare link={invito.link} />
          <p className="text-sm text-muted-foreground">Quando lo accetta, l&apos;account si collega da solo a questa scheda.</p>
        </div>
      ) : (
        <p className="text-base text-muted-foreground">
          Senza account la persona è in organico ma non entra nel gestionale: non vede i suoi turni e non può prendere una comanda a suo nome.
        </p>
      )}

      <Dialog
        open={aperto}
        onOpenChange={(o) => {
          setAperto(o);
          if (!o) setLinkCreato(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crea l&apos;accesso</DialogTitle>
            <DialogDescription>
              Nasce un link da consegnare alla persona: aprendolo sceglie la password. Vale una settimana e una volta sola.
            </DialogDescription>
          </DialogHeader>
          {linkCreato ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Invito creato. Consegna questo link a {persona.firstName}:</p>
              <LinkDaConsegnare link={linkCreato.link} />
              <div className="flex justify-end">
                <Button type="button" variant="accent" onClick={() => setAperto(false)}>
                  Fatto
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={crea} className="space-y-4" noValidate>
              <CampoModulo etichetta="Email di accesso" htmlFor="emailAccesso" nota="Diventa anche l'email della scheda.">
                <Input id="emailAccesso" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@locale.it" />
              </CampoModulo>
              <CampoModulo etichetta="Ruolo nel gestionale" htmlFor="ruoloAccesso" nota={RUOLI_ACCESSO.find((r) => r.value === role)?.descrizione}>
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
              {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAperto(false)} disabled={inCorso}>
                  Annulla
                </Button>
                <Button type="submit" variant="accent" disabled={inCorso}>
                  {inCorso ? "Creo…" : "Crea il link"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Sezione>
  );
}

/* -------------------------------------------------------------------------- */
/*  Account attivo                                                            */
/* -------------------------------------------------------------------------- */

function AccountAttivo({ persona, canManage, eSeStesso }: { persona: PersonaDTO; canManage: boolean; eSeStesso: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const account = persona.account!;
  const membership = account.membership!;
  const attivo = !membership.disabledAt;

  const [modificaEmail, setModificaEmail] = useState(false);
  const [email, setEmail] = useState(account.email);
  const [erroreEmail, setErroreEmail] = useState<string | null>(null);
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  const [dialogoPassword, setDialogoPassword] = useState(false);
  const [linkReset, setLinkReset] = useState<{ link: string; scadeIl: string } | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [confermaStato, setConfermaStato] = useState(false);

  async function salvaEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setErroreEmail("Indirizzo email non valido.");
    setSalvandoEmail(true);
    setErroreEmail(null);
    const res = await fetch(`/api/waiters/${persona.id}/account`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setSalvandoEmail(false);
    if (!res.ok) return setErroreEmail(await readApiError(res, "Impossibile cambiare l'email."));
    setModificaEmail(false);
    avvisi.mostra("Email di accesso aggiornata");
    router.refresh();
  }

  async function generaReset() {
    setInCorso("reset");
    const res = await fetch(`/api/waiters/${persona.id}/account/reset-link`, { method: "POST" });
    setInCorso(null);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile generare il link."));
    setLinkReset(await res.json());
    router.refresh();
  }

  async function cambiaStato() {
    setInCorso("stato");
    const res = await fetch(`/api/waiters/${persona.id}/account/stato`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attivo: !attivo }),
    });
    setInCorso(null);
    setConfermaStato(false);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile cambiare lo stato dell'account."));
    avvisi.mostra(attivo ? "Account disattivato: le sessioni aperte sono state chiuse" : "Account riattivato");
    router.refresh();
  }

  return (
    <Sezione
      id="account"
      titolo="Account gestionale"
      icona={UserCog}
      descrizione={eSeStesso ? "Il tuo accesso. Per cambiarlo chiedi a un altro manager." : "Con cosa entra in Tavolo, e quando l'ha fatto l'ultima volta."}
    >
      {modificaEmail ? (
        <form onSubmit={salvaEmail} noValidate>
          <GrigliaCampi colonne={2}>
            <CampoModulo etichetta="Email di accesso" htmlFor="emailNuova" errore={erroreEmail ?? undefined} nota="Da subito entra con questo indirizzo. Aggiorna anche l'email della scheda.">
              <Input id="emailNuova" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </CampoModulo>
          </GrigliaCampi>
          <PiedeModifica onAnnulla={() => setModificaEmail(false)} salvando={salvandoEmail} etichettaSalva="Salva email" />
        </form>
      ) : (
        <GrigliaCampi>
          <Campo
            etichetta="Email di accesso"
            valore={
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-all">{account.email}</span>
                {canManage && (
                  <button type="button" onClick={() => setModificaEmail(true)} className="text-muted-foreground hover:text-foreground" aria-label="Modifica email di accesso">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </span>
            }
          />
          <Campo
            etichetta="Stato account"
            valore={<Badge tone={attivo ? "success" : "neutral"} className="text-sm">{attivo ? "Attivo" : "Disattivato"}</Badge>}
            nota={membership.disabledAt ? `Dal ${formatDateTime(membership.disabledAt)}` : undefined}
          />
          <Campo etichetta="Ultimo accesso" valore={account.lastLoginAt ? formatDateTime(account.lastLoginAt) : null} vuoto="Mai entrato, o prima che lo registrassimo" />
          <Campo etichetta="Ruolo nel gestionale" valore={ruoloAccessoLabel(membership.role)} nota={RUOLI_ACCESSO.find((r) => r.value === membership.role)?.descrizione} />
          <Campo
            etichetta="Password"
            valore={account.resetAperto ? "C'è un link di reimpostazione in attesa" : "Impostata"}
            nota="Non viene mai mostrata: si può solo reimpostare."
          />
        </GrigliaCampi>
      )}

      {canManage && !modificaEmail && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border/60 pt-5">
          <Button type="button" variant="outline" onClick={generaReset} disabled={inCorso !== null}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> {inCorso === "reset" ? "Genero…" : "Link reset password"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialogoPassword(true)}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Imposta nuova password
          </Button>
          <Button type="button" variant={attivo ? "ghost" : "accent"} className={attivo ? "text-destructive-soft" : undefined} onClick={() => setConfermaStato(true)}>
            {attivo ? "Disattiva account" : "Riattiva account"}
          </Button>
        </div>
      )}

      {linkReset && (
        <div className="mt-5 space-y-2 riquadro border-accent/40 p-4">
          <p className="text-sm text-foreground">
            Link creato, valido fino al {formatDateTime(linkReset.scadeIl)}. Consegnalo a {persona.firstName}: aprendolo sceglie una password nuova.
          </p>
          <LinkDaConsegnare link={linkReset.link} />
        </div>
      )}

      <DialogoPassword open={dialogoPassword} onOpenChange={setDialogoPassword} waiterId={persona.id} nome={persona.firstName} />

      <Dialog open={confermaStato} onOpenChange={setConfermaStato}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{attivo ? "Disattivare l'account?" : "Riattivare l'account?"}</DialogTitle>
            <DialogDescription>
              {attivo
                ? "La persona resta in organico con tutta la sua scheda, ma non entra più in Tavolo: le sessioni aperte si chiudono subito. Si può riattivare in qualunque momento."
                : "La persona torna a entrare con la sua email e la password che aveva."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfermaStato(false)} disabled={inCorso !== null}>
              Annulla
            </Button>
            <Button type="button" variant={attivo ? "destructive" : "accent"} onClick={cambiaStato} disabled={inCorso !== null}>
              {inCorso === "stato" ? "Un attimo…" : attivo ? "Disattiva" : "Riattiva"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sezione>
  );
}

function DialogoPassword({ open, onOpenChange, waiterId, nome }: { open: boolean; onOpenChange: (o: boolean) => void; waiterId: string; nome: string }) {
  const avvisi = useAvvisi();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  function chiudi(o: boolean) {
    if (!o) {
      setPassword("");
      setConferma("");
      setErrore(null);
    }
    onOpenChange(o);
  }

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 10) return setErrore("Servono almeno dieci caratteri.");
    if (password !== conferma) return setErrore("Le due password non coincidono.");
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${waiterId}/account/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile impostare la password."));
    chiudi(false);
    avvisi.mostra("Password impostata: le sessioni aperte sono state chiuse");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Imposta una nuova password</DialogTitle>
          <DialogDescription>
            Da dire a voce a {nome}, che dovrebbe cambiarla al primo accesso. Chi era dentro con la vecchia esce. La password non
            verrà mostrata da nessuna parte dopo il salvataggio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salva} className="space-y-4" noValidate>
          <CampoModulo etichetta="Password nuova" htmlFor="pwd" nota="Almeno dieci caratteri.">
            <Input id="pwd" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </CampoModulo>
          <CampoModulo etichetta="Ripeti la password" htmlFor="pwd2">
            <Input id="pwd2" type="password" autoComplete="new-password" value={conferma} onChange={(e) => setConferma(e.target.value)} />
          </CampoModulo>
          {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => chiudi(false)} disabled={inCorso}>
              Annulla
            </Button>
            <Button type="submit" variant="accent" disabled={inCorso}>
              {inCorso ? "Salvo…" : "Imposta password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Permessi                                                                  */
/* -------------------------------------------------------------------------- */

function Permessi({ persona, canManage }: { persona: PersonaDTO; canManage: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const membership = persona.account!.membership!;
  const [modifica, setModifica] = useState(false);
  const [role, setRole] = useState<StaffRole>(membership.role);
  const [permessi, setPermessi] = useState<StaffPermission[]>(permessiEffettivi(membership));
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const effettivi = permessiEffettivi(membership);
  const preset = coincideConPreset(role, permessi);

  function inizia() {
    setRole(membership.role);
    setPermessi(permessiEffettivi(membership));
    setErrore(null);
    setModifica(true);
  }

  function cambiaRuolo(r: StaffRole) {
    setRole(r);
    // Il ruolo nuovo porta il suo preset: chi cambia ruolo vuole i permessi
    // di quel ruolo, poi eventualmente ritocca.
    setPermessi(PERMESSI_PREDEFINITI[r]);
  }

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${persona.id}/account/permessi`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, permissions: permessi }),
    });
    setSalvando(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile salvare i permessi."));
    setModifica(false);
    avvisi.mostra("Permessi aggiornati");
    router.refresh();
  }

  const corpo = (
    <ul className="divide-y divide-border/60">
      {PERMESSI.map((p) => {
        const attivo = (modifica ? permessi : effettivi).includes(p.value);
        return (
          <li key={p.value} className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <p className={attivo || modifica ? "text-base text-foreground md:text-lg" : "text-base text-muted-foreground md:text-lg"}>{p.label}</p>
              <p className="text-sm text-muted-foreground">{p.descrizione}</p>
            </div>
            {modifica ? (
              <Switch
                checked={attivo}
                onCheckedChange={(on) => setPermessi((prev) => (on ? [...prev, p.value] : prev.filter((x) => x !== p.value)))}
                aria-label={p.label}
              />
            ) : attivo ? (
              <Check className="h-5 w-5 shrink-0 text-sage-strong" aria-label="Consentito" />
            ) : (
              <span className="text-sm text-tertiary-foreground">no</span>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (!modifica) {
    return (
      <Sezione
        id="permessi"
        titolo="Permessi nel gestionale"
        icona={ShieldCheck}
        descrizione={
          membership.customPermissions
            ? `Personalizzati rispetto al preset «${ruoloAccessoLabel(membership.role)}».`
            : `Il preset del ruolo «${ruoloAccessoLabel(membership.role)}».`
        }
        azione={
          canManage && (
            <Button type="button" variant="outline" onClick={inizia}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
            </Button>
          )
        }
      >
        {corpo}
      </Sezione>
    );
  }

  return (
    <form onSubmit={salva}>
      <Sezione id="permessi" titolo="Permessi nel gestionale" icona={ShieldCheck} descrizione="Scegli il ruolo e ritocca le singole voci.">
        <GrigliaCampi colonne={2} className="mb-4">
          <CampoModulo etichetta="Ruolo nel gestionale" htmlFor="ruoloPermessi" nota={preset ? "I permessi coincidono con il preset del ruolo." : "Permessi personalizzati: un cambio di ruolo futuro non li toccherà."}>
            <Select value={role} onValueChange={(v) => cambiaRuolo(v as StaffRole)}>
              <SelectTrigger id="ruoloPermessi">
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
          <div className="flex items-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPermessi(PERMESSI_PREDEFINITI[role])} disabled={preset}>
              Riporta al preset del ruolo
            </Button>
          </div>
        </GrigliaCampi>
        {corpo}
        <PiedeModifica onAnnulla={() => setModifica(false)} salvando={salvando} errore={errore} />
      </Sezione>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Un link da consegnare a mano                                              */
/* -------------------------------------------------------------------------- */

function LinkDaConsegnare({ link }: { link: string }) {
  const [copiato, setCopiato] = useState(false);
  async function copia() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiato(true);
      window.setTimeout(() => setCopiato(false), 2000);
    } catch {
      /* il campo sotto resta selezionabile a mano */
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" aria-label="Link da consegnare" />
      <Button type="button" variant="outline" size="sm" onClick={copia}>
        {copiato ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copiato ? "Copiato" : "Copia"}
      </Button>
    </div>
  );
}
