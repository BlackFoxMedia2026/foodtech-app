"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookingForm } from "./booking-form";

export function NewBookingButton({
  tables,
  className,
  servizio,
}: {
  tables: { id: string; label: string; seats: number }[];
  /** Il servizio che la pagina sta guardando: il modulo apre quello. */
  servizio?: string;
  /** L'altezza la detta la barra che lo contiene, non il pulsante. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" className={className}>
          <Plus className="h-4 w-4" /> Nuova prenotazione
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nuova prenotazione</DialogTitle>
        </DialogHeader>
        <BookingForm tables={tables} servizio={servizio} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
