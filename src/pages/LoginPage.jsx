import { useState } from 'react'
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext.jsx'

function getLoginErrorMessage(error) {
  const message = error?.message ?? ''
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Email atau password tidak sesuai.'
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Hubungi administrator atau periksa email Anda.'
  }

  if (
    error instanceof TypeError ||
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('fetch')
  ) {
    return 'Tidak dapat menghubungi Supabase. Periksa koneksi internet dan coba lagi.'
  }

  return message || 'Login gagal. Periksa kembali data Anda dan coba lagi.'
}

export default function LoginPage() {
  const { signIn, isConfigured, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    const emailInput = event.currentTarget.elements.namedItem('email')
    if (!email.trim() || !password) {
      setErrorMessage('Masukkan email dan password Anda.')
      return
    }

    if (!emailInput?.validity.valid) {
      setErrorMessage('Masukkan alamat email dengan format yang valid.')
      return
    }

    setIsSubmitting(true)
    const result = await signIn(email, password)
    if (result.error) {
      setErrorMessage(getLoginErrorMessage(result.error))
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 sm:px-6">
      <section className="w-full max-w-[440px] rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-950/[0.04] sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold tracking-tight text-white shadow-sm shadow-brand-600/20">
            SS
          </span>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-neutral-950">
              SmartStock
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
              INVENTORY WORKSPACE
            </p>
          </div>
        </div>

        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">
            Selamat datang
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
            Masuk ke SmartStock
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Gunakan akun yang telah dibuat oleh administrator.
          </p>
        </div>

        {notice && (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900"
            role="alert"
          >
            {notice}
          </div>
        )}

        {!isConfigured && (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900"
            role="alert"
          >
            Supabase belum dikonfigurasi. Isi{' '}
            <code className="font-semibold">VITE_SUPABASE_URL</code> dan{' '}
            <code className="font-semibold">VITE_SUPABASE_ANON_KEY</code>, lalu
            mulai ulang Vite.
          </div>
        )}

        {errorMessage && (
          <div
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-800"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              className="mb-2 block text-sm font-medium text-neutral-700"
              htmlFor="login-email"
            >
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
                aria-hidden="true"
              />
              <input
                id="login-email"
                className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white pl-11 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                type="email"
                name="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck="false"
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={!isConfigured || isSubmitting}
              />
            </div>
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-medium text-neutral-700"
              htmlFor="login-password"
            >
              Password
            </label>
            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
                aria-hidden="true"
              />
              <input
                id="login-password"
                className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white pl-11 pr-12 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Masukkan password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={!isConfigured || isSubmitting}
              />
              <button
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-neutral-400 transition hover:text-neutral-700 focus-visible:text-neutral-700"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                aria-pressed={showPassword}
                disabled={!isConfigured || isSubmitting}
              >
                {showPassword ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={!isConfigured || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle size={17} className="animate-spin" />
                Memeriksa akun...
              </>
            ) : (
              <>
                Masuk
                <ArrowRight size={17} aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 border-t border-neutral-100 pt-5 text-center text-xs leading-5 text-neutral-500">
          Akses hanya tersedia untuk akun yang telah diprovisikan dan memiliki
          profil aktif.
        </p>
      </section>
    </main>
  )
}
