import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Check,
  CircleCheck,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { useAuth } from '../lib/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE = 25
const PRODUCT_PAGE_SIZE = 1000
const MAX_BIGINT = 9223372036854775807n
const movementColumns =
  'id, product_id, movement_type, quantity_change, stock_before, stock_after, reason, created_by, created_at, product:products!stock_movements_product_fkey(name), profile:profiles!stock_movements_created_by_fkey(display_name)'
const numberFormatter = new Intl.NumberFormat('id-ID')
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

function getStockErrorMessage(error) {
  const message = error?.message ?? ''

  if (
    error?.code === '23514' &&
    /insufficient stock/i.test(message)
  ) {
    return 'Stok tidak mencukupi untuk jumlah pengurangan tersebut. Muat ulang stok lalu coba lagi.'
  }
  if (/insufficient stock/i.test(message)) {
    return 'Stok tidak mencukupi untuk jumlah pengurangan tersebut. Muat ulang stok lalu coba lagi.'
  }
  if (error?.code === '42501') {
    return 'Aksi ini memerlukan akun dengan profil aktif.'
  }
  if (
    error?.code === '22003' ||
    /bigint range/i.test(message) ||
    /bigint/i.test(message)
  ) {
    return 'Jumlah penyesuaian berada di luar batas stok yang didukung.'
  }
  if (/product does not exist/i.test(message)) {
    return 'Produk tidak ditemukan. Muat ulang daftar produk lalu coba lagi.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error?.message === 'string' && error.message) {
    return error.message
  }

  return 'Terjadi kesalahan saat menyimpan penyesuaian stok.'
}

function getJakartaBoundary(date, includeNextDay = false) {
  const [year, month, day] = date.split('-').map(Number)
  const offsetDay = includeNextDay ? 1 : 0
  return new Date(
    Date.UTC(year, month - 1, day + offsetDay, -7),
  ).toISOString()
}

function MovementBadge({ type }) {
  const labels = {
    adjustment: 'Penyesuaian',
    sale: 'Penjualan',
    opening_balance: 'Saldo awal',
  }
  const styles = {
    adjustment: 'bg-blue-50 text-blue-700',
    sale: 'bg-amber-50 text-amber-700',
    opening_balance: 'bg-emerald-50 text-emerald-700',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[type] ?? 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {type === 'adjustment' ? (
        <ArrowDownUp size={13} />
      ) : type === 'sale' ? (
        <ArrowDown size={13} />
      ) : (
        <ArrowUp size={13} />
      )}
      {labels[type] ?? type}
    </span>
  )
}

