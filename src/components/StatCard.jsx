export default function StatCard({ label, icon: Icon, value, detail }) {
  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
          <p className="mt-3 break-words text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {value}
          </p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
          <Icon size={19} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">{detail}</p>
    </article>
  )
}
