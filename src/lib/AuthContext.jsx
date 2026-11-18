import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { isSupabaseConfigured, supabase } from './supabase.js'

const AuthContext = createContext(null)

const deniedMessage =
  'Akun ini belum memiliki profil aktif. Hubungi administrator untuk mendapatkan akses.'

const unauthenticatedState = (notice = null) => ({
  status: 'unauthenticated',
  session: null,
  user: null,
  profile: null,
  error: null,
  notice,
})

function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error?.message === 'string' && error.message) {
    return error.message
  }

  return fallback
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() =>
    isSupabaseConfigured
      ? {
          status: 'loading',
          session: null,
          user: null,
          profile: null,
          error: null,
          notice: null,
        }
      : {
          ...unauthenticatedState(),
          status: 'configuration-error',
          error:
            'Konfigurasi Supabase belum lengkap. Atur VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.',
        },
  )
  const authStateRef = useRef(authState)
  const isMountedRef = useRef(false)
  const revisionRef = useRef(0)
  const profileRequestRef = useRef(null)
  const resolveSessionRef = useRef(null)

  const updateAuthState = useCallback((nextState) => {
    authStateRef.current = nextState
    setAuthState(nextState)
  }, [])

  const resolveSession = useCallback(
    async (session, revision) => {
      if (!isMountedRef.current || revision !== revisionRef.current) {
        return
      }

      if (!session) {
        profileRequestRef.current = null
        updateAuthState(unauthenticatedState(authStateRef.current.notice))
        return
      }

      const currentState = authStateRef.current
      if (
        currentState.status === 'authenticated' &&
        currentState.session?.access_token === session.access_token
      ) {
        return
      }

      updateAuthState({
        status: 'checking-profile',
        session,
        user: session.user,
        profile: null,
        error: null,
        notice: currentState.notice,
      })

      let request = profileRequestRef.current
      if (request?.accessToken !== session.access_token) {
        request = {
          accessToken: session.access_token,
          promise: supabase
            .from('profiles')
            .select('id, display_name, is_active')
            .eq('id', session.user.id)
            .maybeSingle()
            .then(({ data, error }) => ({ data, error }))
            .catch((error) => ({ data: null, error })),
        }
        profileRequestRef.current = request
      }

      const { data: profile, error } = await request.promise

      if (!isMountedRef.current || revision !== revisionRef.current) {
        return
      }

      if (error) {
        profileRequestRef.current = null
        updateAuthState({
          status: 'profile-error',
          session,
          user: session.user,
          profile: null,
          error: getErrorMessage(
            error,
            'Profil tidak dapat diperiksa karena terjadi gangguan sementara.',
          ),
          notice: null,
        })
        return
      }

      if (!profile || profile.is_active !== true) {
        profileRequestRef.current = null
        const deniedState = {
          status: 'access-denied',
          session,
          user: session.user,
          profile: null,
          error: null,
          notice: deniedMessage,
        }
        updateAuthState(deniedState)

        try {
          const { error: signOutError } = await supabase.auth.signOut({
            scope: 'local',
          })

          if (!isMountedRef.current || revision !== revisionRef.current) {
            return
          }

          if (signOutError) {
            updateAuthState({
              ...deniedState,
              error: `Sesi belum dapat dihapus: ${getErrorMessage(
                signOutError,
                'Terjadi kesalahan saat keluar.',
              )}`,
            })
            return
          }

          updateAuthState(unauthenticatedState(deniedMessage))
        } catch (signOutError) {
          if (isMountedRef.current && revision === revisionRef.current) {
            updateAuthState({
              ...deniedState,
              error: `Sesi belum dapat dihapus: ${getErrorMessage(
                signOutError,
                'Terjadi kesalahan saat keluar.',
              )}`,
            })
          }
        }

        return
      }

      updateAuthState({
        status: 'authenticated',
        session,
        user: session.user,
        profile,
        error: null,
        notice: null,
      })
    },
    [updateAuthState],
  )

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      return undefined
    }

    isMountedRef.current = true
    const scheduledEvents = new Set()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        return
      }

      const revision = ++revisionRef.current
      const timer = window.setTimeout(() => {
        scheduledEvents.delete(timer)
        void resolveSession(session, revision)
      }, 0)
      scheduledEvents.add(timer)
    })

    resolveSessionRef.current = resolveSession
    const initialRevision = revisionRef.current

    async function loadInitialSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (
          !isMountedRef.current ||
          initialRevision !== revisionRef.current
        ) {
          return
        }

        if (error) {
          updateAuthState({
            ...unauthenticatedState(),
            status: 'session-error',
            error: getErrorMessage(
              error,
              'Sesi belum dapat diperiksa. Coba lagi.',
            ),
          })
          return
        }

        const revision = ++revisionRef.current
        void resolveSession(data.session, revision)
      } catch (error) {
        if (
          isMountedRef.current &&
          initialRevision === revisionRef.current
        ) {
          updateAuthState({
            ...unauthenticatedState(),
            status: 'session-error',
            error: getErrorMessage(
              error,
              'Sesi belum dapat diperiksa. Coba lagi.',
            ),
          })
        }
      }
    }

    void loadInitialSession()

    return () => {
      isMountedRef.current = false
      revisionRef.current += 1
      scheduledEvents.forEach((timer) => window.clearTimeout(timer))
      scheduledEvents.clear()
      subscription.unsubscribe()
      resolveSessionRef.current = null
      profileRequestRef.current = null
    }
  }, [resolveSession, updateAuthState])

  const signIn = useCallback(
    async (email, password) => {
      if (!supabase || !isSupabaseConfigured) {
        return {
          error: new Error(
            'Konfigurasi Supabase belum lengkap. Periksa environment variables.',
          ),
        }
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) {
          return { error }
        }

        if (!data.session) {
          return {
            error: new Error(
              'Supabase tidak mengembalikan sesi login. Coba lagi.',
            ),
          }
        }

        const currentState = authStateRef.current
        if (
          currentState.session?.access_token !== data.session.access_token ||
          !['checking-profile', 'authenticated'].includes(currentState.status)
        ) {
          const revision = ++revisionRef.current
          updateAuthState({
            status: 'checking-profile',
            session: data.session,
            user: data.user,
            profile: null,
            error: null,
            notice: null,
          })
          void resolveSessionRef.current?.(data.session, revision)
        }

        return { error: null }
      } catch (error) {
        return { error }
      }
    },
    [updateAuthState],
  )

  const signOut = useCallback(
    async ({ preserveNotice = false } = {}) => {
      if (!supabase) {
        return { error: new Error('Supabase belum dikonfigurasi.') }
      }

      const previousState = authStateRef.current
      const notice = preserveNotice ? previousState.notice : null
      revisionRef.current += 1
      profileRequestRef.current = null
      updateAuthState({
        ...previousState,
        status: 'signing-out',
        error: null,
        notice,
      })

      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' })

        if (error) {
          if (authStateRef.current.status === 'unauthenticated') {
            return { error: null }
          }

          updateAuthState({
            ...previousState,
            error: `Tidak dapat keluar: ${getErrorMessage(
              error,
              'Terjadi kesalahan saat keluar.',
            )}`,
            notice,
          })
          return { error }
        }

        updateAuthState(unauthenticatedState(notice))
        return { error: null }
      } catch (error) {
        if (authStateRef.current.status === 'unauthenticated') {
          return { error: null }
        }

        updateAuthState({
          ...previousState,
          error: `Tidak dapat keluar: ${getErrorMessage(
            error,
            'Terjadi kesalahan saat keluar.',
          )}`,
          notice,
        })
        return { error }
      }
    },
    [updateAuthState],
  )

  const retrySessionCheck = useCallback(async () => {
    if (!supabase) {
      return
    }

    const revision = ++revisionRef.current
    profileRequestRef.current = null
    updateAuthState({
      ...unauthenticatedState(),
      status: 'loading',
    })

    try {
      const { data, error } = await supabase.auth.getSession()

      if (!isMountedRef.current || revision !== revisionRef.current) {
        return
      }

      if (error) {
        updateAuthState({
          ...unauthenticatedState(),
          status: 'session-error',
          error: getErrorMessage(error, 'Sesi belum dapat diperiksa. Coba lagi.'),
        })
        return
      }

      const nextRevision = ++revisionRef.current
      void resolveSession(data.session, nextRevision)
    } catch (error) {
      if (isMountedRef.current && revision === revisionRef.current) {
        updateAuthState({
          ...unauthenticatedState(),
          status: 'session-error',
          error: getErrorMessage(error, 'Sesi belum dapat diperiksa. Coba lagi.'),
        })
      }
    }
  }, [resolveSession, updateAuthState])

  const retryProfileCheck = useCallback(() => {
    const session = authStateRef.current.session
    if (!session) {
      void retrySessionCheck()
      return
    }

    const revision = ++revisionRef.current
    profileRequestRef.current = null
    void resolveSession(session, revision)
  }, [resolveSession, retrySessionCheck])

  const value = useMemo(
    () => ({
      ...authState,
      signIn,
      signOut,
      retrySessionCheck,
      retryProfileCheck,
      isConfigured: isSupabaseConfigured,
    }),
    [
      authState,
      signIn,
      signOut,
      retrySessionCheck,
      retryProfileCheck,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
