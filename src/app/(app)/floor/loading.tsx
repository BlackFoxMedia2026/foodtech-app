import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-32" />
      </header>

      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent><Skeleton className="h-[480px] w-full" /></CardContent>
      </Card>
    </div>
  );
}