function AdjustmentDialog({
  products,
  selectedProduct,
  adjustmentType,
  quantity,
  reason,
  error,
  isSaving,
  onProductChange,
  onTypeChange,
  onQuantityChange,
  onReasonChange,
  onClose,
  onContinue,
}) {
  const quantityText = quantity.trim()
  const validQuantity = /^\d+$/.test(quantityText) && BigInt(quantityText) > 0n
  const currentStock = selectedProduct ? BigInt(selectedProduct.stock) : null
  const quantityValue = validQuantity ? BigInt(quantityText) : null
  const estimatedStock =
    currentStock === null || quantityValue === null
      ? null
      : adjustmentType === 'add'
        ? currentStock + quantityValue
        : currentStock - quantityValue
  const insufficientPreview =
    adjustmentType === 'subtract' &&
    estimatedStock !== null &&
    estimatedStock < 0n
  const overflowPreview =
    adjustmentType === 'add' &&
    estimatedStock !== null &&
    estimatedStock > MAX_BIGINT

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/40 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isSaving) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="stock-adjustment-title"
        aria-modal="true"
        className="my-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-bold tracking-tight text-neutral-950"
              id="stock-adjustment-title"
            >
              Sesuaikan stok
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Perubahan stok dicatat sebagai pergerakan persediaan.
            </p>
          </div>
          <button
            aria-label="Tutup form"
            className="icon-button -mr-1 -mt-1 shrink-0"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onContinue}>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="adjustment-product"
            >
              Produk <span className="text-brand-600">*</span>
            </label>
            <select
              className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="adjustment-product"
              onChange={(event) => onProductChange(event.target.value)}
              required
              value={selectedProduct?.id ?? ''}
            >
              <option value="" disabled>
                Pilih produk aktif
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · stok {numberFormatter.format(BigInt(product.stock))}
                </option>
              ))}
            </select>
            {products.length === 0 && (
              <p className="mt-1.5 text-xs leading-5 text-amber-700">
                Tidak ada produk aktif yang dapat disesuaikan.
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="adjustment-type"
            >
              Jenis penyesuaian <span className="text-brand-600">*</span>
            </label>
            <select
              className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="adjustment-type"
              onChange={(event) => onTypeChange(event.target.value)}
              value={adjustmentType}
            >
              <option value="add">Tambah stok</option>
              <option value="subtract">Kurangi stok</option>
            </select>
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="adjustment-quantity"
            >
              Jumlah <span className="text-brand-600">*</span>
            </label>
            <input
              className="min-h-10 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="adjustment-quantity"
              inputMode="numeric"
              onChange={(event) => onQuantityChange(event.target.value)}
              pattern="[0-9]*"
              placeholder="Contoh: 5"
              required
              type="text"
              value={quantity}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Masukkan bilangan bulat positif.
            </p>
          </div>

          {selectedProduct && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3.5">
              <div>
                <p className="text-xs font-medium text-neutral-500">
                  Stok saat ini
                </p>
                <p className="mt-1 text-base font-semibold text-neutral-900">
                  {numberFormatter.format(currentStock)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500">
                  Estimasi stok setelah
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${
                    insufficientPreview || overflowPreview
                      ? 'text-red-700'
                      : 'text-neutral-900'
                  }`}
                >
                  {estimatedStock === null
                    ? '—'
                    : numberFormatter.format(estimatedStock)}
                </p>
              </div>
              {(insufficientPreview || overflowPreview) && (
                <p className="col-span-2 text-xs leading-5 text-red-700">
                  {insufficientPreview
                    ? 'Stok tidak mencukupi untuk jumlah pengurangan ini.'
                    : 'Hasil penambahan melebihi batas nilai stok.'}
                </p>
              )}
            </div>
          )}

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="adjustment-reason"
            >
              Alasan <span className="text-brand-600">*</span>
            </label>
            <textarea
              className="min-h-20 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="adjustment-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Contoh: Koreksi hasil stock opname"
              required
              rows={3}
              value={reason}
            />
          </div>

          {error && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:justify-end">
            <button
              className="min-h-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Batal
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isSaving ||
                products.length === 0 ||
                insufficientPreview ||
                overflowPreview
              }
              type="submit"
            >
              <Check size={16} />
              Tinjau penyesuaian
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ConfirmationDialog({
  product,
  adjustmentType,
  quantity,
  reason,
  currentStock,
  estimatedStock,
  isSaving,
  error,
  onClose,
  onConfirm,
}) {
  if (!product) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/40 p-4">
      <section
        aria-labelledby="confirm-adjustment-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ArrowDownUp size={19} />
        </span>
        <h2
          className="mt-4 text-lg font-bold tracking-tight text-neutral-950"
          id="confirm-adjustment-title"
        >
          Konfirmasi penyesuaian stok
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {adjustmentType === 'add' ? 'Tambah' : 'Kurangi'}{' '}
          <span className="font-semibold">
            {numberFormatter.format(quantity)}
          </span>{' '}
          unit untuk <span className="font-semibold">{product.name}</span>?
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3.5 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Stok saat ini</dt>
            <dd className="mt-1 font-semibold text-neutral-800">
              {numberFormatter.format(currentStock)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Stok setelah</dt>
            <dd className="mt-1 font-semibold text-neutral-800">
              {numberFormatter.format(estimatedStock)}
            </dd>
          </div>
          <div className="col-span-2 border-t border-neutral-200 pt-2">
            <dt className="text-xs text-neutral-500">Alasan</dt>
            <dd className="mt-1 break-words text-neutral-800">{reason}</dd>
          </div>
        </dl>
        {error && (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Kembali
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            {isSaving ? 'Menyimpan...' : 'Konfirmasi dan simpan'}
          </button>
        </div>
      </section>
    </div>
  )
}

async function fetchAllProducts() {
  const products = []

  for (let offset = 0; ; offset += PRODUCT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, stock, is_active')
      .order('id', { ascending: true })
      .range(offset, offset + PRODUCT_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    products.push(...data)
    if (data.length < PRODUCT_PAGE_SIZE) {
      return products
    }
  }
}

export default function StockAdjustmentPage() {
  const { user, profile } = useAuth()
  const [products, setProducts] = useState([])
  const [productState, setProductState] = useState('loading')
  const [productError, setProductError] = useState('')
  const [productRefresh, setProductRefresh] = useState(0)
  const [movements, setMovements] = useState([])
  const [historyState, setHistoryState] = useState('loading')
  const [historyError, setHistoryError] = useState('')
  const [historyCount, setHistoryCount] = useState(0)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [productFilter, setProductFilter] = useState('all')
  const [movementFilter, setMovementFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState('add')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => product.is_active)
        .sort((a, b) =>
          a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
        ),
    [products],
  )
  const selectedProduct = activeProducts.find(
    (product) => product.id === selectedProductId,
  )
  const activeStockTotal = activeProducts.reduce(
    (total, product) => total + BigInt(product.stock),
    0n,
  )
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  const loadProducts = useCallback(async () => {
    if (!supabase) {
      setProductError('Supabase belum dikonfigurasi.')
      setProductState('error')
      return
    }

    setProductState('loading')
    setProductError('')
    try {
      setProducts(await fetchAllProducts())
      setProductState('loaded')
    } catch (error) {
      setProductError(getStockErrorMessage(error))
      setProductState('error')
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts, productRefresh])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistorySearch(searchInput.trim())
      setHistoryPage(0)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!supabase) {
      setHistoryError('Supabase belum dikonfigurasi.')
      setHistoryState('error')
      return undefined
    }
    if (dateRangeInvalid) {
      setMovements([])
      setHistoryCount(0)
      setHistoryError('')
      setHistoryState('loaded')
      return undefined
    }

    let isCurrent = true
    setHistoryState('loading')
    setHistoryError('')

    async function loadMovements() {
      let query = supabase
        .from('stock_movements')
        .select(movementColumns, { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })

      if (productFilter !== 'all') {
        query = query.eq('product_id', productFilter)
      }
      if (movementFilter !== 'all') {
        query = query.eq('movement_type', movementFilter)
      }
      if (dateFrom) {
        query = query.gte('created_at', getJakartaBoundary(dateFrom))
      }
      if (dateTo) {
        query = query.lt('created_at', getJakartaBoundary(dateTo, true))
      }
      if (historySearch) {
        query = query.ilike('reason', `%${historySearch}%`)
      }

      try {
        const { data, error, count } = await query.range(
          historyPage * PAGE_SIZE,
          (historyPage + 1) * PAGE_SIZE - 1,
        )

        if (error) {
          throw error
        }
        if (isCurrent) {
          setMovements(data)
          setHistoryCount(count ?? data.length)
          setHistoryState('loaded')
        }
      } catch (error) {
        if (isCurrent) {
          setHistoryError(getStockErrorMessage(error))
          setHistoryState('error')
        }
      }
    }

    void loadMovements()
    return () => {
      isCurrent = false
    }
  }, [
    productFilter,
    movementFilter,
    dateFrom,
    dateTo,
    historySearch,
    historyPage,
    historyRefresh,
    dateRangeInvalid,
  ])

  useEffect(() => {
    if (!feedback) {
      return undefined
    }
    const timer = window.setTimeout(() => setFeedback(null), 4500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  function openAdjustment() {
    setSelectedProductId('')
    setAdjustmentType('add')
    setQuantity('')
    setReason('')
    setFormError('')
    setConfirmationError('')
    setConfirmOpen(false)
    setDialogOpen(true)
  }

  function closeAdjustment() {
    if (!isSaving) {
      setDialogOpen(false)
      setConfirmOpen(false)
      setFormError('')
      setConfirmationError('')
    }
  }

  function continueToConfirmation(event) {
    event.preventDefault()
    const amountText = quantity.trim()

    if (!selectedProduct) {
      setFormError('Pilih produk aktif yang akan disesuaikan.')
      return
    }
    if (!/^\d+$/.test(amountText) || BigInt(amountText) <= 0n) {
      setFormError('Jumlah harus berupa bilangan bulat positif.')
      return
    }

    const amount = BigInt(amountText)
    if (amount > MAX_BIGINT) {
      setFormError('Jumlah melebihi batas nilai yang didukung.')
      return
    }

    if (!reason.trim()) {
      setFormError('Alasan wajib diisi dan tidak boleh hanya whitespace.')
      return
    }

    const stockBefore = BigInt(selectedProduct.stock)
    const stockAfter =
      adjustmentType === 'add' ? stockBefore + amount : stockBefore - amount
    if (stockAfter < 0n) {
      setFormError('Stok tidak mencukupi untuk jumlah pengurangan ini.')
      return
    }
    if (stockAfter > MAX_BIGINT) {
      setFormError('Hasil penambahan melebihi batas nilai stok.')
      return
    }

    setQuantity(amount.toString())
    setReason(reason.trim())
    setFormError('')
    setConfirmationError('')
    setConfirmOpen(true)
  }

  async function saveAdjustment() {
    if (!supabase || !selectedProduct) {
      setConfirmationError('Produk atau koneksi Supabase tidak tersedia.')
      return
    }

    const amount = BigInt(quantity)
    const delta = adjustmentType === 'add' ? amount : -amount
    setIsSaving(true)
    setConfirmationError('')
    setFeedback(null)

    try {
      const { error } = await supabase.rpc('adjust_stock', {
        p_product_id: selectedProduct.id,
        p_delta: delta.toString(),
        p_reason: reason.trim(),
      })

      if (error) {
        throw error
      }

      setDialogOpen(false)
      setConfirmOpen(false)
      setFeedback({
        type: 'success',
        message: 'Penyesuaian stok berhasil disimpan.',
      })
      setProductRefresh((value) => value + 1)
      setHistoryPage(0)
      setHistoryRefresh((value) => value + 1)
    } catch (error) {
      setConfirmationError(getStockErrorMessage(error))
      if (
        error?.code === '23514' ||
        /insufficient stock/i.test(error?.message ?? '')
      ) {
        setProductRefresh((value) => value + 1)
      }
    } finally {
      setIsSaving(false)
    }
  }

  function updateHistoryFilter(setter, value) {
    setter(value)
    setHistoryPage(0)
  }

  const pageCount = Math.max(1, Math.ceil(historyCount / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="Penyesuaian Stok"
        description="Koreksi jumlah persediaan dan telusuri riwayat pergerakan stok."
      />

      <div className="-mt-3 mb-5 flex justify-end sm:-mt-4">
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={productState !== 'loaded' || activeProducts.length === 0}
          onClick={openAdjustment}
          type="button"
        >
          <Plus size={17} />
          Sesuaikan stok
        </button>
      </div>

      {feedback && (
        <div
          className={`mb-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          role={feedback.type === 'success' ? 'status' : 'alert'}
        >
          {feedback.type === 'success' ? (
            <CircleCheck className="mt-0.5 shrink-0" size={17} />
          ) : (
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
          )}
          <p className="flex-1">{feedback.message}</p>
          <button
            aria-label="Tutup notifikasi"
            className="icon-button -my-1 -mr-1 size-7 shrink-0"
            onClick={() => setFeedback(null)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {productState === 'error' ? (
        <section
          className="mb-5 rounded-xl border border-red-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.02] sm:p-6"
          role="alert"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <AlertCircle size={20} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-neutral-900">
            Ringkasan stok belum dapat dimuat
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-neutral-600">
            {productError}
          </p>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            onClick={() => setProductRefresh((value) => value + 1)}
            type="button"
          >
            <RefreshCw size={16} />
            Coba lagi
          </button>
        </section>
      ) : (
        <section
          aria-busy={productState === 'loading'}
          aria-label="Ringkasan stok aktif"
          className="mb-6 grid gap-3 sm:grid-cols-2"
        >
          <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-500">
                  Produk aktif
                </p>
                {productState === 'loading' ? (
                  <div className="mt-3 h-7 w-20 animate-pulse rounded bg-neutral-100" />
                ) : (
                  <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
                    {numberFormatter.format(activeProducts.length)}
                  </p>
                )}
              </div>
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Package size={19} />
              </span>
            </div>
          </article>
          <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-500">
                  Total unit stok aktif
                </p>
                {productState === 'loading' ? (
                  <div className="mt-3 h-7 w-28 animate-pulse rounded bg-neutral-100" />
                ) : (
                  <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
                    {numberFormatter.format(activeStockTotal)}
                  </p>
                )}
              </div>
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <ArrowDownUp size={19} />
              </span>
            </div>
          </article>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-950/[0.02]">
        <div className="border-b border-neutral-100 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-neutral-900">
              Riwayat pergerakan stok
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Riwayat penyesuaian, penjualan, dan saldo awal dari database.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="relative min-w-0 xl:col-span-2">
              <span className="sr-only">Cari alasan penyesuaian</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={17}
              />
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari alasan..."
                type="search"
                value={searchInput}
              />
            </label>
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-neutral-600">
                Produk
              </span>
              <select
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) =>
                  updateHistoryFilter(setProductFilter, event.target.value)
                }
                value={productFilter}
              >
                <option value="all">Semua</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {!product.is_active ? ' (arsip)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-neutral-600">
                Jenis
              </span>
              <select
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) =>
                  updateHistoryFilter(setMovementFilter, event.target.value)
                }
                value={movementFilter}
              >
                <option value="all">Semua</option>
                <option value="adjustment">Penyesuaian</option>
                <option value="sale">Penjualan</option>
                <option value="opening_balance">Saldo awal</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-1">
              <label className="min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-500">
                  Dari
                </span>
                <input
                  aria-label="Tanggal mulai"
                  className="min-h-10 w-full rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  onChange={(event) =>
                    updateHistoryFilter(setDateFrom, event.target.value)
                  }
                  type="date"
                  value={dateFrom}
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-xs font-medium text-neutral-500">
                  Sampai
                </span>
                <input
                  aria-label="Tanggal akhir"
                  className="min-h-10 w-full rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  onChange={(event) =>
                    updateHistoryFilter(setDateTo, event.target.value)
                  }
                  type="date"
                  value={dateTo}
                />
              </label>
            </div>
          </div>
          {dateRangeInvalid && (
            <p className="mt-3 text-sm text-red-700" role="alert">
              Tanggal mulai tidak boleh setelah tanggal akhir.
            </p>
          )}
        </div>

        {historyState === 'loading' ? (
          <div
            className="flex min-h-64 flex-col items-center justify-center"
            role="status"
          >
            <LoaderCircle className="animate-spin text-brand-600" size={24} />
            <p className="mt-3 text-sm font-medium text-neutral-600">
              Memuat riwayat...
            </p>
          </div>
        ) : historyState === 'error' ? (
          <div className="p-4 sm:p-6">
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-4"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 shrink-0 text-red-700" size={19} />
                <div>
                  <h3 className="text-sm font-semibold text-red-900">
                    Riwayat belum dapat dimuat
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-red-800">
                    {historyError}
                  </p>
                  <button
                    className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-100"
                    onClick={() => setHistoryRefresh((value) => value + 1)}
                    type="button"
                  >
                    <RefreshCw size={15} />
                    Coba lagi
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : movements.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={ArrowDownUp}
              title="Belum ada pergerakan stok"
              description="Pergerakan stok yang sesuai dengan filter akan tampil di sini."
              compact
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Tanggal
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Produk
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Jenis
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Perubahan
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Stok sebelum
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Stok sesudah
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Alasan
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                      Pengguna
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {movements.map((movement) => {
                    const delta = BigInt(movement.quantity_change)
                    const actorName =
                      movement.profile?.display_name ||
                      (movement.created_by === user?.id
                        ? profile?.display_name
                        : null)

                    return (
                      <tr
                        className="transition-colors hover:bg-neutral-50/70"
                        key={movement.id}
                      >
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-neutral-600 sm:px-5">
                          {dateTimeFormatter.format(
                            new Date(movement.created_at),
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-neutral-900 sm:px-5">
                          {movement.product?.name ?? 'Tidak tersedia'}
                        </td>
                        <td className="px-4 py-4 sm:px-5">
                          <MovementBadge type={movement.movement_type} />
                        </td>
                        <td
                          className={`px-4 py-4 text-right text-sm font-semibold sm:px-5 ${
                            delta > 0n ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {delta > 0n ? '+' : ''}
                          {numberFormatter.format(delta)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-neutral-700 sm:px-5">
                          {numberFormatter.format(
                            BigInt(movement.stock_before),
                          )}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-neutral-700 sm:px-5">
                          {numberFormatter.format(
                            BigInt(movement.stock_after),
                          )}
                        </td>
                        <td className="max-w-xs px-4 py-4 text-sm text-neutral-600 sm:px-5">
                          {movement.reason || (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-600 sm:px-5">
                          {actorName || 'Tidak tersedia'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-neutral-500">
                Menampilkan {historyPage * PAGE_SIZE + 1}–
                {Math.min((historyPage + 1) * PAGE_SIZE, historyCount)} dari{' '}
                {numberFormatter.format(historyCount)} pergerakan
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="min-h-9 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((page) => page - 1)}
                  type="button"
                >
                  Sebelumnya
                </button>
                <span className="px-1 text-xs text-neutral-500">
                  Halaman {historyPage + 1} dari {pageCount}
                </span>
                <button
                  className="min-h-9 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={historyPage + 1 >= pageCount}
                  onClick={() => setHistoryPage((page) => page + 1)}
                  type="button"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {dialogOpen && (
        <AdjustmentDialog
          adjustmentType={adjustmentType}
          error={formError}
          isSaving={isSaving}
          onClose={closeAdjustment}
          onContinue={continueToConfirmation}
          onProductChange={(value) => {
            setSelectedProductId(value)
            setFormError('')
            setConfirmationError('')
          }}
          onQuantityChange={(value) => {
            setQuantity(value)
            setFormError('')
          }}
          onReasonChange={(value) => {
            setReason(value)
            setFormError('')
          }}
          onTypeChange={(value) => {
            setAdjustmentType(value)
            setFormError('')
          }}
          products={activeProducts}
          quantity={quantity}
          reason={reason}
          selectedProduct={selectedProduct}
        />
      )}
      {confirmOpen && selectedProduct && (
        <ConfirmationDialog
          adjustmentType={adjustmentType}
          currentStock={BigInt(selectedProduct.stock)}
          error={confirmationError}
          estimatedStock={
            adjustmentType === 'add'
              ? BigInt(selectedProduct.stock) + BigInt(quantity)
              : BigInt(selectedProduct.stock) - BigInt(quantity)
          }
          isSaving={isSaving}
          onClose={() => {
            if (!isSaving) {
              setConfirmOpen(false)
              setConfirmationError('')
            }
          }}
          onConfirm={() => void saveAdjustment()}
          product={selectedProduct}
          quantity={BigInt(quantity)}
          reason={reason}
        />
      )}
    </>
  )
}
