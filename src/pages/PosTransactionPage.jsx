import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  CircleCheck,
  CreditCard,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { supabase } from '../lib/supabase.js'

const PRODUCT_PAGE_SIZE = 1000
const MAX_SALE_TOTAL_CENTS = 999999999999n // 9,999,999,999.99

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('id-ID')

function parseAmountToCents(value, fieldName = 'harga') {
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

function getPosErrorMessage(error) {
  const message = error?.message ?? ''

  if (error?.code === '42501') {
    return 'Aksi ini memerlukan akun pengguna dengan profil aktif.'
  }
  if (
    error?.code === '23514' &&
    (/insufficient stock/i.test(message) || /stok/i.test(message))
  ) {
    return 'Stok salah satu produk di keranjang tidak mencukupi untuk jumlah transaksi ini.'
  }
  if (/insufficient stock/i.test(message)) {
    return 'Stok salah satu produk di keranjang tidak mencukupi untuk jumlah transaksi ini.'
  }
  if (/archived products cannot be sold/i.test(message)) {
    return 'Produk yang diarsipkan tidak dapat ditransaksikan.'
  }
  if (/cannot contain more than 100/i.test(message)) {
    return 'Satu transaksi penjualan maksimal berisi 100 jenis produk.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error?.message === 'string' && error.message) {
    return error.message
  }
  return 'Terjadi kesalahan saat memproses transaksi penjualan.'
}

async function fetchAllActiveProducts() {
  const products = []

  for (let offset = 0; ; offset += PRODUCT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, stock, is_active, category_id')
      .eq('is_active', true)
      .order('name', { ascending: true })
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

export default function PosTransactionPage() {
  const [products, setProducts] = useState([])
  const [productState, setProductState] = useState('loading')
  const [productError, setProductError] = useState('')
  const [productRefresh, setProductRefresh] = useState(0)

  const [categories, setCategories] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Cart: Map of productId -> { product, quantity: bigint }
  const [cart, setCart] = useState([])
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [lastSuccessReceipt, setLastSuccessReceipt] = useState(null)

  // Load Categories & Products
  const loadData = useCallback(async () => {
    if (!supabase) {
      setProductError('Supabase belum dikonfigurasi.')
      setProductState('error')
      return
    }

    setProductState('loading')
    setProductError('')

    try {
      const [fetchedProducts, { data: catData, error: catError }] =
        await Promise.all([
          fetchAllActiveProducts(),
          supabase
            .from('categories')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        ])

      if (catError) {
        throw catError
      }

      setProducts(fetchedProducts)
      setCategories(catData || [])
      setProductState('loaded')
    } catch (error) {
      setProductError(getPosErrorMessage(error))
      setProductState('error')
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData, productRefresh])

  // Filtered Products Catalog
  const filteredProducts = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === 'all' || product.category_id === categoryFilter
      const matchesSearch =
        !cleanSearch || product.name.toLowerCase().includes(cleanSearch)
      return matchesCategory && matchesSearch
    })
  }, [products, categoryFilter, search])

  // Cart Calculations
  const cartSummary = useMemo(() => {
    let totalItems = 0n
    let totalCents = 0n

    for (const item of cart) {
      const priceCents = parseAmountToCents(item.product.price)
      totalItems += item.quantity
      totalCents += priceCents * item.quantity
    }

    return {
      totalItems,
      totalCents,
      formattedTotal: formatCentsToCurrency(totalCents),
    }
  }, [cart])

  // Cart actions
  function addToCart(product) {
    if (BigInt(product.stock) <= 0n) {
      return
    }

    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex(
        (item) => item.product.id === product.id,
      )

      if (existingIndex >= 0) {
        const item = currentCart[existingIndex]
        const availableStock = BigInt(product.stock)
        if (item.quantity >= availableStock) {
          return currentCart // Max reached
        }

        const updated = [...currentCart]
        updated[existingIndex] = {
          ...item,
          quantity: item.quantity + 1n,
        }
        return updated
      }

      return [...currentCart, { product, quantity: 1n }]
    })
  }

  function updateQuantity(productId, newQty) {
    if (newQty <= 0n) {
      removeFromCart(productId)
      return
    }

    setCart((currentCart) => {
      return currentCart.map((item) => {
        if (item.product.id === productId) {
          const availableStock = BigInt(item.product.stock)
          const validQty = newQty > availableStock ? availableStock : newQty
          return { ...item, quantity: validQty }
        }
        return item
      })
    })
  }

  function removeFromCart(productId) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.product.id !== productId),
    )
  }

  function clearCart() {
    setCart([])
  }

  // Handle Checkout submission to Supabase create_sale RPC
  async function handleCheckout() {
    if (cart.length === 0) {
      return
    }

    if (cart.length > 100) {
      setCheckoutError('Maksimal 100 produk berbeda dalam 1 transaksi.')
      return
    }

    if (cartSummary.totalCents > MAX_SALE_TOTAL_CENTS) {
      setCheckoutError('Total transaksi melebihi batas yang diizinkan sistem.')
      return
    }

    if (!supabase) {
      setCheckoutError('Supabase belum terkonfigurasi.')
      return
    }

    setIsSubmitting(true)
    setCheckoutError('')

    const payload = cart.map((item) => ({
      product_id: item.product.id,
      quantity: Number(item.quantity),
    }))

    try {
      const { data: transactionId, error } = await supabase.rpc('create_sale', {
        p_items: payload,
      })

      if (error) {
        throw error
      }

      // Success
      const receipt = {
        transactionId,
        date: new Date(),
        items: [...cart],
        totalCents: cartSummary.totalCents,
        formattedTotal: cartSummary.formattedTotal,
      }

      setLastSuccessReceipt(receipt)
      setCart([])
      setIsCheckoutOpen(false)
      setFeedback({
        type: 'success',
        message: `Transaksi berhasil disimpan (ID: ${transactionId.slice(0, 8)}...).`,
      })

      // Refresh product stocks
      setProductRefresh((prev) => prev + 1)
    } catch (error) {
      setCheckoutError(getPosErrorMessage(error))
      // Refresh stock so user sees actual updated stock
      setProductRefresh((prev) => prev + 1)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Point of Sale"
        title="Transaksi Penjualan"
        description="Pilih produk, masukkan ke keranjang, dan proses transaksi penjualan kasir (POS)."
      />

      {feedback && (
        <div
          className={`mb-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
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

      {/* Main Grid: Products Catalog (Left) & Cart / POS Summary (Right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        {/* Left: Product Catalog */}
        <div className="space-y-4">
          {/* Search & Category Filter */}
          <section
            aria-label="Pencarian katalog kasir"
            className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm shadow-neutral-950/[0.02] sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-900"
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari nama produk</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={17}
              />
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk kasir..."
                type="search"
                value={search}
              />
            </label>
            <label className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Kategori
              </span>
              <select
                className="min-h-10 max-w-44 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                onChange={(e) => setCategoryFilter(e.target.value)}
                value={categoryFilter}
              >
                <option value="all">Semua kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* Product Cards Grid */}
          {productState === 'loading' ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
              <LoaderCircle className="animate-spin text-brand-600" size={26} />
              <p className="mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Memuat katalog produk aktif...
              </p>
            </div>
          ) : productState === 'error' ? (
            <section
              className="rounded-xl border border-red-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.02] dark:border-red-900/50 dark:bg-neutral-900"
              role="alert"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                <AlertCircle size={20} />
              </span>
              <h2 className="mt-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Produk belum dapat dimuat
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                {productError}
              </p>
              <button
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                onClick={() => setProductRefresh((v) => v + 1)}
                type="button"
              >
                <RefreshCw size={16} />
                Coba lagi
              </button>
            </section>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              compact
              description="Tidak ada produk aktif yang cocok dengan filter."
              icon={Package}
              title="Produk tidak ditemukan"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const stockInt = BigInt(product.stock)
                const isOutOfStock = stockInt <= 0n
                const inCartItem = cart.find(
                  (item) => item.product.id === product.id,
                )
                const inCartQty = inCartItem?.quantity ?? 0n
                const isMaxInCart = inCartQty >= stockInt

                return (
                  <button
                    key={product.id}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                      isOutOfStock
                        ? 'cursor-not-allowed border-neutral-200 bg-neutral-50/70 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/50'
                        : 'border-neutral-200 bg-white shadow-sm hover:border-brand-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-brand-600'
                    }`}
                    disabled={isOutOfStock || isMaxInCart}
                    onClick={() => addToCart(product)}
                    type="button"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="line-clamp-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {product.name}
                        </span>
                        {inCartQty > 0n && (
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                            {inCartQty.toString()}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-bold text-brand-600 dark:text-brand-400">
                        {currencyFormatter.format(Number(product.price))}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] dark:border-neutral-800">
                      <span
                        className={
                          isOutOfStock
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        }
                      >
                        {isOutOfStock
                          ? 'Habis'
                          : `Sisa: ${integerFormatter.format(stockInt)}`}
                      </span>
                      {!isOutOfStock && (
                        <span className="flex items-center gap-0.5 text-brand-600 font-medium hover:underline">
                          <Plus size={13} />
                          Tambah
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Cart & Checkout Summary */}
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.02] dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                <ShoppingCart size={17} />
              </span>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Keranjang Kasir
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                className="text-xs font-medium text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                onClick={clearCart}
                type="button"
              >
                Kosongkan
              </button>
            )}
          </div>

          {/* Cart Item List */}
          <div className="my-4 flex-1 space-y-3 overflow-y-auto max-h-[460px] pr-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400 dark:text-neutral-500">
                <ShoppingCart className="mb-2 opacity-40" size={36} />
                <p className="text-sm font-medium">Keranjang masih kosong</p>
                <p className="mt-1 text-xs">
                  Pilih produk dari katalog di sebelah kiri untuk memulai
                  transaksi penjualan.
                </p>
              </div>
            ) : (
              cart.map((item) => {
                const priceCents = parseAmountToCents(item.product.price)
                const subtotalCents = priceCents * item.quantity
                const stockInt = BigInt(item.product.stock)

                return (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        @ {currencyFormatter.format(Number(item.product.price))}
                      </p>
                      <p className="mt-1 text-xs font-bold text-brand-600 dark:text-brand-400">
                        {formatCentsToCurrency(subtotalCents)}
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex size-7 items-center justify-center rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1n)
                        }
                        type="button"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-neutral-800 dark:text-neutral-200">
                        {item.quantity.toString()}
                      </span>
                      <button
                        className="flex size-7 items-center justify-center rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                        disabled={item.quantity >= stockInt}
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1n)
                        }
                        type="button"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        aria-label="Hapus item"
                        className="ml-1 flex size-7 items-center justify-center rounded text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => removeFromCart(item.product.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Checkout Footer */}
          <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>Total Item</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {cartSummary.totalItems.toString()} pcs
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                Total Tagihan
              </span>
              <span className="text-lg font-bold text-neutral-950 dark:text-neutral-50">
                {cartSummary.formattedTotal}
              </span>
            </div>

            <button
              className="mt-4 flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={cart.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
              type="button"
            >
              <CreditCard size={18} />
              Proses Transaksi Penjualan
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation & Payment Modal Dialog */}
      {isCheckoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/60 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isSubmitting) {
              setIsCheckoutOpen(false)
            }
          }}
        >
          <section
            aria-labelledby="pos-confirm-title"
            aria-modal="true"
            className="my-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-lg font-bold text-neutral-950 dark:text-neutral-50"
                  id="pos-confirm-title"
                >
                  Konfirmasi Penjualan POS
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Periksa rincian sebelum transaksi dicatat ke database Supabase.
                </p>
              </div>
              <button
                className="icon-button -mr-1 -mt-1 size-8"
                disabled={isSubmitting}
                onClick={() => setIsCheckoutOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Receipt Review */}
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              {cart.map((item) => {
                const subtotal =
                  parseAmountToCents(item.product.price) * item.quantity
                return (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-neutral-700 dark:text-neutral-300">
                      {item.product.name}{' '}
                      <span className="font-semibold text-neutral-500">
                        × {item.quantity.toString()}
                      </span>
                    </span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {formatCentsToCurrency(subtotal)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Total Pembayaran
              </span>
              <span className="text-xl font-bold text-brand-600 dark:text-brand-400">
                {cartSummary.formattedTotal}
              </span>
            </div>

            {checkoutError && (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                role="alert"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={15} />
                <p className="flex-1">{checkoutError}</p>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="min-h-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                disabled={isSubmitting}
                onClick={() => setIsCheckoutOpen(false)}
                type="button"
              >
                Kembali
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={handleCheckout}
                type="button"
              >
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                {isSubmitting ? 'Memproses...' : 'Konfirmasi & Selesaikan'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Success Struk/Receipt Modal */}
      {lastSuccessReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4">
          <section className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Check size={24} />
              </span>
              <h3 className="mt-3 text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Transaksi Berhasil
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Stok produk telah dikurangi otomatis di Supabase.
              </p>
            </div>

            <div className="my-4 border-y border-dashed border-neutral-200 py-3 text-xs dark:border-neutral-700">
              <div className="flex justify-between text-neutral-500">
                <span>No. Transaksi</span>
                <span className="font-mono text-neutral-800 dark:text-neutral-200">
                  {lastSuccessReceipt.transactionId.slice(0, 13)}...
                </span>
              </div>
              <div className="mt-1 flex justify-between text-neutral-500">
                <span>Waktu</span>
                <span className="text-neutral-800 dark:text-neutral-200">
                  {new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                    timeZone: 'Asia/Jakarta',
                  }).format(lastSuccessReceipt.date)}
                </span>
              </div>
              <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
                {lastSuccessReceipt.items.map((it) => (
                  <div
                    key={it.product.id}
                    className="flex justify-between py-0.5 text-neutral-700 dark:text-neutral-300"
                  >
                    <span className="truncate max-w-[180px]">
                      {it.product.name} × {it.quantity.toString()}
                    </span>
                    <span>
                      {formatCentsToCurrency(
                        parseAmountToCents(it.product.price) * it.quantity,
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t border-neutral-200 pt-2 font-bold text-neutral-900 dark:border-neutral-700 dark:text-neutral-100">
                <span>Total</span>
                <span>{lastSuccessReceipt.formattedTotal}</span>
              </div>
            </div>

            <button
              className="w-full min-h-10 rounded-xl bg-neutral-900 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              onClick={() => setLastSuccessReceipt(null)}
              type="button"
            >
              Tutup & Transaksi Baru
            </button>
          </section>
        </div>
      )}
    </>
  )
}
