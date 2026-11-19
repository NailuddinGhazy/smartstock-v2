import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE = 1000
const JAKARTA_TIME_ZONE = 'Asia/Jakarta'
const countFormatter = new Intl.NumberFormat('id-ID')
const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const chartDateFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TIME_ZONE,
  day: 'numeric',
  month: 'short',
})
const chartDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const overview = [
  {
    key: 'totalProducts',
    label: 'Total Produk',
    icon: Boxes,
    format: countFormatter.format,
  },
  {
    key: 'totalTransactions',
    label: 'Total Transaksi',
    icon: ClipboardList,
    format: countFormatter.format,
  },
  {
    key: 'totalRevenueCents',
    label: 'Total Pendapatan',
    icon: ChartNoAxesCombined,
    format: formatRupiah,
  },
  {
    key: 'inventoryValueCents',
    label: 'Nilai Persediaan',
    icon: Wallet,
    format: formatRupiah,
  },
]

function formatRupiah(cents) {
  const wholeRupiah = rupiahFormatter.format(cents / 100n)
  const fraction = cents % 100n

  if (fraction === 0n) {
    return wholeRupiah
  }

  return `${wholeRupiah},${fraction.toString().padStart(2, '0')}`
}

function parseAmountToCents(value, fieldName) {
  const match = String(value).match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/)
  if (!match) {
    throw new Error(`Nilai ${fieldName} dari Supabase tidak valid.`)
  }

  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] || '').padEnd(2, '0') || '0')
  return whole * 100n + fraction
}

function getJakartaDateKey(date) {
  const parts = chartDateKeyFormatter.formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function getLastSevenDates() {
  const todayKey = getJakartaDateKey(new Date())
  const [year, month, day] = todayKey.split('-').map(Number)
  const today = new Date(Date.UTC(year, month - 1, day))

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)

    return {
      key,
      label: chartDateFormatter.format(
        new Date(`${key}T12:00:00.000Z`),
      ),
      revenueCents: 0n,
    }
  })
}

