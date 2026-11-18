import { Menu } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabase.js'

export default function Topbar({ activePage, onOpenMenu }) {
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

      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
          isSupabaseConfigured
            ? 'border-neutral-200 bg-neutral-50 text-neutral-700'
            : 'border-brand-100 bg-brand-50 text-brand-700'
        }`}
        role="status"
      >
        <span
          className={`size-1.5 rounded-full ${
            isSupabaseConfigured ? 'bg-neutral-500' : 'bg-brand-600'
          }`}
        />
        <span className="hidden sm:inline">
          {isSupabaseConfigured
            ? 'Konfigurasi Supabase tersedia'
            : 'Supabase belum dikonfigurasi'}
        </span>
        <span className="sm:hidden">
          {isSupabaseConfigured ? 'Konfigurasi ada' : 'Belum dikonfigurasi'}
        </span>
      </div>
    </header>
  )
}
