import type { StaffCapability, StaffPrimaryRole } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, initials } from "@/lib/utils";
import { AssignServiceDialog } from "./assign-service-dialog";
import { WaiterProfileDialog } from "./waiter-profile-dialog";
import { WaiterStatusToggle } from "./waiter-status-toggle";

type Mode = "ROOMS" | "TABLES";
type Status = "ACTIVE" | "RESTING";

export function WaiterRow({
  waiter,
  assignmentSummary,
  mode,
  rooms,
  tables,
  serviceOptions,
}: {
  waiter: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    birthday: Date;
    role: string;
    primaryRole: StaffPrimaryRole | null;
    capabilities: StaffCapability[];
    status: Status;
    photoUrl: string | null;
  };
  assignmentSummary: string | null;
  mode: Mode;
  rooms: { id: string; name: string }[];
  tables: { id: string; label: string; seats: number }[];
  serviceOptions: string[];
}) {
  const isResting = waiter.status === "RESTING";
  const fullName = `${waiter.firstName} ${waiter.lastName}`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors",
        isResting ? "bg-black/20" : "bg-white/[0.04]",
      )}
    >
      <WaiterProfileDialog waiter={waiter}>
        <button type="button" className="flex items-center gap-3 rounded-sm text-left hover:opacity-80">
          <Avatar>
            {waiter.photoUrl && <AvatarImage src={waiter.photoUrl} alt={fullName} />}
            <AvatarFallback>{initials(fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-card-foreground underline-offset-2 hover:underline">{fullName}</p>
            <p className="text-xs text-muted-foreground">{waiter.role}</p>
          </div>
        </button>
      </WaiterProfileDialog>
      <div className="flex items-center gap-2">
        {isResting && <Badge tone="neutral">A riposo</Badge>}
        <WaiterStatusToggle waiterId={waiter.id} status={waiter.status} />
        <AssignServiceDialog
          waiter={waiter}
          mode={mode}
          rooms={rooms}
          tables={tables}
          serviceOptions={serviceOptions}
          triggerLabel={assignmentSummary ? "Modifica assegnazione" : "Assegna servizio"}
          disabled={isResting}
        />
      </div>
    </div>
  );
}
