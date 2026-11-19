export default function PageHeader({ title, description, eyebrow }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-[28px] dark:text-neutral-50">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </div>
  )
}
