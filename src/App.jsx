import { useState } from 'react'
import {
  ChartNoAxesCombined,
  Package,
  Settings,
  ShoppingCart,
  Tags,
} from 'lucide-react'
import EmptyState from './components/EmptyState.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

const pages = {
  Dashboard: <DashboardPage />,
  Produk: (
    <PlaceholderPage
      title="Produk"
      description="Kelola katalog barang dan pantau informasi persediaan."
      icon={Package}
      emptyTitle="Kerangka halaman produk"
    />
  ),
  Kategori: (
    <PlaceholderPage
      title="Kategori"
      description="Atur pengelompokan produk agar katalog tetap tertata."
      icon={Tags}
      emptyTitle="Kerangka halaman kategori"
    />
  ),
  Transaksi: (
    <PlaceholderPage
      title="Transaksi"
      description="Lihat aktivitas penjualan dan detail transaksi."
      icon={ShoppingCart}
      emptyTitle="Kerangka halaman transaksi"
    />
  ),
  Laporan: (
    <PlaceholderPage
      title="Laporan"
      description="Tinjau ringkasan penjualan berdasarkan periode."
      icon={ChartNoAxesCombined}
      emptyTitle="Kerangka halaman laporan"
    />
  ),
  Pengaturan: <SettingsPage />,
}

export default function App() {
  const [activePage, setActivePage] = useState('Dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  function navigateTo(page) {
    setActivePage(page)
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-neutral-950/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Tutup navigasi"
        />
      )}
      <Sidebar
        activePage={activePage}
        onNavigate={navigateTo}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
      <div className="min-h-screen lg:pl-[272px]">
        <Topbar
          activePage={activePage}
          onOpenMenu={() => setMobileMenuOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          {pages[activePage] ?? (
            <EmptyState
              icon={Settings}
              title="Halaman tidak ditemukan"
              description="Pilih halaman dari navigasi utama."
            />
          )}
        </main>
      </div>
    </div>
  )
}
