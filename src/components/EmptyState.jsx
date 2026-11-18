export default function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 text-center ${
        compact ? 'min-h-48 py-8' : 'min-h-64 py-12'
      }`}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-neutral-800">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-neutral-500">
        {description}
      </p>
    </div>
  )
}
