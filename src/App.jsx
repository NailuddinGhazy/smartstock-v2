import { useState } from 'react'
import {
  AlertCircle,
  ChartNoAxesCombined,
  LoaderCircle,
  RefreshCw,
  Settings,
  ShoppingCart,
} from 'lucide-react'
import EmptyState from './components/EmptyState.jsx'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import { useAuth } from './lib/AuthContext.jsx'
import CategoriesPage from './pages/CategoriesPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import PosTransactionPage from './pages/PosTransactionPage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import StockAdjustmentPage from './pages/StockAdjustmentPage.jsx'

const pages = {
  Dashboard: <DashboardPage />,
  Produk: <ProductsPage />,
  Kategori: <CategoriesPage />,
  'Penyesuaian Stok': <StockAdjustmentPage />,
  Transaksi: <PosTransactionPage />,
  Laporan: <ReportsPage />,
  Pengaturan: <SettingsPage />,
}

function LoadingScreen({ message }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-neutral-50 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <LoaderCircle size={23} className="animate-spin" />
        </span>
        <p className="mt-4 text-sm font-medium text-neutral-700">{message}</p>
      </div>
    </main>
  )
}

function AuthIssueScreen({
  title,
  message,
  error,
  onRetry,
  onSignOut,
  retryLabel,
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-950/[0.04] sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertCircle size={21} />
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-neutral-950">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{message}</p>
        {error && (
          <p
            className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            onClick={onRetry}
          >
            <RefreshCw size={16} />
            {retryLabel}
          </button>
          {onSignOut && (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              onClick={onSignOut}
            >
              Keluar
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const auth = useAuth()
  const [activePage, setActivePage] = useState('Dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (
    auth.status === 'loading' ||
    auth.status === 'checking-profile' ||
    auth.status === 'signing-out'
  ) {
    return (
      <LoadingScreen
        message={
          auth.status === 'signing-out'
            ? 'Mengakhiri sesi...'
            : 'Memeriksa sesi dan akses akun...'
        }
      />
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'configuration-error') {
    return <LoginPage />
  }

  if (auth.status === 'access-denied') {
    return (
      <AuthIssueScreen
        title="Akses belum tersedia"
        message={auth.notice}
        error={auth.error}
        retryLabel="Keluar dari sesi"
        onRetry={() => void auth.signOut({ preserveNotice: true })}
      />
    )
  }

  if (auth.status === 'profile-error') {
    return (
      <AuthIssueScreen
        title="Akses belum dapat diverifikasi"
        message="Koneksi atau layanan profil sedang bermasalah. Aplikasi tetap terkunci sampai status profil berhasil diperiksa."
        error={auth.error}
        retryLabel="Coba periksa lagi"
        onRetry={auth.retryProfileCheck}
        onSignOut={() => void auth.signOut()}
      />
    )
  }

  if (auth.status === 'session-error') {
    return (
      <AuthIssueScreen
        title="Sesi belum dapat diperiksa"
        message="Status login belum dapat dipastikan. Periksa koneksi, lalu coba lagi."
        error={auth.error}
        retryLabel="Coba lagi"
        onRetry={auth.retrySessionCheck}
        onSignOut={() => void auth.signOut()}
      />
    )
  }

  if (auth.status !== 'authenticated') {
    return (
      <LoadingScreen message="Menyiapkan aplikasi dengan aman..." />
    )
  }

  function navigateTo(page) {
    setActivePage(page)
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 transition-colors duration-200 dark:bg-neutral-950 dark:text-neutral-100">
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
          user={auth.user}
          profile={auth.profile}
          onSignOut={() => void auth.signOut()}
        />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          {auth.error && (
            <div
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {auth.error}
            </div>
          )}
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
