import { useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PlugZap,
} from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import {
  checkSupabaseConnection,
  isSupabaseConfigured,
} from '../lib/supabase.js'

const resultMessages = {
  network: 'Tidak dapat menjangkau Supabase. Periksa jaringan dan URL proyek.',
  timeout: 'Pemeriksaan melewati batas waktu. Coba lagi sebentar lagi.',
  'not-configured':
    'Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local, lalu mulai ulang Vite.',
}

export default function SettingsPage() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  async function handleConnectionCheck() {
    setChecking(true)
    setResult(null)

    try {
      const check = await checkSupabaseConnection()

      setResult(
        check.ok
          ? { ok: true, message: 'Supabase Auth API merespons dengan sukses.' }
          : {
              ok: false,
              message:
                resultMessages[check.reason] ??
                `Supabase merespons dengan HTTP ${check.status}. Periksa konfigurasi proyek dan anon key.`,
            },
      )
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? `Pemeriksaan koneksi gagal: ${error.message}`
            : 'Pemeriksaan koneksi gagal karena kesalahan yang tidak diketahui.',
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Periksa konfigurasi dasar koneksi layanan aplikasi."
      />

      <section className="max-w-3xl rounded-xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.02] sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <PlugZap size={21} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Koneksi Supabase
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-neutral-500">
              Pemeriksaan ini hanya mengirim permintaan GET ke endpoint
              kesehatan Auth Supabase. Tidak ada tabel yang dibuat, data yang
              dibaca, atau perubahan database.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm">
            {result ? (
              result.ok ? (
                <CircleCheck
                  className="mt-0.5 shrink-0 text-neutral-600"
                  size={17}
                />
              ) : (
                <CircleAlert
                  className="mt-0.5 shrink-0 text-brand-600"
                  size={17}
                />
              )
            ) : (
              <span className="mt-0.5 size-[17px] shrink-0 rounded-full border border-neutral-300" />
            )}
            <span
              className={
                result?.ok ? 'text-neutral-700' : 'text-neutral-500'
              }
              role={result ? 'status' : undefined}
            >
              {result?.message ??
                (isSupabaseConfigured
                  ? 'Belum ada pemeriksaan koneksi.'
                  : resultMessages['not-configured'])}
            </span>
          </div>

          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleConnectionCheck}
            disabled={checking || !isSupabaseConfigured}
          >
            {checking && <LoaderCircle size={16} className="animate-spin" />}
            {checking ? 'Memeriksa...' : 'Uji koneksi'}
          </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-neutral-400">
          Pemeriksaan ini memastikan Auth API dapat dijangkau; belum menguji
          akses PostgreSQL, tabel, atau kebijakan RLS.
        </p>
      </section>
    </>
  )
}
