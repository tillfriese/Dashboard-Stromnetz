import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shown while the "Aktuell" page renders on the server (same card layout, no layout jump). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10" aria-busy="true" aria-label="Seite wird geladen">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="mt-3 h-10 w-80" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <CardSkeleton className="min-h-[640px]" />
        <div className="grid content-start gap-5">
          <div className="grid grid-cols-2 gap-5">
            <CardSkeleton className="min-h-36" />
            <CardSkeleton className="min-h-36" />
          </div>
          <CardSkeleton className="min-h-48" />
          <CardSkeleton className="min-h-80" />
        </div>
      </div>
    </main>
  );
}
