import {
  ChartNoAxesCombined,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  X,
} from 'lucide-react'

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Produk', icon: Package },
  { label: 'Kategori', icon: Tags },
  { label: 'Transaksi', icon: ShoppingCart },
  { label: 'Laporan', icon: ChartNoAxesCombined },
]

export default function Sidebar({
  activePage,
  onNavigate,
  isOpen,
  onClose,
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-neutral-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Navigasi utama"
    >
      <div className="flex h-[76px] items-center justify-between border-b border-neutral-100 px-6">
        <button
          type="button"
          className="flex items-center gap-3 text-left"
          onClick={() => onNavigate('Dashboard')}
          aria-label="SmartStock, buka dashboard"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold tracking-tight text-white shadow-sm shadow-brand-600/20">
            SS
          </span>
          <span>
            <span className="block text-[15px] font-bold tracking-tight text-neutral-950">
              SmartStock
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-neutral-500">
              INVENTORY WORKSPACE
            </span>
          </span>
        </button>
        <button
          type="button"
          className="icon-button lg:hidden"
          onClick={onClose}
          aria-label="Tutup navigasi"
        >
          <X size={19} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-6">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
          Menu utama
        </p>
        {navigation.map(({ label, icon: Icon }) => {
          const isActive = activePage === label

          return (
            <button
              key={label}
              type="button"
              onClick={() => onNavigate(label)}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950'
              }`}
            >
              <Icon
                size={18}
                strokeWidth={isActive ? 2.2 : 1.8}
                className={
                  isActive
                    ? 'text-brand-600'
                    : 'text-neutral-400 group-hover:text-neutral-700'
                }
              />
              <span>{label}</span>
              {isActive && (
                <span className="ml-auto h-5 w-0.5 rounded-full bg-brand-600" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-neutral-100 p-4">
        <button
          type="button"
          onClick={() => onNavigate('Pengaturan')}
          aria-current={activePage === 'Pengaturan' ? 'page' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            activePage === 'Pengaturan'
              ? 'bg-brand-50 text-brand-700'
              : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950'
          }`}
        >
          <Settings size={18} />
          <span>Pengaturan</span>
        </button>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
          <p className="text-xs font-semibold text-neutral-800">
            SmartStock V2 · Tahap 1
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Kerangka aplikasi dan navigasi dasar.
          </p>
        </div>
      </div>
    </aside>
  )
}
