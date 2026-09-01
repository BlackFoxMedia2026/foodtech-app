"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { MessageSquareWarning, Settings, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";

export function ProfileMenu({ user }: { user: { name?: string | null; email?: string | null } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu profilo"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="h-9 w-9 rounded-lg border border-border">
            <AvatarFallback className="rounded-lg bg-foreground text-background">
              {initials(user.name ?? user.email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/reports">
            <MessageSquareWarning className="h-4 w-4" strokeWidth={2} />
            Segnalazione
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" strokeWidth={2} />
            Impostazioni
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/sign-in" })}>
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Esci
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
