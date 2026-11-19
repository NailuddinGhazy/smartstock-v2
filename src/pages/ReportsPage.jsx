import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  LoaderCircle,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  User,
  Wallet,
  X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE = 20
const JAKARTA_TIME_ZONE = 'Asia/Jakarta'

const countFormatter = new Intl.NumberFormat('id-ID')
const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: JAKARTA_TIME_ZONE,
})

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: JAKARTA_TIME_ZONE,
})

function parseAmountToCents(value, fieldName = 'angka') {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) {
    throw new Error(`Nilai ${fieldName} tidak valid.`)
  }
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return whole * 100n + fraction
}

function formatCentsToCurrency(cents) {
  const whole = Number(cents / 100n)
  const remainder = Number(cents % 100n)
  const formattedWhole = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole)

  if (remainder === 0) {
    return formattedWhole
  }
  return `${formattedWhole},${remainder.toString().padStart(2, '0')}`
}

function getJakartaBoundary(dateStr, includeNextDay = false) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const offsetDay = includeNextDay ? 1 : 0
  return new Date(
    Date.UTC(year, month - 1, day + offsetDay, -7),
  ).toISOString()
}

function getDefaultDateRange(period) {
  const now = new Date()
  const toJakartaDate = (d) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: JAKARTA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }

  const todayStr = toJakartaDate(now)

  if (period === 'today') {
    return { from: todayStr, to: todayStr }
  }

  if (period === '7days') {
    const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    return { from: toJakartaDate(past), to: todayStr }
  }

  if (period === '30days') {
    const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    return { from: toJakartaDate(past), to: todayStr }
  }

  if (period === 'thisMonth') {
    const yearMonth = todayStr.slice(0, 7)
    return { from: `${yearMonth}-01`, to: todayStr }
  }

  return { from: todayStr, to: todayStr }
}

