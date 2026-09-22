export default function KitCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 rounded-2xl border border-ink/10 bg-surface p-5 sm:p-6">
      <div className="h-3 w-24 rounded-full bg-ink/[0.04]" />
      <div className="h-6 w-full rounded-lg bg-ink/[0.04]" />
      <div className="h-6 w-2/3 rounded-lg bg-ink/[0.04]" />
      <div className="mt-2 flex gap-2">
        <div className="h-6 w-24 rounded-full bg-ink/[0.04]" />
        <div className="h-6 w-32 rounded-full bg-ink/[0.04]" />
      </div>
    </div>
  );
}

export function KitCardSkeletonGrid({ count = 3 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <KitCardSkeleton key={index} />
      ))}
      <span className="sr-only">Loading your kits</span>
    </div>
  );
}
