import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 animate-fade-in">
      <header className="shrink-0 space-y-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-32" />
      </header>

      <div className="surface relative min-h-0 flex-1 overflow-hidden rounded-xl p-4">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}
