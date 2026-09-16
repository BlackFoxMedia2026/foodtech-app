"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, HelpCircle, Power, QrCode, Router } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { salvaPortaleWifi, type PortaleWifiPayload } from "@/lib/wifi-portale-api";
import { formatDate } from "@/lib/utils";
import { GuidaRouter } from "./guida-router";

/**
 * I comandi del pannello: quelli che cambiano **una cosa sola**.
 *
 * Stanno separati dalla procedura guidata perché sono un altro gesto: la
 * procedura si apre quando si vuole rivedere la configurazione, questi si
 * usano al volo — sospendere il portale per una sera, spuntare il router
 * dopo averlo collegato, alzare lo sconto.
 *
 * Ognuno manda **solo il proprio campo** (vedi `setPortale`: ciò che non
 * arriva non si tocca). Un interruttore che per cambiare sé stesso rispedisce
 * anche la password è un modo per perderla.
 */

function useSalvataggio() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(payload: PortaleWifiPayload) {
    setInCorso(true);
    setErrore(null);
    try {
      await salvaPortaleWifi(payload);
      router.refresh();
      return true;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non siamo riusciti a salvare. Riprova.");
      return false;
    } finally {
      setInCorso(false);
    }
  }

  return { salva, inCorso, errore };
}

/* -------------------------------------------------------------------------- */
/*  Come i clienti ci arrivano                                                */
/* -------------------------------------------------------------------------- */

/**
 * Le **due strade** per arrivare al portale, e il QR viene prima.
 *
 * ## Cos'era
 *
 * Era una carta intitolata «Ultimo passaggio: il router» con dentro quattro
 * cose: due righe di stato, tre passi numerati, due pulsanti e tre righe di
 * nota. Cinque blocchi per rispondere a una domanda sola — *come fa un cliente
 * ad arrivare su questa pagina?* — e la risposta che dava per prima era quella
 * che un ristoratore **non può fare da solo**: entrare nel pannello del
 * router. Chiamandola «ultimo passaggio» diceva anche una cosa falsa: che
 * senza, il portale non è finito.
 *
 * ## Cos'è adesso
 *
 * Due righe, una per strada, ognuna con **una frase e un'azione**:
 *
 * - **un QR sul tavolo** — funziona con qualunque apparato, si stampa oggi;
 * - **dal router** — si apre da solo, *se* quel router lo sa fare.
 *
 * L'ordine è quello: il QR è la strada che funziona sempre, e metterla per
 * seconda significava mandare tutti nel pannello del router per scoprire —
 * dopo venti minuti — che quella voce sul loro apparato non esiste.
 *
 * ## La riga che non si sposta
 *
 * Dal router non arriva **nessun segnale**: non possiamo sapere se il portale
 * sia davvero la sua pagina di accesso, e non facciamo finta. Resta detto, ma
 * in una riga invece che in tre, e attaccato alla strada a cui appartiene: la
 * spunta la mette il locale, con la sua data, e si può togliere.
 *
 * I tre passi numerati e le istruzioni per marca stanno in `GuidaRouter`,
 * dietro «Come si fa»: ripeterli qui fuori voleva dire scriverli due volte
 * nella stessa schermata.
 */