async function fetchAllPages(buildQuery, tableName) {
  const rows = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Gagal membaca ${tableName}: ${error.message}`)
    }

    rows.push(...data)
    if (data.length < PAGE_SIZE) {
      return rows
    }
  }
}

async function fetchDashboardData() {
  if (!supabase) {
    throw new Error('Supabase belum dikonfigurasi.')
  }

  const [products, transactions] = await Promise.all([
    fetchAllPages(
      () =>
        supabase
          .from('products')
          .select('id, price, stock')
          .eq('is_active', true),
      'produk aktif',
    ),
    fetchAllPages(
      () => supabase.from('transactions').select('id, total, created_at'),
      'transaksi',
    ),
  ])

  const chart = getLastSevenDates()
  const chartByDate = new Map(chart.map((item) => [item.key, item]))
  let totalRevenueCents = 0n
  let recentRevenueCents = 0n
  let recentTransactionCount = 0n

  for (const transaction of transactions) {
    const totalCents = parseAmountToCents(transaction.total, 'total transaksi')
    totalRevenueCents += totalCents

    const dateKey = getJakartaDateKey(new Date(transaction.created_at))
    const chartDay = chartByDate.get(dateKey)
    if (chartDay) {
      chartDay.revenueCents += totalCents
      recentRevenueCents += totalCents
      recentTransactionCount += 1n
    }
  }

  let inventoryValueCents = 0n
  for (const product of products) {
    const stockText = String(product.stock)
    if (!/^(0|[1-9]\d*)$/.test(stockText)) {
      throw new Error('Jumlah stok produk dari Supabase tidak valid.')
    }

    inventoryValueCents +=
      parseAmountToCents(product.price, 'harga produk') * BigInt(stockText)
  }

  return {
    totalProducts: BigInt(products.length),
    totalTransactions: BigInt(transactions.length),
    totalRevenueCents,
    inventoryValueCents,
    recentRevenueCents,
    recentTransactionCount,
    chart,
  }
}

function LoadingDashboard() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat data dashboard">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.map(({ key, label }) => (
          <div
            key={key}
            className="h-32 animate-pulse rounded-xl border border-neutral-200 bg-white p-5"
          >
            <p className="text-sm font-medium text-neutral-300">{label}</p>
            <div className="mt-4 h-7 w-28 rounded bg-neutral-100" />
            <div className="mt-3 h-3 w-36 rounded bg-neutral-100" />
          </div>
        ))}
      </section>
      <div className="h-80 animate-pulse rounded-xl border border-neutral-200 bg-white" />
      <span className="sr-only">Memuat data dari Supabase...</span>
    </div>
  )
}

function RevenueChart({ days }) {
  const maximumRevenue = days.reduce(
    (maximum, day) => (day.revenueCents > maximum ? day.revenueCents : maximum),
    0n,
  )

  return (
    <div
      className="grid h-64 grid-cols-7 items-end gap-2 border-b border-neutral-200 px-1 pt-6 sm:gap-4 sm:px-3"
      role="img"
      aria-label={`Pendapatan tujuh hari terakhir: ${days
        .map((day) => `${day.label} ${formatRupiah(day.revenueCents)}`)
        .join(', ')}`}
    >
      {days.map((day) => {
        const height =
          maximumRevenue === 0n
            ? 0
            : Math.max(
                4,
                Number((day.revenueCents * 10000n) / maximumRevenue) / 100,
              )

        return (
          <div
            key={day.key}
            className="flex h-full min-w-0 flex-col items-center justify-end"
          >
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-12 rounded-t-md bg-brand-500 transition-[height] sm:max-w-16"
                style={{ height: `${height}%` }}
                title={`${day.label}: ${formatRupiah(day.revenueCents)}`}
              />
            </div>
            <span className="mt-2 whitespace-nowrap text-[10px] text-neutral-500 sm:text-xs">
              {day.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ErrorState({ error, onRetry }) {
  return (
    <section
      className="rounded-xl border border-red-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.02] sm:p-6"
      role="alert"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
        <AlertCircle size={20} />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-neutral-900">
        Data dashboard belum dapat dimuat
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-neutral-600">{error}</p>
      <button
        type="button"
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        onClick={onRetry}
      >
        <RefreshCw size={16} />
        Coba lagi
      </button>
    </section>
  )
}

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState({
    status: 'loading',
    data: null,
    error: null,
  })

  useEffect(() => {
    let isCurrent = true
    setState({ status: 'loading', data: null, error: null })

    fetchDashboardData()
      .then((data) => {
        if (isCurrent) {
          setState({ status: 'loaded', data, error: null })
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setState({
            status: 'error',
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Terjadi kesalahan saat mengambil data dashboard.',
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [refreshKey])

  return (
    <>
      <PageHeader
        eyebrow="Ringkasan"
        title="Dashboard"
        description="Pantau persediaan dan aktivitas bisnis dari satu tempat."
      />

      {state.status === 'loading' && <LoadingDashboard />}
      {state.status === 'error' && (
        <ErrorState
          error={state.error}
          onRetry={() => setRefreshKey((key) => key + 1)}
        />
      )}
      {state.status === 'loaded' && (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Ringkasan metrik"
          >
            {overview.map(({ key, label, icon, format }) => (
              <StatCard
                key={key}
                label={label}
                icon={icon}
                value={format(state.data[key])}
                detail={
                  key === 'totalProducts' || key === 'inventoryValueCents'
                    ? 'Produk aktif'
                    : 'Semua transaksi'
                }
              />
            ))}
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Pendapatan 7 hari terakhir
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Berdasarkan tanggal transaksi di zona waktu Asia/Jakarta.
                </p>
              </div>
              {state.data.totalTransactions === 0n ? (
                <EmptyState
                  icon={ChartNoAxesCombined}
                  title="Belum ada transaksi"
                  description="Grafik pendapatan akan muncul setelah transaksi pertama tercatat."
                  compact
                />
              ) : (
                <>
                  <RevenueChart days={state.data.chart} />
                  {state.data.recentTransactionCount === 0n && (
                    <p className="mt-4 text-center text-xs text-neutral-500">
                      Tidak ada transaksi dalam tujuh hari terakhir.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Ringkasan 7 hari
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Periode kalender Asia/Jakarta, termasuk hari ini.
                </p>
              </div>
              <dl className="space-y-4">
                <div className="rounded-lg bg-neutral-50 p-4">
                  <dt className="text-xs font-medium text-neutral-500">
                    Pendapatan
                  </dt>
                  <dd className="mt-1 text-lg font-bold tracking-tight text-neutral-900">
                    {formatRupiah(state.data.recentRevenueCents)}
                  </dd>
                </div>
                <div className="rounded-lg bg-neutral-50 p-4">
                  <dt className="text-xs font-medium text-neutral-500">
                    Jumlah transaksi
                  </dt>
                  <dd className="mt-1 text-lg font-bold tracking-tight text-neutral-900">
                    {countFormatter.format(state.data.recentTransactionCount)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      )}
    </>
  )
}
