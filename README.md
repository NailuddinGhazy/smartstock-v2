# SmartStock V2

Kerangka frontend SmartStock menggunakan React, Vite, Tailwind CSS, dan Supabase JavaScript Client. Tahap ini hanya menyiapkan struktur aplikasi dan halaman; belum ada CRUD, transaksi, autentikasi, atau query data bisnis.

## Persyaratan

- Node.js 20.19+ atau 22.12+
- npm
- Proyek Supabase untuk konfigurasi koneksi (opsional untuk menjalankan kerangka UI)

## Menjalankan lokal

```powershell
npm install
Copy-Item .env.example .env.local
```

Isi `.env.local` dengan URL proyek dan publishable key Supabase:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Jalankan server pengembangan:

```powershell
npm run dev
```

Untuk uji koneksi, buka menu **Pengaturan** lalu pilih **Uji koneksi**. Pemeriksaan mengirim GET ke endpoint Auth health dan tidak membaca atau mengubah tabel/database. Pemeriksaan ini memverifikasi ketersediaan Auth API, bukan akses PostgreSQL atau RLS.

Perintah lain:

```powershell
npm run build
npm run preview
```

## Dependency

- `react` dan `react-dom`: antarmuka React.
- `vite` dan `@vitejs/plugin-react`: server pengembangan dan build aplikasi.
- `tailwindcss` dan `@tailwindcss/vite`: styling utility-first dengan integrasi Vite.
- `@supabase/supabase-js`: Supabase client dan pemeriksaan ketersediaan Auth API; belum ada query data bisnis.
- `lucide-react`: ikon navigasi dan komponen dasar.

## Konfigurasi keamanan

Variabel `VITE_*` masuk ke bundle frontend dan dapat dilihat pengguna. Hanya gunakan anon/publishable key yang aman untuk client dan lindungi data menggunakan Row Level Security. Jangan pernah mengisi `service_role` atau secret key pada variabel frontend.

Untuk deployment, impor repositori ini ke Vercel dengan root directory proyek. Build command dan output directory juga tercantum di `vercel.json`. Tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` pada environment variables Vercel bila koneksi Supabase akan diaktifkan.

## Struktur

```text
docs/
  ANALISIS-SMARTSTOCK-V1.md
src/
  components/     Komponen layout dan UI reusable
  lib/            Integrasi client eksternal
  pages/          Kerangka halaman aplikasi
  App.jsx         Navigasi halaman dan layout utama
  index.css       Design tokens warna dan Tailwind CSS
  main.jsx        Bootstrap aplikasi React
index.html
vite.config.js
vercel.json
```