export default function ReportsPage() {
  const [periodPreset, setPeriodPreset] = useState('7days')
  const [customMode, setCustomMode] = useState('single') // 'single' | 'range'
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange('7days').from)
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange('7days').to)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Report Data
  const [transactions, setTransactions] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)

  // Aggregated Report Metrics
  const [summary, setSummary] = useState({
    totalRevenueCents: 0n,
    transactionCount: 0n,
    totalItemsSold: 0n,
    averageBasketCents: 0n,
    topProducts: [],
  })

  // Selected Transaction for Detail Modal
  const [selectedTx, setSelectedTx] = useState(null)
  const [txDetails, setTxDetails] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const isDateInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  // Handle Preset Changes
  function applyPreset(preset) {
    setPeriodPreset(preset)
    if (preset !== 'custom') {
      const range = getDefaultDateRange(preset)
      setDateFrom(range.from)
      setDateTo(range.to)
      setPage(0)
    }
  }

  // Handle Single Date Selection (1 kali isi tanggal otomatis untuk dari & sampai)
  function handleSingleDateChange(selectedDate) {
    setDateFrom(selectedDate)
    setDateTo(selectedDate)
    setPeriodPreset('custom')
    setPage(0)
  }

  // Load Transactions & Item Aggregates for the Selected Date Range
  const fetchReportData = useCallback(async () => {
    if (!supabase) {
      setError('Supabase belum dikonfigurasi.')
      setLoading(false)
      return
    }

    if (isDateInvalid) {
      setError('Rentang tanggal tidak valid. Tanggal awal tidak boleh melebihi tanggal akhir.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const startIso = getJakartaBoundary(dateFrom)
      const endIso = getJakartaBoundary(dateTo, true)

      // 1. Fetch Paginated Transactions List
      let txQuery = supabase
        .from('transactions')
        .select(`
          id,
          receipt_number,
          total,
          created_at,
          profile:profiles!transactions_created_by_fkey(display_name)
        `, { count: 'exact' })
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      // 2. Fetch All Transactions in range for Metrics Summary
      let summaryTxQuery = supabase
        .from('transactions')
        .select('id, total')
        .gte('created_at', startIso)
        .lt('created_at', endIso)

      // 3. Fetch Sold Transaction Items in range for Top Products & Items count
      let itemsQuery = supabase
        .from('transaction_items')
        .select(`
          product_name_snapshot,
          quantity,
          subtotal,
          created_at
        `)
        .gte('created_at', startIso)
        .lt('created_at', endIso)

      const [txResult, summaryResult, itemsResult] = await Promise.all([
        txQuery,
        summaryTxQuery,
        itemsQuery,
      ])

      if (txResult.error) throw txResult.error
      if (summaryResult.error) throw summaryResult.error
      if (itemsResult.error) throw itemsResult.error

      setTransactions(txResult.data || [])
      setTotalCount(txResult.count || 0)

      // Compute Total Revenue
      let totalRev = 0n
      for (const t of summaryResult.data || []) {
        totalRev += parseAmountToCents(t.total, 'total transaksi')
      }

      const txCount = BigInt(summaryResult.data?.length || 0)
      const avgBasket = txCount > 0n ? totalRev / txCount : 0n

      // Compute Items sold and Group by Product
      let itemsSold = 0n
      const productMap = new Map()

      for (const item of itemsResult.data || []) {
        const qty = BigInt(item.quantity)
        const subtotal = parseAmountToCents(item.subtotal, 'subtotal item')
        itemsSold += qty

        const name = item.product_name_snapshot
        const current = productMap.get(name) || {
          name,
          quantity: 0n,
          revenueCents: 0n,
        }

        productMap.set(name, {
          name,
          quantity: current.quantity + qty,
          revenueCents: current.revenueCents + subtotal,
        })
      }

      const topProducts = Array.from(productMap.values())
        .sort((a, b) => (b.quantity > a.quantity ? 1 : -1))
        .slice(0, 5)

      setSummary({
        totalRevenueCents: totalRev,
        transactionCount: txCount,
        totalItemsSold: itemsSold,
        averageBasketCents: avgBasket,
        topProducts,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memuat data laporan.',
      )
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, page, isDateInvalid])

  useEffect(() => {
    void fetchReportData()
  }, [fetchReportData, refreshKey])

  // Open Transaction Detail Modal
  async function openTransactionDetail(tx) {
    setSelectedTx(tx)
    setTxDetails([])
    setLoadingDetail(true)

    try {
      const { data, error: err } = await supabase
        .from('transaction_items')
        .select('id, product_name_snapshot, quantity, unit_price, subtotal')
        .eq('transaction_id', tx.id)
        .order('product_name_snapshot', { ascending: true })

      if (err) throw err
      setTxDetails(data || [])
    } catch {
      // fallback
    } finally {
      setLoadingDetail(false)
    }
  }

  // Export Summary to CSV
  function exportReportCsv() {
    if (transactions.length === 0) return

    const headers = ['No. Struk', 'Waktu', 'Kasir', 'Total (Rp)']
    const rows = transactions.map((t) => [
      `#${t.receipt_number || t.id.slice(0, 8)}`,
      dateTimeFormatter.format(new Date(t.created_at)),
      t.profile?.display_name || 'Kasir',
      Number(t.total).toFixed(2),
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `laporan_penjualan_${dateFrom}_sd_${dateTo}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <>
      <PageHeader
        eyebrow="Analitik & Ringkasan"
        title="Laporan Penjualan"
        description="Analisis performa penjualan, total omzet, produk terlaris, dan riwayat transaksi berdasarkan periode kalender."
      />

      {/* Date Filter & Presets Toolbar */}
      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: '7days', label: '7 Hari Terakhir' },
            { id: '30days', label: '30 Hari Terakhir' },
            { id: 'thisMonth', label: 'Bulan Ini' },
            { id: 'custom', label: 'Kustom' },
          ].map((item) => (
            <button
              key={item.id}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                periodPreset === item.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
              }`}
              onClick={() => applyPreset(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {periodPreset === 'custom' && (
            <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-[11px] font-medium dark:border-neutral-700 dark:bg-neutral-800">
              <button
                className={`rounded-md px-2.5 py-1 transition ${
                  customMode === 'single'
                    ? 'bg-white font-bold text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => {
                  setCustomMode('single')
                  setDateTo(dateFrom)
                  setPage(0)
                }}
                type="button"
              >
                1 Hari Saja
              </button>
              <button
                className={`rounded-md px-2.5 py-1 transition ${
                  customMode === 'range'
                    ? 'bg-white font-bold text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setCustomMode('range')}
                type="button"
              >
                Rentang Hari
              </button>
            </div>
          )}

          {periodPreset === 'custom' && customMode === 'single' ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                Pilih Tanggal:
              </span>
              <input
                className="min-h-9 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-800 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                onChange={(e) => handleSingleDateChange(e.target.value)}
                type="date"
                value={dateFrom}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500 dark:text-neutral-400">Dari:</span>
                <input
                  className="min-h-9 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-800 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPeriodPreset('custom')
                    setPage(0)
                  }}
                  type="date"
                  value={dateFrom}
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500 dark:text-neutral-400">Sampai:</span>
                <input
                  className="min-h-9 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-800 outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPeriodPreset('custom')
                    setPage(0)
                  }}
                  type="date"
                  value={dateTo}
                />
              </div>
            </>
          )}

          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            disabled={loading || transactions.length === 0}
            onClick={exportReportCsv}
            title="Unduh laporan dalam format CSV"
            type="button"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div
          className="mb-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={17} />
          <p className="flex-1">{error}</p>
        </div>
      )}

      {/* Aggregated KPI Cards */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail={`Periode: ${dateFormatter.format(new Date(getJakartaBoundary(dateFrom)))} - ${dateFormatter.format(new Date(getJakartaBoundary(dateTo)))}`}
          icon={Wallet}
          label="Total Pendapatan (Omzet)"
          value={formatCentsToCurrency(summary.totalRevenueCents)}
        />
        <StatCard
          detail="Jumlah transaksi kasir selesai"
          icon={Receipt}
          label="Total Transaksi"
          value={countFormatter.format(summary.transactionCount)}
        />
        <StatCard
          detail="Unit barang terjual di periode ini"
          icon={ShoppingBag}
          label="Produk Terjual"
          value={`${countFormatter.format(summary.totalItemsSold)} pcs`}
        />
        <StatCard
          detail="Rata-rata omzet per struk transaksi"
          icon={TrendingUp}
          label="Rata-rata Transaksi"
          value={formatCentsToCurrency(summary.averageBasketCents)}
        />
      </section>

      {/* Two Column Layout: Top Selling Products (Left) & Transaction Table (Right/Full) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
        {/* Top 5 Best Selling Products Card */}
        <section className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Top 5 Produk Terlaris
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Berdasarkan akumulasi unit terjual pada rentang tanggal terpilih.
            </p>
          </div>

          <div className="flex-1">
            {loading ? (
              <div className="flex h-48 flex-col items-center justify-center">
                <LoaderCircle className="animate-spin text-brand-600" size={20} />
              </div>
            ) : summary.topProducts.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-neutral-400">
                <Package className="mb-2 opacity-40" size={30} />
                Belum ada produk terjual di periode ini.
              </div>
            ) : (
              <div className="space-y-3.5">
                {summary.topProducts.map((p, idx) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="line-clamp-1 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {formatCentsToCurrency(p.revenueCents)}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md bg-neutral-200/60 px-2 py-0.5 text-xs font-bold text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200">
                      {p.quantity.toString()} pcs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Detailed Transactions List Table */}
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-neutral-100 p-4 sm:p-5 dark:border-neutral-800">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Rincian Riwayat Transaksi
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Klik baris transaksi untuk melihat detail produk dan harga satuan.
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center">
              <LoaderCircle className="animate-spin text-brand-600" size={24} />
              <p className="mt-3 text-xs font-medium text-neutral-500">
                Memuat transaksi penjualan...
              </p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-8">
              <EmptyState
                compact
                description="Tidak ada transaksi penjualan yang tercatat pada rentang tanggal ini."
                icon={Receipt}
                title="Tidak Ada Transaksi"
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/80">
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">
                        No. Struk
                      </th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">
                        Waktu (WIB)
                      </th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">
                        Kasir
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">
                        Total Nilai
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="cursor-pointer transition hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40"
                        onClick={() => openTransactionDetail(tx)}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                          #{tx.receipt_number || tx.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                          {dateTimeFormatter.format(new Date(tx.created_at))}
                        </td>
                        <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                          {tx.profile?.display_name || 'Kasir'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-neutral-900 dark:text-neutral-100">
                          {currencyFormatter.format(Number(tx.total))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            className="rounded px-2.5 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/60"
                            onClick={(e) => {
                              e.stopPropagation()
                              openTransactionDetail(tx)
                            }}
                            type="button"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-xs dark:border-neutral-800">
                  <span className="text-neutral-500">
                    Halaman {page + 1} dari {totalPages} ({totalCount} transaksi)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      className="inline-flex min-h-8 items-center gap-1 rounded border border-neutral-200 px-2.5 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                      type="button"
                    >
                      <ChevronLeft size={14} />
                      Prev
                    </button>
                    <button
                      className="inline-flex min-h-8 items-center gap-1 rounded border border-neutral-200 px-2.5 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                      type="button"
                    >
                      Next
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Transaction Items Detail Modal */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedTx(null)
          }}
        >
          <section
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            role="dialog"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Detail Transaksi #{selectedTx.receipt_number || selectedTx.id.slice(0, 8)}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {dateTimeFormatter.format(new Date(selectedTx.created_at))} · Oleh{' '}
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {selectedTx.profile?.display_name || 'Kasir'}
                  </span>
                </p>
              </div>
              <button
                className="icon-button -mr-1 -mt-1 size-7"
                onClick={() => setSelectedTx(null)}
                type="button"
              >
                <X size={17} />
              </button>
            </div>

            <div className="my-4 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              {loadingDetail ? (
                <div className="flex h-20 items-center justify-center">
                  <LoaderCircle className="animate-spin text-brand-600" size={18} />
                </div>
              ) : (
                txDetails.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b border-neutral-100/60 pb-1.5 pt-0.5 last:border-b-0 dark:border-neutral-700/40"
                  >
                    <div>
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {item.product_name_snapshot}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {item.quantity} × {currencyFormatter.format(Number(item.unit_price))}
                      </p>
                    </div>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">
                      {currencyFormatter.format(Number(item.subtotal))}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                Total Transaksi
              </span>
              <span className="text-lg font-bold text-brand-600 dark:text-brand-400">
                {currencyFormatter.format(Number(selectedTx.total))}
              </span>
            </div>

            <button
              className="mt-5 w-full rounded-xl bg-neutral-900 py-2.5 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              onClick={() => setSelectedTx(null)}
              type="button"
            >
              Tutup
            </button>
          </section>
        </div>
      )}
    </>
  )
}
