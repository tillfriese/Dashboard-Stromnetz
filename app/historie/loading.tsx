import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[300px_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Seite wird geladen"
    >
      <CardSkeleton className="hidden min-h-[720px] lg:block" />
      <div className="min-w-0 space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} className="min-h-36" />
          ))}
        </div>
        <CardSkeleton className="min-h-[480px]" />
      </div>
    </main>
  );
}
