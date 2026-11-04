export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

/** Card-shaped placeholder that keeps the final layout stable while loading. */
export function CardSkeleton({ className = "", title }: { className?: string; title?: string }) {
  return (
    <section className={`card p-6 sm:p-7 ${className}`} aria-busy="true" aria-label={title}>
      {title ? <h2 className="font-semibold tracking-tight">{title}</h2> : <Skeleton className="h-5 w-40" />}
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-6 h-[calc(100%-4.5rem)] min-h-24 w-full" />
    </section>
  );
}
