"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Booking, Guest, Table } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { AzioniStato } from "@/components/bookings/azioni-stato";
import { Button } from "@/components/ui/button";
import { formatTime, initials } from "@/lib/utils";
import { Corpo, Riga, Tabella, Td, Testa, Th } from "@/components/ui/table";
import { cosaSapere } from "@/lib/cosa-sapere";
import { CosaSapere } from "@/components/guests/cosa-sapere";
import {
  Pannello,
  PannelloAzioni,
  PannelloContenuto,
  PannelloCorpo,
  PannelloTesta,
  PannelloTitle,
} from "@/components/ui/pannello";

/** Vedi la nota in `bookings-page-client.tsx`: niente `Decimal` da questa parte. */
type Row = Booking & { guest: Omit<Guest, "totalSpend"> | null; table: Table | null };

export function BookingsTable({
  rows,
  fill = false,
  vuoto,
}: {
  rows: Row[];
  fill?: boolean;
  /**
   * Cosa dire quando non c'è nessuna riga.
   *
   * Serve perché la frase giusta dipende da **perché** è vuoto: «nessuna
   * prenotazione per questa data» è falso se la giornata ne ha tredici e il
   * filtro «in sospeso» ne mostra zero. Un vuoto che dà la colpa alla cosa
   * sbagliata fa cercare nel posto sbagliato.
   */
  vuoto?: React.ReactNode;
}) {
  const router = useRouter();
  /* La riga aperta nel pannello. `null` = nessun pannello. */
  const [aperta, setAperta] = useState<Row | null>(null);


  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        {vuoto ?? "Nessuna prenotazione per questa data."}
      </div>
    );
  }

  return (
    <>
    {/* Sette colonne su 390 px non si leggono. Su telefono restano le quattro
        che servono a riconoscere una prenotazione — ora, chi, quanti, come sta
        — e spariscono tavolo e provenienza, che si guardano da fermi. */}
    <Tabella densita="densa" fill={fill}>
      <Testa>
        <Th densita="densa">Orario</Th>
        <Th densita="densa">Ospite</Th>
        <Th densita="densa">Persone</Th>
        <Th className="hidden md:table-cell">Tavolo</Th>
        <Th className="hidden md:table-cell">Fonte</Th>
        <Th densita="densa">Stato</Th>
        <Th densita="densa" allineamento="right">
          Azioni
        </Th>
      </Testa>
      <Corpo>
          {rows.map((b) => {
            const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
            const isPending = b.status === "PENDING";
            const segnali = cosaSapere({
              allergies: b.guest?.allergies,
              privateNotes: b.guest?.privateNotes,
              preferences: b.guest?.preferences,
              visits: b.guest?.totalVisits,
              noShows: b.guest?.noShowCount,
              loyaltyTier: b.guest?.loyaltyTier,
              occasion: b.occasion,
            });
            return (
              // Una riga in attesa di una decisione era dipinta con
              // `bg-red-50`: un rosso da tema chiaro, che su questo fondo
              // verde diventa una banda quasi bianca col testo illeggibile.
              // Non si vedeva perché la demo non ha quasi mai prenotazioni in
              // sospeso. Adesso è un bordo e un velo dell'accento.
              <Riga key={b.id} daDecidere={isPending}>
                <Td densita="densa" className="font-medium tabular-nums">{formatTime(b.startsAt)}</Td>
                <Td densita="densa">
                  <div className="flex items-center gap-2">
                    <Avatar className="hidden h-7 w-7 sm:flex">
                      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium">{name}</p>
                      {/*
                        Il segnale, nella lista.

                        `cosaSapere` esiste da tempo — allergia, occasione,
                        nota del personale, assenze precedenti, livello, al
                        massimo quattro righe in ordine di urgenza, con la
                        fonte su ognuna — ed era usato nella scheda della
                        prenotazione, in Servizio e in Sala. Non qui, che è la
                        schermata con cui si **prepara** il servizio: per
                        sapere chi ha un'allergia bisognava aprire una
                        prenotazione per volta e tornare indietro.

                        Nessun dato in più da caricare: la riga porta già
                        l'ospite intero e l'occasione di questa prenotazione.

                        E se non c'è niente da sapere non si stampa niente
                        (`CosaSapere` restituisce `null`): una riga senza
                        segnali resta a un livello, così la lista non
                        raddoppia di altezza per le prenotazioni normali.
                      */}
                      <CosaSapere righe={segnali} className="mt-0.5" />
                      {b.guest?.phone && <p className="text-xs text-muted-foreground">{b.guest.phone}</p>}
                    </div>
                  </div>
                </Td>
                <Td densita="densa" className="tabular-nums">{b.partySize}</Td>
                <Td className="hidden text-muted-foreground md:table-cell">{b.table?.label ?? "—"}</Td>
                <Td className="hidden md:table-cell"><SourceBadge source={b.source} /></Td>
                <Td densita="densa"><StatusBadge status={b.status} /></Td>
                <Td densita="densa">
                  <div className="flex items-center justify-end gap-2">
                    <AzioniStato bookingId={b.id} stato={b.status} nome={name} />
                    {/*
                      «Apri» apre un **pannello**, non una pagina.

                      Preparare un servizio è scorrere nove prenotazioni
                      guardando i dettagli: apri, leggi, torna, apri la
                      seconda. Ventisette navigazioni, e ogni ritorno perdeva
                      la posizione nella lista.

                      La rotta resta: `/bookings/[id]` rende ancora una
                      pagina, così un link condiviso funziona e il tasto
                      Indietro fa quello che deve. È la **lista** che apre un
                      pannello invece di navigare.
                    */}
                    <Button variant="ghost" size="sm" className="tocco-comodo" onClick={() => setAperta(b)}>
                      Apri
                    </Button>
                  </div>
                </Td>
              </Riga>
            );
          })}
      </Corpo>
    </Tabella>

    {/* Il pannello di contesto della riga aperta. */}
    <Pannello open={aperta !== null} onOpenChange={(v) => !v && setAperta(null)} modal={false}>
      {aperta && (
        <PannelloContenuto aria-describedby={undefined}>
          <PannelloTesta>
            <PannelloTitle className="text-base font-medium">
              {aperta.guest ? `${aperta.guest.firstName} ${aperta.guest.lastName ?? ""}`.trim() : "Walk-in"}
            </PannelloTitle>
            <p className="t-nota mt-0.5">
              {formatTime(aperta.startsAt)} · {aperta.partySize}{" "}
              {aperta.partySize === 1 ? "persona" : "persone"}
              {aperta.table?.label && ` · ${aperta.table.label}`}
            </p>
          </PannelloTesta>

          <PannelloCorpo>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={aperta.status} />
              <SourceBadge source={aperta.source} />
            </div>

            <CosaSapere
              disposizione="colonna"
              righe={cosaSapere({
                allergies: aperta.guest?.allergies,
                privateNotes: aperta.guest?.privateNotes,
                preferences: aperta.guest?.preferences,
                visits: aperta.guest?.totalVisits,
                noShows: aperta.guest?.noShowCount,
                loyaltyTier: aperta.guest?.loyaltyTier,
                occasion: aperta.occasion,
              })}
            />

            {aperta.guest?.phone && (
              <p className="t-corpo">
                <span className="t-etichetta mr-2">Telefono</span>
                <a href={`tel:${aperta.guest.phone}`} className="underline underline-offset-4">
                  {aperta.guest.phone}
                </a>
              </p>
            )}
            {aperta.notes && (
              <p className="t-corpo">
                <span className="t-etichetta mr-2">Note</span>
                {aperta.notes}
              </p>
            )}
          </PannelloCorpo>

          <PannelloAzioni>
            {/*
              La pagina intera resta raggiungibile: da qui si va a tutto il
              resto — modifica, tavolo, storia. Il pannello risponde a «chi è e
              cosa devo sapere», che è la domanda che si fa scorrendo la lista.
            */}
            <Button asChild variant="accent" size="sm" className="tocco-comodo">
              <Link href={`/bookings/${aperta.id}`}>Apri la scheda</Link>
            </Button>
            {aperta.guest && (
              <Button asChild variant="outline" size="sm" className="tocco-comodo">
                <Link href={`/guests/${aperta.guest.id}`}>Scheda ospite</Link>
              </Button>
            )}
          </PannelloAzioni>
        </PannelloContenuto>
      )}
    </Pannello>
    </>
  );
}
