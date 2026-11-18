import { LogOut, Menu } from 'lucide-react'

export default function Topbar({
  activePage,
  onOpenMenu,
  user,
  profile,
  onSignOut,
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-neutral-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="icon-button lg:hidden"
          onClick={onOpenMenu}
          aria-label="Buka navigasi"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="hidden items-center gap-2 text-xs text-neutral-400 sm:flex">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-neutral-600">{activePage}</span>
          </div>
          <p className="truncate text-sm font-semibold text-neutral-900 sm:mt-1">
            {activePage}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-40 truncate text-xs font-semibold text-neutral-800">
            {profile?.display_name || user?.email}
          </p>
          <p className="max-w-40 truncate text-[11px] text-neutral-500">
            {user?.email}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-neutral-200 px-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
          onClick={onSignOut}
          aria-label="Keluar dari SmartStock"
          title="Keluar"
        >
          <LogOut size={17} aria-hidden="true" />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </header>
  )
}
