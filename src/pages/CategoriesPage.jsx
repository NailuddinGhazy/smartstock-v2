import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  Check,
  CircleCheck,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  X,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { supabase } from '../lib/supabase.js'

const CATEGORY_COLUMNS =
  'id, name, description, is_active, created_at, updated_at'
const timestampFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

function getCategoryErrorMessage(error) {
  if (
    error?.code === '23505' ||
    error?.message?.includes('categories_name_normalized_uidx')
  ) {
    return 'Nama kategori sudah digunakan. Gunakan nama yang berbeda.'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error?.message === 'string' && error.message) {
    return error.message
  }

  return 'Terjadi kesalahan saat memproses kategori.'
}

function sortCategories(categories) {
  return [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  )
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

function CategoryFormDialog({
  category,
  name,
  description,
  error,
  isSaving,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}) {
  const isEditing = Boolean(category)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isSaving) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="category-form-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-bold tracking-tight text-neutral-950"
              id="category-form-title"
            >
              {isEditing ? 'Edit kategori' : 'Tambah kategori'}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {isEditing
                ? 'Perbarui nama atau deskripsi kategori.'
                : 'Buat kategori untuk mengelompokkan produk.'}
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
              htmlFor="category-name"
            >
              Nama kategori <span className="text-brand-600">*</span>
            </label>
            <input
              autoFocus
              className="min-h-10 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="category-name"
              maxLength={255}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Contoh: Minuman"
              required
              value={name}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Maksimal 255 karakter.
            </p>
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-neutral-700"
              htmlFor="category-description"
            >
              Deskripsi
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              id="category-description"
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Keterangan kategori (opsional)"
              rows={3}
              value={description}
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
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              {isSaving ? 'Menyimpan...' : 'Simpan kategori'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ArchiveDialog({ category, isSaving, onClose, onConfirm }) {
  if (!category) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4">
      <section
        aria-labelledby="archive-category-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 sm:p-6"
        role="dialog"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Archive size={19} />
        </span>
        <h2
          className="mt-4 text-lg font-bold tracking-tight text-neutral-950"
          id="archive-category-title"
        >
          Arsipkan kategori?
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Kategori <span className="font-semibold">{category.name}</span> akan
          dinonaktifkan dan tidak dihapus. Kategori dapat diaktifkan kembali
          kapan saja.
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

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogCategory, setDialogCategory] = useState(undefined)
  const [archiveCategory, setArchiveCategory] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const loadCategories = useCallback(async () => {
    if (!supabase) {
      setLoadError('Supabase belum dikonfigurasi.')
      setLoadState('error')
      return
    }

    setLoadState('loading')
    setLoadError('')

    try {
      const { data, error } = await supabase
        .from('categories')
        .select(CATEGORY_COLUMNS)
        .order('name', { ascending: true })

      if (error) {
        throw error
      }

      setCategories(data)
      setLoadState('loaded')
    } catch (error) {
      setLoadError(getCategoryErrorMessage(error))
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    if (!feedback) {
      return undefined
    }

    const timer = window.setTimeout(() => setFeedback(null), 4500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')

    return categories.filter((category) => {
      const matchesSearch = category.name
        .toLocaleLowerCase('id-ID')
        .includes(query)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && category.is_active) ||
        (statusFilter === 'archived' && !category.is_active)

      return matchesSearch && matchesStatus
    })
  }, [categories, search, statusFilter])

  function openForm(category = null) {
    setDialogCategory(category)
    setName(category?.name ?? '')
    setDescription(category?.description ?? '')
    setFormError('')
  }

  function closeForm() {
    if (!formSaving) {
      setDialogCategory(undefined)
      setFormError('')
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    const cleanName = name.trim()

    if (!cleanName) {
      setFormError('Nama kategori wajib diisi.')
      return
    }

    if (cleanName.length > 255) {
      setFormError('Nama kategori maksimal 255 karakter.')
      return
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== dialogCategory?.id &&
        category.name.trim().toLocaleLowerCase('id-ID') ===
          cleanName.toLocaleLowerCase('id-ID'),
    )
    if (duplicate) {
      setFormError('Nama kategori sudah digunakan. Gunakan nama yang berbeda.')
      return
    }

    if (!supabase) {
      setFormError('Supabase belum dikonfigurasi.')
      return
    }

    setFormSaving(true)
    setFormError('')
    setFeedback(null)
    const values = {
      name: cleanName,
      description: description.trim() || null,
    }

    try {
      const response = dialogCategory
        ? await supabase
            .from('categories')
            .update(values)
            .eq('id', dialogCategory.id)
            .select(CATEGORY_COLUMNS)
            .single()
        : await supabase
            .from('categories')
            .insert(values)
            .select(CATEGORY_COLUMNS)
            .single()

      if (response.error) {
        throw response.error
      }

      const savedCategory = response.data
      setCategories((current) =>
        sortCategories([
          ...current.filter((item) => item.id !== savedCategory.id),
          savedCategory,
        ]),
      )
      setDialogCategory(undefined)
      setFeedback({
        type: 'success',
        message: dialogCategory
          ? 'Kategori berhasil diperbarui.'
          : 'Kategori berhasil ditambahkan.',
      })
    } catch (error) {
      setFormError(getCategoryErrorMessage(error))
    } finally {
      setFormSaving(false)
    }
  }

  async function updateCategoryStatus(category, isActive) {
    if (!supabase) {
      setFeedback({
        type: 'error',
        message: 'Supabase belum dikonfigurasi.',
      })
      return
    }

    setProcessingId(category.id)
    setFeedback(null)

    try {
      const { data, error } = await supabase
        .from('categories')
        .update({ is_active: isActive })
        .eq('id', category.id)
        .select(CATEGORY_COLUMNS)
        .single()

      if (error) {
        throw error
      }

      setCategories((current) =>
        sortCategories(current.map((item) => (item.id === data.id ? data : item))),
      )
      setArchiveCategory(null)
      setFeedback({
        type: 'success',
        message: isActive
          ? 'Kategori berhasil dipulihkan.'
          : 'Kategori berhasil diarsipkan.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getCategoryErrorMessage(error),
      })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Kategori"
        description="Kelola kategori untuk mengelompokkan produk."
      />

      <div className="-mt-3 mb-5 flex justify-end sm:-mt-4">
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          onClick={() => openForm()}
          type="button"
        >
          <Plus size={17} />
          Tambah kategori
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
            Kategori belum dapat dimuat
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-neutral-600">
            {loadError}
          </p>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            onClick={() => void loadCategories()}
            type="button"
          >
            <RefreshCw size={16} />
            Coba lagi
          </button>
        </section>
      ) : (
        <>
          <section
            aria-label="Pencarian dan filter kategori"
            className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm shadow-neutral-950/[0.02] sm:flex-row sm:items-center sm:p-4"
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari nama kategori</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={17}
              />
              <input
                className="min-h-10 w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama kategori..."
                type="search"
                value={search}
              />
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
                <option value="all">Semua kategori</option>
                <option value="active">Aktif</option>
                <option value="archived">Diarsipkan</option>
              </select>
            </label>
          </section>

          <section
            aria-busy={loadState === 'loading'}
            aria-label="Daftar kategori"
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
                  Memuat kategori...
                </p>
              </div>
            ) : visibleCategories.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState
                  icon={Tags}
                  title={
                    categories.length === 0
                      ? 'Belum ada kategori'
                      : 'Kategori tidak ditemukan'
                  }
                  description={
                    categories.length === 0
                      ? 'Tambahkan kategori pertama untuk mulai mengelompokkan produk.'
                      : 'Coba ubah kata pencarian atau filter status.'
                  }
                  compact
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Kategori
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                        Deskripsi
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
                    {visibleCategories.map((category) => {
                      const isProcessing = processingId === category.id

                      return (
                        <tr
                          className="transition-colors hover:bg-neutral-50/70"
                          key={category.id}
                        >
                          <td className="px-4 py-4 sm:px-5">
                            <p className="text-sm font-semibold text-neutral-900">
                              {category.name}
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">
                              Dibuat{' '}
                              {timestampFormatter.format(
                                new Date(category.created_at),
                              )}
                            </p>
                          </td>
                          <td className="max-w-sm px-4 py-4 text-sm leading-5 text-neutral-600 sm:px-5">
                            {category.description || (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 sm:px-5">
                            <StatusBadge isActive={category.is_active} />
                          </td>
                          <td className="px-4 py-4 text-sm text-neutral-600 sm:px-5">
                            {timestampFormatter.format(
                              new Date(category.updated_at),
                            )}
                          </td>
                          <td className="px-4 py-4 sm:px-5">
                            <div className="flex justify-end gap-1">
                              <button
                                aria-label={`Edit kategori ${category.name}`}
                                className="icon-button disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={Boolean(processingId)}
                                onClick={() => openForm(category)}
                                title="Edit kategori"
                                type="button"
                              >
                                <Pencil size={17} />
                              </button>
                              {category.is_active ? (
                                <button
                                  aria-label={`Arsipkan kategori ${category.name}`}
                                  className="icon-button text-neutral-500 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={Boolean(processingId)}
                                  onClick={() => setArchiveCategory(category)}
                                  title="Arsipkan kategori"
                                  type="button"
                                >
                                  <Archive size={17} />
                                </button>
                              ) : (
                                <button
                                  aria-label={`Pulihkan kategori ${category.name}`}
                                  className="icon-button text-neutral-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={Boolean(processingId)}
                                  onClick={() =>
                                    void updateCategoryStatus(category, true)
                                  }
                                  title="Aktifkan kembali"
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
                  Menampilkan {visibleCategories.length} dari {categories.length}{' '}
                  kategori
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {dialogCategory !== undefined && (
        <CategoryFormDialog
          category={dialogCategory}
          description={description}
          error={formError}
          isSaving={formSaving}
          name={name}
          onClose={closeForm}
          onDescriptionChange={setDescription}
          onNameChange={(value) => {
            setName(value)
            if (formError) {
              setFormError('')
            }
          }}
          onSubmit={handleFormSubmit}
        />
      )}
      <ArchiveDialog
        category={archiveCategory}
        isSaving={processingId === archiveCategory?.id}
        onClose={() => {
          if (!processingId) {
            setArchiveCategory(null)
          }
        }}
        onConfirm={() => {
          if (archiveCategory) {
            void updateCategoryStatus(archiveCategory, false)
          }
        }}
      />
    </>
  )
}
