import {
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  Wallet,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'

const overview = [
  {
    label: 'Total Produk',
    detail: 'Menunggu data Supabase',
    icon: Boxes,
  },
  {
    label: 'Total Kategori',
    detail: 'Menunggu data Supabase',
    icon: ClipboardList,
  },
  {
    label: 'Transaksi',
    detail: 'Menunggu data Supabase',
    icon: ChartNoAxesCombined,
  },
  {
    label: 'Pendapatan',
    detail: 'Menunggu data Supabase',
    icon: Wallet,
  },
]

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Ringkasan"
        title="Dashboard"
        description="Pantau persediaan dan aktivitas bisnis dari satu tempat."
      />

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Ringkasan metrik"
      >
        {overview.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Aktivitas penjualan
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Ringkasan transaksi akan muncul setelah tahap integrasi data.
            </p>
          </div>
          <EmptyState
            icon={ChartNoAxesCombined}
            title="Belum ada data untuk ditampilkan"
            description="Dashboard ini belum mengambil atau menampilkan data transaksi."
            compact
          />
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Status workspace
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Kesiapan dasar aplikasi.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 size-2 rounded-full bg-brand-600" />
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  Kerangka dashboard siap
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Halaman utama dan navigasi dasar telah disiapkan.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 size-2 rounded-full bg-neutral-300" />
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  Integrasi data belum dibuat
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Belum ada query maupun data bisnis dari Supabase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