export function ArrivoAlPortale({
  portaleUrl,
  collegatoIl,
  canManage,
}: {
  portaleUrl: string;
  collegatoIl: Date | null;
  canManage: boolean;
}) {
  const { salva, inCorso, errore } = useSalvataggio();
  const collegato = collegatoIl != null;

  return (
    <section className="riquadro comodo space-y-4">
      <h2 className="t-titolo-scheda">Come i clienti arrivano al portale</h2>

      {/* La strada che funziona sempre. */}
      {/* Su telefono l'azione scende sotto: accanto al titolo lascerebbe al
          testo una colonna da 200 px, cioè sei righe per due frasi. */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent-strong"
            aria-hidden="true"
          >
            <QrCode className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Un QR sul tavolo</p>
            <p className="t-nota max-w-md">
              Lo inquadrano e il portale si apre. Funziona con qualsiasi router, e si stampa oggi.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/marketing/qr-codes/nuovo?tipo=CUSTOM">Crea il QR</Link>
        </Button>
      </div>

      {/* La strada che dipende dall'apparato. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
            aria-hidden="true"
          >
            <Router className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Dal router, da solo</p>
            <p className="t-nota max-w-md">
              Si apre appena qualcuno si attacca alla rete ospiti, se il tuo apparato sa mostrare una pagina di
              accesso.
            </p>
            {/* Una riga, non tre: cosa sappiamo (niente) e chi lo dichiara. */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-nota">
              {collegato ? (
                <span className="flex items-center gap-1.5 text-sage-strong">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> collegato, dichiarato da te il{" "}
                  {formatDate(collegatoIl!)}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-accent-strong">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> da verificare: il router non ci
                  manda nessun segnale
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  disabled={inCorso}
                  onClick={() => salva({ routerCollegato: !collegato })}
                  className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                >
                  {collegato ? "non è più collegato" : "l'ho collegato"}
                </button>
              )}
            </p>
          </div>
        </div>
        <GuidaRouter portaleUrl={portaleUrl} etichetta="Come si fa" className="self-start sm:self-auto" />
      </div>

      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Accendere e spegnere                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sospendere il portale **senza disfare la configurazione**.
 *
 * Prima l'unico modo di chiuderlo era cancellare il nome della rete: chi
 * voleva spegnerlo per una settimana doveva buttare via la configurazione e
 * riscriverla dopo. Qui si spegne e si riaccende, e quello che c'è scritto
 * resta dov'è.
 */
export function InterruttorePortale({ attivo, canManage }: { attivo: boolean; canManage: boolean }) {
  const { salva, inCorso, errore } = useSalvataggio();
  if (!canManage) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Power className="h-4 w-4" aria-hidden="true" /> Portale {attivo ? "acceso" : "sospeso"}
          </p>
          <p className="t-nota max-w-xl">
            {attivo
              ? "Da spento la pagina pubblica smette di esistere e nessuno può lasciare contatti. La configurazione resta."
              : "La configurazione c'è tutta: riaccendendolo la pagina pubblica torna online subito."}
          </p>
        </div>
        <Switch
          checked={attivo}
          disabled={inCorso}
          onCheckedChange={(v) => salva({ attivo: v })}
          aria-label="Portale Wi-Fi acceso"
        />
      </div>
      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le impostazioni avanzate                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Quello che non entra nei quattro passi, e che però esiste da prima: dove
 * mandare la persona dopo, e lo sconto automatico.
 *
 * Non sono state tolte — sono state **spostate sotto**, dove le trova chi le
 * cerca. In cima alla configurazione erano due domande in più fatte a chi
 * stava ancora decidendo il nome della rete.
 */
export function AvanzateWifi({
  iniziale,
  attivo,
  canManage,
}: {
  iniziale: {
    redirectUrl: string;
    couponEnabled: boolean;
    couponPercent: number;
    couponDays: number;
  };
  attivo: boolean;
  canManage: boolean;
}) {
  const { salva, inCorso, errore } = useSalvataggio();
  const [redirectUrl, setRedirectUrl] = useState(iniziale.redirectUrl);
  const [couponEnabled, setCouponEnabled] = useState(iniziale.couponEnabled);
  const [couponPercent, setCouponPercent] = useState(String(iniziale.couponPercent));
  const [couponDays, setCouponDays] = useState(String(iniziale.couponDays));
  const [salvato, setSalvato] = useState(false);

  async function applica() {
    setSalvato(false);
    const ok = await salva({
      redirectUrl: redirectUrl.trim() || null,
      couponEnabled,
      couponPercent: Number(couponPercent) || 10,
      couponDays: Number(couponDays) || 30,
    });
    setSalvato(ok);
  }

  return (
    <details className="riquadro comodo group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="t-titolo-scheda">Impostazioni avanzate</span>
        <span className="t-nota transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>

      <div className="mt-4 space-y-5">
        <InterruttorePortale attivo={attivo} canManage={canManage} />

        <div className="space-y-1.5 border-t border-border pt-4">
          <Label htmlFor="w-redirect">Dove mandarlo dopo</Label>
          <Input
            id="w-redirect"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            placeholder="https://… (facoltativo)"
            disabled={!canManage}
          />
          <p className="t-nota">
            Il tuo sito, la carta, o l&apos;indirizzo con cui il tuo router sblocca la navigazione. Compare come
            «Continua» dopo la password.
          </p>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Uno sconto per chi si collega</p>
              <p className="t-nota max-w-xl">
                Un codice personale, valido una volta sola, per far tornare chi è passato una volta.
              </p>
            </div>
            <Switch
              checked={couponEnabled}
              onCheckedChange={setCouponEnabled}
              disabled={!canManage}
              aria-label="Regala uno sconto a chi si collega"
            />
          </div>

          {couponEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-perc">Percentuale di sconto</Label>
                <Input
                  id="w-perc"
                  inputMode="numeric"
                  value={couponPercent}
                  onChange={(e) => setCouponPercent(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-24"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-giorni">Valido per (giorni)</Label>
                <Input
                  id="w-giorni"
                  inputMode="numeric"
                  value={couponDays}
                  onChange={(e) => setCouponDays(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-24"
                  disabled={!canManage}
                />
              </div>
            </div>
          )}

          <p className="t-nota">
            Il codice è <strong>intestato alla persona</strong> e vale una volta: un codice condiviso si gira
            agli amici e diventa uno sconto che non hai deciso tu. I codici e il loro utilizzo si vedono in{" "}
            <Link href="/marketing/coupons" className="underline">
              Coupon
            </Link>
            .
          </p>
        </div>

        {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
        {salvato && !errore && <p className="text-sm text-sage-strong">Salvato.</p>}

        {canManage && (
          <Button type="button" variant="accent" size="sm" onClick={applica} disabled={inCorso}>
            {inCorso ? "Salvo…" : "Salva le avanzate"}
          </Button>
        )}
      </div>
    </details>
  );
}
