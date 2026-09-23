"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Booking, Guest, Table } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, SourceBadge, etichettaFonte } from "@/components/bookings/status-badge";
import { ApprovaPrenotazione, SelettoreStato } from "@/components/bookings/selettore-stato";
import { Button } from "@/components/ui/button";
import { cn, formatTime, initials } from "@/lib/utils";
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

/**
 * Un gradino di respiro in più della densità `densa`.
 *
 * La tabella resta compatta — un sabato sera sono quaranta righe e quante ne
 * stanno in uno schermo è la cosa che conta — ma a 10 px di aria verticale le
 * righe si toccavano, e con il nome dell'ospite cresciuto a 16 px la riga
 * sembrava piena prima di esserlo. Quattordici pixel (sedici da `md`) sono il
 * minimo perché due misure di testo convivano senza sovrapporsi: è la stessa
 * ragione per cui esiste la densità `ariosa`, applicata qui con un passo più
 * corto perché qui si scorre, non si consulta.
 */
const CELLA = "py-3 md:py-3.5";

export function BookingsTable({
  rows,
  fill = false,
  canManage = true,
  vuoto,
}: {
  rows: Row[];
  fill?: boolean;
  /** Chi non può scrivere legge lo stato, non lo cambia. */
  canManage?: boolean;
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
          — e spariscono tavolo e provenienza, che si guardano da fermi.

          Le proporzioni: l'ospite prende tutto quello che avanza, perché è
          l'unica colonna con più di un dato dentro; ora, persone, tavolo e
          azioni hanno larghezze fisse e strette; lo stato ha lo spazio che
          serve al selettore, che ora è un comando e non un'etichetta. */}
      <Tabella densita="densa" fill={fill} minWidth="md:min-w-[760px]">
        <Testa>
          <Th densita="densa" className="md:w-[8%]">Orario</Th>
          <Th densita="densa" className="md:w-[36%]">Ospite</Th>
          <Th densita="densa" className="hidden md:table-cell md:w-[8%]">Persone</Th>
          <Th className="hidden md:table-cell md:w-[9%]">Tavolo</Th>
          <Th className="hidden md:table-cell md:w-[11%]">Fonte</Th>
          <Th densita="densa" className="px-1 md:w-[18%] md:px-4">Stato</Th>
          <Th densita="densa" allineamento="right" className="px-1 md:w-[10%] md:px-4">
            <span className="sr-only sm:not-sr-only">Azioni</span>
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
              // Una riga in attesa di una decisione porta un bordo e un velo
              // dell'accento: il colore qui significa «serve una tua risposta».
              <Riga key={b.id} daDecidere={isPending}>
                {/*
                  L'ora è il primo appiglio di ogni riga: si scorre la colonna
                  per trovare «le venti e trenta», non si legge la riga per
                  trovare l'ora. Quindi è il testo più pesante della riga, in
                  cifre tabellari perché si incolonnino.
                */}
                <Td densita="densa" className={cn(CELLA, "text-base font-semibold tabular-nums")}>
                  {formatTime(b.startsAt)}
                </Td>

                <Td densita="densa" className={CELLA}>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="hidden h-9 w-9 shrink-0 sm:flex">
                      <AvatarFallback className="text-[11px]">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      {/*
                        Tre livelli, non tre microtesti uguali.

                        Il nome è il secondo appiglio della riga e sta a 16 px:
                        prima era 14, cioè la stessa misura del telefono scritto
                        sotto, e una colonna dove tutto pesa uguale non ha un
                        punto da cui iniziare a leggere.

                        Sotto, i segnali di `cosaSapere` — allergia, occasione,
                        nota del personale, assenze precedenti — che portano il
                        loro tono (l'attenzione si legge in accento). Il
                        telefono va per ultimo, nel grigio più tenue: serve solo
                        a chi sta già chiamando quella persona.
                      */}
                      {/* Il nome non si taglia: è l'identità della riga
                          (DESIGN.md, «La Regola di Ciò che Non si Taglia»).
                          Se non ci sta, va a capo. */}
                      <p className="t-titolo-scheda break-words">{name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/*
                          Su 390 px sette colonne non ci stanno, e «Persone» è
                          la prima che se ne va: la sua intestazione da sola
                          prende ottanta pixel, cioè metà del nome dell'ospite.
                          Il numero però serve — quanti sono è una delle quattro
                          cose che si guardano in sala — quindi non sparisce:
                          scende qui, accanto al nome, in peso pieno perché non
                          è un dettaglio come gli altri di questa riga.
                        */}
                        <span className="text-xs font-medium tabular-nums md:hidden">
                          {b.partySize} {b.partySize === 1 ? "persona" : "persone"}
                        </span>
                        <CosaSapere righe={segnali} contatoreSottoMd />
                        {b.guest?.phone && <span className="t-nota tabular-nums">{b.guest.phone}</span>}
                      </div>
                    </div>
                  </div>
                </Td>

                <Td densita="densa" className={cn(CELLA, "hidden text-base font-medium tabular-nums md:table-cell")}>
                  {b.partySize}
                </Td>

                {/* Il tavolo era in grigio tenue come una nota a margine: è il
                    posto dove va seduta una persona, e durante il servizio si
                    cerca con l'occhio quanto l'ora. */}
                <Td className={cn(CELLA, "hidden md:table-cell")}>
                  {b.table?.label ? (
                    <span className="text-[0.9375rem] font-medium">{b.table.label}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </Td>

                {/* La provenienza senza pillola: su quaranta righe erano
                    quaranta pastiglie in fila per il dato che cambia meno di
                    tutti quello che si fa. Resta, e smette di chiamare. */}
                <Td className={cn(CELLA, "hidden md:table-cell")}>
                  <span className="text-sm text-muted-foreground">{etichettaFonte(b.source)}</span>
                </Td>

                {/*
                  Lo stato **è** il comando: si preme la pillola e si sceglie.
                  Prima bisognava trovare i tre puntini nella colonna accanto.

                  Su una riga in attesa resta un «Approva» a un clic — è il
                  gesto singolo più frequente della pagina — mentre «Rifiuta» è
                  finito dentro il menu, dove si chiama «Cancellata».
                */}
                <Td densita="densa" className={cn(CELLA, "px-1 md:px-4")}>
                  <div className="flex items-center gap-1.5">
                    <SelettoreStato bookingId={b.id} stato={b.status} nome={name} modificabile={canManage} />
                    {isPending && canManage && <ApprovaPrenotazione bookingId={b.id} nome={name} />}
                  </div>
                </Td>

                <Td densita="densa" className={cn(CELLA, "px-1 md:px-4")}>
                  <div className="flex items-center justify-end">
                    {/*
                      «Apri» apre un **pannello**, non una pagina.

                      Preparare un servizio è scorrere nove prenotazioni
                      guardando i dettagli: apri, leggi, torna, apri la
                      seconda. Ventisette navigazioni, e ogni ritorno perdeva
                      la posizione nella lista.

                      La rotta resta: `/bookings/[id]` rende ancora una
                      pagina, così un link condiviso funziona e il tasto
                      Indietro fa quello che deve. È la **lista** che apre un
                      pannello invece di navigare. La freccia lo dice: si va
                      avanti, non si apre un menu.
                    */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="tocco-comodo gap-1.5 px-2 text-sm sm:px-3"
                      onClick={() => setAperta(b)}
                      aria-label={`Apri la prenotazione di ${name}`}
                    >
                      {/* Sotto `sm` resta la sola freccia: la parola costa
                          quaranta pixel che servono al nome. L'etichetta
                          accessibile la dice comunque per intero. */}
                      <span className="hidden sm:inline">Apri</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
