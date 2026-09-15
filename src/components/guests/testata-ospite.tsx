"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  ShieldOff,
} from "lucide-react";
import type { LoyaltyTier } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Etichetta } from "@/components/ui/etichetta";
import { StatoPillola } from "@/components/guests/crm-sezioni";
import { EditGuestDialog } from "@/components/guests/edit-guest-dialog";
import { ErasureDialog } from "@/components/guests/erasure-dialog";
import { LoyaltyPill } from "@/components/guests/loyalty-pill";
import type { StatoCliente } from "@/server/guest-crm";
import { cn, initials } from "@/lib/utils";

interface OspiteTestata {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  birthday: Date | null;
  loyaltyTier: LoyaltyTier;
  allergies: string | null;
  privateNotes: string | null;
  marketingOptIn: boolean;
  preferences: unknown;
  tags: string[];
  anonymizedAt: Date | null;
}

/**
 * La testata della scheda cliente: **una riga sola**.
 *
 * ## Cos'era
 *
 * Nove elementi affiancati con lo stesso peso — nome, due pillole, email,
 * telefono, compleanno, il consenso scritto come frase, un campo di testo per
 * i tag e un pulsante «+» — che andavano a capo in un ordine deciso dalla
 * larghezza della finestra. A destra tre pulsanti identici, dove il terzo è
 * quello che si usa ogni giorno e il secondo cancella una persona per sempre.
 *
 * ## Com'è adesso
 *
 * Una riga alta una sessantina di pixel, chiusa da un filo sotto. Non è una
 * card e non è una fascia: la scheda vera comincia dai quattro numeri sotto,
 * e questa riga serve solo a dire **chi si sta guardando** e a dare il modo
 * di modificarlo. Da sinistra a destra, nell'ordine in cui si legge una
 * persona: la freccia per tornare, la faccia, il nome, che tipo di cliente è,
 * come si contatta, se riceve le comunicazioni, come lo abbiamo etichettato.
 * All'estremo destro, staccate da `ml-auto`, le azioni.
 *
 * Una fascia con fondo e padding — che è quello che c'era qui prima — dava a
 * una riga di anagrafica lo stesso peso visivo delle card di contenuto:
 * quattrocento pixel di altezza spesi per dati che non cambiano mai, sottratti
 * al corpo della scheda, che è la parte che si scorre davvero.
 *
 * ## Le azioni: una sola si vede
 *
 * «Modifica profilo» è la pillola crema — la chiamata principale, per la
 * regola della Chiamata Crema di DESIGN.md. Tutto il resto sta nel menu
 * «•••», sotto l'etichetta «Dati personali», perché esportare e cancellare i
 * dati di una persona sono due facce dello stesso adempimento e nessuna delle
 * due si fa una volta al giorno. «Cancella i dati» è l'ultima voce, in rosso,
 * dopo un separatore, e apre comunque il dialogo di conferma che c'era già.
 */
