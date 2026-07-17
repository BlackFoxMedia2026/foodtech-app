import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-24" />
      </header>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
