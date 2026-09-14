"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookingForm } from "./booking-form";

export function NewBookingButton({
  tables,
  className,
}: {
  tables: { id: string; label: string; seats: number }[];
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova prenotazione</DialogTitle>
        </DialogHeader>
        <BookingForm tables={tables} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