export function TestataOspite({
  ospite,
  stato,
  canManage,
}: {
  ospite: OspiteTestata;
  stato: StatoCliente;
  canManage: boolean;
}) {
  const [modifica, setModifica] = useState(false);
  const [cancella, setCancella] = useState(false);

  const nome = `${ospite.firstName} ${ospite.lastName ?? ""}`.trim();
  const anonimizzato = ospite.anonymizedAt !== null;

  /*
    `flex-wrap` e non una griglia: i gruppi hanno larghezze molto diverse a
    seconda del cliente — un nome corto e nessun tag, o un nome doppio con
    cinque etichette — e su una riga sola l'unica regola che regge è «stai
    accanto finché ci stai, altrimenti vai a capo intero». I gruppi sono
    quattro e vanno a capo **interi**, mai spezzati a metà.
  */
  return (
    <header className="fissa flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 pb-3">
      {/*
        Il contenuto sta in **un solo figlio elastico**, non sparso nella riga.

        Con i gruppi fratelli diretti dell'header, a 1440 px le azioni non
        entravano più e finivano da sole sulla riga sotto: una pillola crema in
        mezzo al vuoto, che è esattamente il peso che questa testata non deve
        avere. Qui il contenuto è un contenitore con `basis-0`, quindi la sua
        larghezza ipotetica è zero e non spinge mai le azioni a capo; poi
        cresce e si prende quello che avanza, andando a capo **dentro di sé**.
        Sotto `lg` torna a riga piena e le azioni scendono, allineate a destra.
      */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-2 lg:w-auto lg:flex-1 lg:basis-0">
        {/* ------------------------------------------- chi è: faccia e nome */}
        {/*
          Le pillole sono **sorelle** della faccia e del nome, non figlie dello
          stesso blocco rigido. Su 390 px «Regolare» e «Ambassador» sono duecento
          pixel, e stando in linea si prendevano lo spazio del nome, che ha
          `truncate`: il titolo della pagina diventava «Elena…». Come sorelle in
          un contenitore che va a capo scendono loro di una riga, e il nome — che
          è la cosa per cui si è aperta questa pagina — resta intero. Freccia,
          faccia e nome restano invece saldati fra loro: quelli sì che non si
          separano mai.
        */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="-ml-2 h-8 w-8 shrink-0">
              <Link href="/guests" aria-label="Torna al CRM ospiti" title="CRM ospiti">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            <Avatar className="h-10 w-10 shrink-0 border border-border/60">
              <AvatarFallback className="text-xs font-medium text-foreground">{initials(nome)}</AvatarFallback>
            </Avatar>

            <h1 className="truncate text-display text-xl leading-none">{nome}</h1>
          </div>

          <StatoPillola stato={stato} />
          <LoyaltyPill tier={ospite.loyaltyTier} />
        </div>

        {/* --------------------------------- come si contatta, e se lo sentiamo */}
        {/*
          `basis-0` anche qui, e per lo stesso motivo di sopra: senza, a 1280 px
          il gruppo dei contatti non entrava e scendeva **intero** sulla riga
          sotto — due righe per far stare un indirizzo email lungo. Con la base
          a zero il gruppo non va mai a capo: resta in linea e si stringe, e a
          stringersi è l'unica cosa che può permetterselo, cioè l'email, che ha
          `truncate`. Telefono e consenso sono `shrink-0` perché un numero
          troncato a metà non è un numero e «Non riceve le comuni…» non è uno
          stato.
        */}
        <div className="flex min-w-0 flex-1 basis-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {ospite.email && (
            <a
              href={`mailto:${ospite.email}`}
              title={`Scrivi a ${ospite.email}`}
              className="flex min-w-0 items-center gap-1.5 transition-colors duration-150 hover:text-accent-strong"
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
              <span className="truncate">{ospite.email}</span>
            </a>
          )}
          {ospite.phone && (
            <a
              href={`tel:${ospite.phone}`}
              title={`Chiama ${ospite.phone}`}
              className="flex shrink-0 items-center gap-1.5 transition-colors duration-150 hover:text-accent-strong"
            >
              <Phone className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
              <span className="tabular-nums">{ospite.phone}</span>
            </a>
          )}

          {/* Il consenso è un pallino e due parole, non una pillola: in una riga
            alta quaranta pixel ogni bordo in più è rumore. Il colore lo dice il
            pallino, che è la forma che in tutto il prodotto vuol dire «acceso o
            spento adesso». */}
          <span
            title={
              ospite.marketingOptIn
                ? "Ha dato il consenso: entra nelle campagne e nei messaggi automatici."
                : "Senza consenso non riceve campagne né messaggi automatici. Si cambia da «Modifica profilo»."
            }
            className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                ospite.marketingOptIn ? "bg-sage" : "bg-tertiary-foreground",
              )}
            />
            {ospite.marketingOptIn ? "Riceve le comunicazioni" : "Non riceve le comunicazioni"}
          </span>
        </div>

        {/* --------------------------------------------------- segnali */}
        {/*
          Qui restano solo i **segnali**, cioè le due cose che cambiano il
          servizio adesso: un'allergia e l'eventuale cancellazione dei dati. I
          tag scritti dallo staff se ne sono andati nella scheda «Note e
          preferenze», che è dove stanno già le altre cose che il locale
          scrive sul cliente — allergie, preferenze, note. In testata «fedele»
          più «+ Aggiungi tag» erano duecentotrenta pixel, cioè esattamente
          quelli che mancavano perché la riga restasse una riga.
        */}
        {(ospite.allergies || anonimizzato) && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* Un'allergia non è un tag: è un fatto che cambia il servizio
              adesso. Forma quadrata e icona — il linguaggio dei segnali — così
              non si legge come «VIP», che è un'opinione. */}
            {ospite.allergies && (
              <Etichetta linguaggio="segnale" icona={AlertTriangle}>
                {ospite.allergies}
              </Etichetta>
            )}
            {anonimizzato && <Badge tone="neutral">dati cancellati su richiesta</Badge>}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ azioni, a destra */}
      {/* `ml-auto` le tiene all'estremo destro quando la riga sta tutta su una
          linea, e le manda a fondo riga — sempre a destra — quando va a capo. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label={`Altre azioni per ${nome}`}
                title="Altre azioni"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Dati personali</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={`/api/guests/${ospite.id}/export`} download>
                  <Download className="h-4 w-4" aria-hidden="true" /> Esporta i dati
                </a>
              </DropdownMenuItem>
              {!anonimizzato && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCancella(true)} className="text-destructive-soft">
                    <ShieldOff className="h-4 w-4" aria-hidden="true" /> Cancella i dati…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button type="button" variant="accent" onClick={() => setModifica(true)}>
          <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica profilo
        </Button>
      </div>

      <EditGuestDialog
        guest={{
          id: ospite.id,
          firstName: ospite.firstName,
          lastName: ospite.lastName,
          email: ospite.email,
          phone: ospite.phone,
          birthday: ospite.birthday,
          loyaltyTier: ospite.loyaltyTier,
          allergies: ospite.allergies,
          privateNotes: ospite.privateNotes,
          marketingOptIn: ospite.marketingOptIn,
          preferences: ospite.preferences,
        }}
        open={modifica}
        onOpenChange={setModifica}
      />

      {canManage && !anonimizzato && (
        <ErasureDialog guestId={ospite.id} guestName={nome} open={cancella} onOpenChange={setCancella} />
      )}
    </header>
  );
}
