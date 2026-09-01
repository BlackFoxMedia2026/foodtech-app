"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "ACTIVE" | "RESTING";

export function WaiterStatusToggle({ waiterId, status }: { waiterId: string; status: Status }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isResting = status === "RESTING";

  async function toggle() {
    setSubmitting(true);
    const res = await fetch(`/api/waiters/${waiterId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: isResting ? "ACTIVE" : "RESTING" }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} disabled={submitting}>
      {isResting ? (
        <>
          <Sun className="h-4 w-4" /> Rimetti in servizio
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" /> Metti a riposo
        </>
      )}
    </Button>
  );
}
