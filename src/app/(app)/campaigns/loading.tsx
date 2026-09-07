import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Le campagne mentre caricano. */
export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40" />
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
