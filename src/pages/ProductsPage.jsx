import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  Check,
  CircleCheck,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE = 1000
const PRODUCT_COLUMNS =
  'id, name, category_id, price, stock, is_active, created_at, updated_at'
const CATEGORY_COLUMNS = 'id, name, is_active'
const MAX_PRICE_CENTS = 999999999999n
const MAX_BIGINT = 9223372036854775807n
const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const integerFormatter = new Intl.NumberFormat('id-ID')
const timestampFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

function getProductErrorMessage(error) {
  if (
    error?.code === '23514' ||
    /category must exist and be active/i.test(error?.message ?? '')
  ) {
    return 'Kategori yang dipilih harus aktif. Pilih kategori aktif lalu coba lagi.'
  }

  if (error?.code === '42501') {
    return 'Aksi ini memerlukan akun dengan profil aktif.'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error?.message === 'string' && error.message) {
    return error.message
  }

  return 'Terjadi kesalahan saat memproses produk.'
}

function sortProducts(products) {
  return [...products].sort((a, b) =>
    a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  )
}

function sortCategories(categories) {
  return [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  )
}

function validatePrice(value) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) {
    return {
      error: 'Harga harus berupa angka nonnegatif dengan maksimal 2 desimal.',
    }
  }

  const wholePart = BigInt(match[1])
  const fractionalPart = BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  const cents = wholePart * 100n + fractionalPart
  if (cents > MAX_PRICE_CENTS) {
    return { error: 'Harga maksimal Rp9.999.999.999,99.' }
  }

  return {
    value: `${wholePart.toString()}.${fractionalPart
      .toString()
      .padStart(2, '0')}`,
  }
}

function StatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isActive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isActive ? 'bg-emerald-500' : 'bg-neutral-400'
        }`}
      />
      {isActive ? 'Aktif' : 'Diarsipkan'}
    </span>
  )
}

function ProductFormDialog({
  product,
  categories,
  name,
  categoryId,
  price,
  initialStock,
  error,
  isSaving,
  onNameChange,
  onCategoryChange,
  onPriceChange,
  onInitialStockChange,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(product)
  const activeCategories = categories.filter((category) => category.is_active)
  const currentCategory = product
    ? categories.find((category) => category.id === product.category_id)
    : null
  const hasCategoryChoices = activeCategories.length > 0 || currentCategory

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
        aria-labelledby="product-form-title"
        aria-modal="true"
        className="my-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-bold tracking-tight text-neutral-950"
              id="product-form-title"
            >
              {isEditing ? 'Edit produk' : 'Tambah produk'}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {isEditing
                ? 'Perbarui informasi produk. Stok tidak dapat diubah di sini.'
                : 'Lengkapi detail produk dan stok awal.'}
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

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="product-name"
            >
              Nama produk <span className="text-brand-600">*</span>
            </label>
            <input
              autoFocus
              className="min-h-10 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="product-name"
              maxLength={255}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Contoh: Air mineral 600 ml"
              required
              value={name}
            />
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="product-category"
            >
              Kategori <span className="text-brand-600">*</span>
            </label>
            <select
              className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="product-category"
              onChange={(event) => onCategoryChange(event.target.value)}
              required
              value={categoryId}
            >
              <option value="" disabled>
                Pilih kategori
              </option>
              {currentCategory && !currentCategory.is_active && (
                <option value={currentCategory.id}>
                  {currentCategory.name} (arsip — kategori saat ini)
                </option>
              )}
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {!hasCategoryChoices && (
              <p className="mt-1.5 text-xs leading-5 text-amber-700">
                Belum ada kategori aktif. Buat atau pulihkan kategori sebelum
                menambahkan produk.
              </p>
            )}
            {currentCategory && !currentCategory.is_active && (
              <p className="mt-1.5 text-xs leading-5 text-neutral-500">
                Kategori produk ini sudah diarsipkan. Pilih kategori aktif
                apabila ingin menggantinya.
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="product-price"
            >
              Harga <span className="text-brand-600">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                Rp
              </span>
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                id="product-price"
                inputMode="decimal"
                max="9999999999.99"
                min="0"
                onChange={(event) => onPriceChange(event.target.value)}
                placeholder="0"
                required
                step="0.01"
                type="number"
                value={price}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Maksimal Rp9.999.999.999,99.
            </p>
          </div>

          {!isEditing && (
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-neutral-700"
                htmlFor="product-initial-stock"
              >
                Stok awal <span className="text-brand-600">*</span>
              </label>
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                id="product-initial-stock"
                inputMode="numeric"
                onChange={(event) => onInitialStockChange(event.target.value)}
                pattern="[0-9]*"
                placeholder="0"
                required
                type="text"
                value={initialStock}
              />
              <p className="mt-1 text-xs leading-5 text-neutral-400">
                Stok awal dicatat oleh sistem sebagai saldo pembukaan.
              </p>
            </div>
          )}

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
              disabled={isSaving || !hasCategoryChoices}
              type="submit"
            >
              {isSaving ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              {isSaving ? 'Menyimpan...' : 'Simpan produk'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ArchiveDialog({ product, isSaving, onClose, onConfirm }) {
  if (!product) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4">
      <section
        aria-labelledby="archive-product-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Archive size={19} />
        </span>
        <h2
          className="mt-4 text-lg font-bold tracking-tight text-neutral-950"
          id="archive-product-title"
        >
          Arsipkan produk?
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Produk <span className="font-semibold">{product.name}</span> akan
          dinonaktifkan dan tidak dihapus.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="min-h-10 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onConfirm}
            type="button"
          >
            {isSaving && <LoaderCircle className="animate-spin" size={16} />}
            {isSaving ? 'Mengarsipkan...' : 'Ya, arsipkan'}
          </button>
        </div>
      </section>
    </div>
  )
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

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogProduct, setDialogProduct] = useState(undefined)
  const [archiveProduct, setArchiveProduct] = useState(null)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [initialStock, setInitialStock] = useState('0')
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const loadData = useCallback(async () => {
    if (!supabase) {
      setLoadError('Supabase belum dikonfigurasi.')
      setLoadState('error')
      return
    }

    setLoadState('loading')
    setLoadError('')

    try {
      const [productRows, categoryRows] = await Promise.all([
        fetchAllPages(
          () => supabase.from('products').select(PRODUCT_COLUMNS),
          'produk',
        ),
        fetchAllPages(
          () => supabase.from('categories').select(CATEGORY_COLUMNS),
          'kategori',
        ),
      ])

      setProducts(sortProducts(productRows))
      setCategories(sortCategories(categoryRows))
      setLoadState('loaded')
    } catch (error) {
      setLoadError(getProductErrorMessage(error))
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!feedback) {
      return undefined
    }

    const timer = window.setTimeout(() => setFeedback(null), 4500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')

    return products.filter((product) => {
      const matchesSearch = product.name
        .toLocaleLowerCase('id-ID')
        .includes(query)
      const matchesCategory =
        categoryFilter === 'all' || product.category_id === categoryFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && product.is_active) ||
        (statusFilter === 'archived' && !product.is_active)

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [products, search, categoryFilter, statusFilter])

  function openForm(product = null) {
    setDialogProduct(product)
    setName(product?.name ?? '')
    setCategoryId(product?.category_id ?? '')
    setPrice(product?.price === undefined ? '' : String(product.price))
    setInitialStock('0')
    setFormError('')
  }

  function closeForm() {
    if (!formSaving) {
      setDialogProduct(undefined)
      setFormError('')
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    const cleanName = name.trim()

    if (!cleanName) {
      setFormError('Nama produk wajib diisi.')
      return
    }

    if (cleanName.length > 255) {
      setFormError('Nama produk maksimal 255 karakter.')
      return
    }

    const selectedCategory = categories.find(
      (category) => category.id === categoryId,
    )
    if (!selectedCategory) {
      setFormError('Pilih kategori produk.')
      return
    }

    if (
      !selectedCategory.is_active &&
      selectedCategory.id !== dialogProduct?.category_id
    ) {
      setFormError('Kategori baru harus aktif.')
      return
    }

    const priceResult = validatePrice(price)
    if (priceResult.error) {
      setFormError(priceResult.error)
      return
    }

    let initialStockValue = '0'
    if (!dialogProduct) {
      const stockText = initialStock.trim()
      if (!/^\d+$/.test(stockText)) {
        setFormError('Stok awal harus berupa bilangan bulat nonnegatif.')
        return
      }

      if (BigInt(stockText) > MAX_BIGINT) {
        setFormError('Stok awal melebihi batas nilai yang didukung.')
        return
      }

      initialStockValue = BigInt(stockText).toString()
    }

    if (!supabase) {
      setFormError('Supabase belum dikonfigurasi.')
      return
    }

    setFormSaving(true)
    setFormError('')
    setFeedback(null)

    try {
      if (dialogProduct) {
        const { data, error } = await supabase
          .from('products')
          .update({
            name: cleanName,
            category_id: selectedCategory.id,
            price: priceResult.value,
          })
          .eq('id', dialogProduct.id)
          .select(PRODUCT_COLUMNS)
          .single()

        if (error) {
          throw error
        }

        setProducts((current) =>
          sortProducts(current.map((item) => (item.id === data.id ? data : item))),
        )
        setDialogProduct(undefined)
        setFeedback({
          type: 'success',
          message: 'Produk berhasil diperbarui.',
        })
      } else {
        const { data: productId, error } = await supabase.rpc(
          'create_product',
          {
            p_name: cleanName,
            p_category_id: selectedCategory.id,
            p_price: priceResult.value,
            p_initial_stock: initialStockValue,
          },
        )

        if (error) {
          throw error
        }
        if (!productId) {
          throw new Error('Supabase tidak mengembalikan ID produk baru.')
        }

        setDialogProduct(undefined)
        await loadData()
        setFeedback({
          type: 'success',
          message:
            BigInt(initialStockValue) > 0n
              ? 'Produk berhasil dibuat dan stok awal dicatat sebagai saldo pembukaan.'
              : 'Produk berhasil dibuat.',
        })
      }
    } catch (error) {
      setFormError(getProductErrorMessage(error))
    } finally {
      setFormSaving(false)
    }
  }

  async function updateProductStatus(product, isActive) {
    if (!supabase) {
      setFeedback({
        type: 'error',
        message: 'Supabase belum dikonfigurasi.',
      })
      return
    }

    setProcessingId(product.id)
    setFeedback(null)

    try {
      const { data, error } = await supabase
        .from('products')
        .update({ is_active: isActive })
        .eq('id', product.id)
        .select(PRODUCT_COLUMNS)
        .single()

      if (error) {
        throw error
      }

      setProducts((current) =>
        sortProducts(current.map((item) => (item.id === data.id ? data : item))),
      )
      setArchiveProduct(null)
      setFeedback({
        type: 'success',
        message: isActive
          ? 'Produk berhasil dipulihkan.'
          : 'Produk berhasil diarsipkan.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getProductErrorMessage(error),
      })
    } finally {
      setProcessingId(null)
    }
  }

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  return (
    <>
      <PageHeader
        title="Produk"
        description="Kelola katalog produk, harga, dan status persediaan."
      />

      <div className="-mt-3 mb-5 flex justify-end sm:-mt-4">
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          onClick={() => openForm()}
          type="button"
        >
          <Plus size={17} />
          Tambah produk
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

      {loadState === 'error' ? (
        <section
          className="rounded-xl border border-red-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.02] sm:p-6"
          role="alert"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <AlertCircle size={20} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-neutral-900">
            Produk belum dapat dimuat
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-neutral-600">
            {loadError}
          </p>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            onClick={() => void loadData()}
            type="button"
          >
            <RefreshCw size={16} />
            Coba lagi
          </button>
        </section>
      ) : (
        <>
          <section
            aria-label="Pencarian dan filter produk"
            className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm shadow-neutral-950/[0.02] sm:flex-row sm:items-center sm:p-4"
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari nama produk</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={17}
              />
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama produk..."
                type="search"
                value={search}
              />
            </label>
            <label className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-neutral-600">
                Kategori
              </span>
              <select
                className="min-h-10 max-w-48 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setCategoryFilter(event.target.value)}
                value={categoryFilter}
              >
                <option value="all">Semua kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {!category.is_active ? ' (arsip)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-neutral-600">
                Status
              </span>
              <select
                className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="all">Semua</option>
                <option value="active">Aktif</option>
                <option value="archived">Diarsipkan</option>
              </select>
            </label>
          </section>

          <section
            aria-busy={loadState === 'loading'}
            aria-label="Daftar produk"
            className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-950/[0.02]"
          >
            {loadState === 'loading' ? (
              <div
                className="flex min-h-64 flex-col items-center justify-center"
                role="status"
              >
                <LoaderCircle
                  className="animate-spin text-brand-600"
                  size={24}
                />
                <p className="mt-3 text-sm font-medium text-neutral-600">
                  Memuat produk...
                </p>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState
                  icon={Package}
                  title={
                    products.length === 0
                      ? 'Belum ada produk'
                      : 'Produk tidak ditemukan'
                  }
                  description={
                    products.length === 0
                      ? 'Tambahkan produk pertama ke katalog.'
                      : 'Coba ubah kata pencarian atau filter.'
                  }
                  compact
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Produk
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Kategori
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Harga
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Stok
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Diperbarui
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {visibleProducts.map((product) => {
                      const category = categoriesById.get(product.category_id)
                      const isProcessing = processingId === product.id

                      return (
                        <tr
                          className="transition-colors hover:bg-neutral-50/70"
                          key={product.id}
                        >
                          <td className="px-4 py-4 sm:px-5">
                            <p className="text-sm font-semibold text-neutral-900">
                              {product.name}
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">
                              Dibuat{' '}
                              {timestampFormatter.format(
                                new Date(product.created_at),
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-sm text-neutral-600 sm:px-5">
                            {category?.name ?? 'Kategori tidak tersedia'}
                            {category && !category.is_active && (
                              <span className="ml-1 text-xs text-neutral-400">
                                (arsip)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-medium text-neutral-800 sm:px-5">
                            {currencyFormatter.format(Number(product.price))}
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-neutral-700 sm:px-5">
                            {integerFormatter.format(BigInt(product.stock))}
                          </td>
                          <td className="px-4 py-4 sm:px-5">
                            <StatusBadge isActive={product.is_active} />
                          </td>
                          <td className="px-4 py-4 text-sm text-neutral-600 sm:px-5">
                            {timestampFormatter.format(
                              new Date(product.updated_at),
                            )}
                          </td>
                          <td className="px-4 py-4 sm:px-5">
                            <div className="flex justify-end gap-1">
                              <button
                                aria-label={`Edit produk ${product.name}`}
                                className="icon-button disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={Boolean(processingId)}
                                onClick={() => openForm(product)}
                                title="Edit produk"
                                type="button"
                              >
                                <Pencil size={17} />
                              </button>
                              {product.is_active ? (
                                <button
                                  aria-label={`Arsipkan produk ${product.name}`}
                                  className="icon-button text-neutral-500 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={Boolean(processingId)}
                                  onClick={() => setArchiveProduct(product)}
                                  title="Arsipkan produk"
                                  type="button"
                                >
                                  <Archive size={17} />
                                </button>
                              ) : (
                                <button
                                  aria-label={`Pulihkan produk ${product.name}`}
                                  className="icon-button text-neutral-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={Boolean(processingId)}
                                  onClick={() =>
                                    void updateProductStatus(product, true)
                                  }
                                  title="Pulihkan produk"
                                  type="button"
                                >
                                  {isProcessing ? (
                                    <LoaderCircle
                                      className="animate-spin"
                                      size={17}
                                    />
                                  ) : (
                                    <RefreshCw size={17} />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500 sm:px-5">
                  Menampilkan {visibleProducts.length} dari {products.length}{' '}
                  produk
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {dialogProduct !== undefined && (
        <ProductFormDialog
          categories={categories}
          categoryId={categoryId}
          error={formError}
          initialStock={initialStock}
          isSaving={formSaving}
          name={name}
          onCategoryChange={(value) => {
            setCategoryId(value)
            if (formError) {
              setFormError('')
            }
          }}
          onClose={closeForm}
          onInitialStockChange={setInitialStock}
          onNameChange={(value) => {
            setName(value)
            if (formError) {
              setFormError('')
            }
          }}
          onPriceChange={(value) => {
            setPrice(value)
            if (formError) {
              setFormError('')
            }
          }}
          onSubmit={handleFormSubmit}
          price={price}
          product={dialogProduct}
        />
      )}
      <ArchiveDialog
        isSaving={processingId === archiveProduct?.id}
        onClose={() => {
          if (!processingId) {
            setArchiveProduct(null)
          }
        }}
        onConfirm={() => {
          if (archiveProduct) {
            void updateProductStatus(archiveProduct, false)
          }
        }}
        product={archiveProduct}
      />
    </>
  )
}
