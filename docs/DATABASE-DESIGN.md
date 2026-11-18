# Desain Database SmartStock V2

Dokumen ini menetapkan desain database SmartStock V2 untuk satu toko per instalasi Supabase. Semua pengguna yang berhasil login dan memiliki profil aktif memiliki hak akses aplikasi yang sama. Ini adalah dokumen desain; SQL hanya dijalankan jika migration disetujui dan diterapkan secara terpisah.

## 1. Tujuan dan asumsi

- Satu instalasi menggunakan satu proyek Supabase untuk satu toko.
- Setiap pengguna/deployment mengatur proyek dan kredensial Supabase sendiri.
- Jumlah akun pengguna tidak dibatasi oleh jabatan; aplikasi tidak memiliki role atau hierarki hak akses.
- Semua pengguna yang berhasil login dan memiliki profil aktif memperoleh hak akses aplikasi yang sama.
- Tidak ada `store_id` atau isolasi tenant di dalam skema ini.
- Setiap pengguna aktif dapat membaca seluruh transaksi, item transaksi, dan stock movements, tetapi hanya profilnya sendiri.
- Produk/kategori diarsipkan, bukan dihapus melalui aplikasi. Transaksi, item, dan stock movement immutable.
- Produk dan kategori aktif maupun arsip dapat dibaca pengguna aktif. Produk arsip tidak dapat dijual, tetapi stoknya tetap dapat disesuaikan melalui RPC.
- Waktu laporan/tampilan menggunakan `Asia/Jakarta`; mata uang instalasi adalah IDR.
- RLS dan grant PostgreSQL menjadi batas keamanan; menyembunyikan menu atau tombol di React bukan kontrol akses.
- Supabase Auth menangani identitas dan kredensial; tabel aplikasi tidak menyimpan password atau menyalin tabel session Laravel.

## 2. Fakta V1 yang menjadi dasar

Fakta berikut berasal dari [analisis SmartStock V1](./ANALISIS-SMARTSTOCK-V1.md), yang memeriksa migrasi, model, route API, dan implementasi frontend V1:

- Tabel bisnis V1 adalah `products`, `transactions`, dan `transaction_details`; tidak ada tabel kategori.
- Produk memiliki nama, kategori teks (default database `Umum`), harga `DECIMAL(12,2)`, stok unsigned integer default `0`, dan timestamps. Endpoint create/update tetap mewajibkan nama, kategori, harga numerik ≥ 0, dan stok integer ≥ 0.
- Transaksi menyimpan total `DECIMAL(12,2)` dan timestamps. V1 tidak menghubungkan transaksi dengan pengguna atau toko.
- Detail transaksi menyimpan FK transaksi/produk, kuantitas positif, harga dan subtotal transaksi. FK detail ke transaksi cascade saat transaksi dihapus; FK detail ke produk membatasi penghapusan produk.
- Payload transaksi V1 harus memiliki minimal satu item, ID produk valid dan unik dalam payload, serta kuantitas integer positif. Backend menghitung harga dari database, memvalidasi stok terkini, menyimpan header/detail dan mengurangi stok dalam satu transaksi database.
- Detail V1 menyimpan snapshot harga, tetapi nama produk di riwayat/nota diperoleh dari relasi produk saat ini.
- Penanda stok menipis memakai batas `≤ 5`. UI mengubah stok manual per satu unit; data perubahan stok manual tidak dicatat sebagai ledger.
- V1 memakai autentikasi sesi Laravel/Sanctum. Kode yang diperiksa tidak mempunyai kontrol aplikasi berdasarkan jabatan.

## 3. Rekomendasi tipe dan konvensi

Semua bagian di bawah ini adalah rekomendasi V2, bukan fakta V1.

- Gunakan UUID untuk PK aplikasi dengan default `gen_random_uuid()`. `profiles.id` memakai UUID yang sama dengan `auth.users.id`.
- Gunakan `numeric(12,2)` untuk nilai uang, sama dengan presisi V1. Nilai ini dibatasi check non-negatif; gunakan `bigint` untuk stok/kuantitas dan check non-negatif/positif karena PostgreSQL tidak memiliki unsigned integer.
- Gunakan `timestamptz NOT NULL DEFAULT now()` untuk waktu. PostgreSQL menyimpan waktu absolut; bentuk rentang laporan pada zona `Asia/Jakarta`, konversikan batasnya ke `timestamptz`, dan tampilkan waktu dalam `Asia/Jakarta`, tidak mengikuti zona waktu browser.
- Mata uang tetap `IDR` untuk satu instalasi. Gunakan `numeric(12,2)` untuk nilai uang; tidak diperlukan kolom mata uang per transaksi.
- Tabel bisnis berada di schema `public` untuk akses melalui Supabase Data API. Helper otorisasi ditempatkan di schema `internal` yang tidak diekspos.
- `anon` dan `authenticated` adalah principal API Supabase, bukan hak akses aplikasi. Hanya pengguna `authenticated` dengan profil aktif dapat mengakses data aplikasi.
- Semua primary key tabel aplikasi menggunakan UUID. `receipt_number` adalah nomor urut nota, bukan primary key.
- Nama kolom, default, constraint, dan index berikut adalah acuan desain; migration lokal tetap harus direview sebelum diterapkan ke Supabase.

### Enum yang diusulkan

- `public.stock_movement_type`: `opening_balance`, `sale`, `adjustment`.

## 4. Tabel yang dirancang

### 4.1 `profiles`

Satu baris per pengguna Supabase Auth. `id` sama dengan ID auth; email/password tetap dikelola Supabase Auth dan tidak disalin ke tabel ini.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | Tidak ada; diberikan oleh Auth | PK; FK ke `auth.users(id) ON DELETE CASCADE` |
| `display_name` | `text` | Tidak | Tidak ada | Check setelah trim tidak kosong, maksimal 255 karakter |
| `is_active` | `boolean` | Tidak | `true` | Akun nonaktif harus gagal melewati helper RLS dan RPC |
| `created_at` | `timestamptz` | Tidak | `now()` | Dibuat saat profil diprovisi |
| `updated_at` | `timestamptz` | Tidak | `now()` | Diperbarui oleh trigger saat profil berubah |

**Unique dan check**

- PK `id`.
- `display_name` harus nonkosong setelah trim dan panjangnya tidak lebih dari 255.
- Client tidak boleh menyisipkan profil atau mengubah `is_active`; profil dibuat dan dinonaktifkan melalui proses provisioning tepercaya.
- FK `auth.users ON DELETE CASCADE` dapat menghapus profil saat akun Auth dihapus, tetapi FK `RESTRICT` dari transaksi dan ledger mencegah penghapusan akun yang masih dirujuk. Prosedur aplikasi tetap menonaktifkan akun, bukan menghapusnya.

**Index**

- PK `id` sudah menyediakan index untuk lookup profil pengguna pada policy.
- Belum direkomendasikan index tambahan untuk jumlah akun yang kecil; tambahkan hanya bila pola query/ukuran pengguna membutuhkannya.

### 4.2 `categories`

Kategori menjadi tabel tersendiri, berbeda dari V1 yang menyimpan teks kategori pada produk.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | `gen_random_uuid()` | PK |
| `name` | `text` | Tidak | Tidak ada | Nama kategori |
| `description` | `text` | Ya | `NULL` | Informasi tambahan, opsional |
| `is_active` | `boolean` | Tidak | `true` | Status arsip kategori |
| `created_at` | `timestamptz` | Tidak | `now()` | Waktu pembuatan |
| `updated_at` | `timestamptz` | Tidak | `now()` | Diperbarui oleh trigger |

**Unique dan check**

- Unique functional index pada `lower(btrim(name))` agar nama kategori unik tanpa membedakan kapitalisasi dan spasi di awal/akhir. Ini keputusan final V2, bukan aturan V1.
- `name` harus nonkosong setelah trim dan tidak lebih dari 255 karakter.
- Semua pengguna aktif dapat membaca kategori aktif maupun arsip.
- Kategori dengan `is_active = false` tidak dapat dipakai saat membuat produk atau mengganti kategori produk. Produk yang sudah merujuk kategori tersebut tetap menyimpan FK historisnya.
- Tidak ada FK dari kategori ke toko karena satu instalasi hanya untuk satu toko.
- Aplikasi tidak memberi hak hard delete kategori; pengguna aktif mengarsipkan kategori dengan mengubah `is_active`.

**Index**

- Unique index normalisasi nama.
- Partial index `is_active`/`name` hanya jika daftar kategori aktif sering menjadi query besar; untuk instalasi kecil ini opsional.

### 4.3 `products`

`category` teks V1 dinormalisasi menjadi FK. Produk menggunakan `is_active` untuk arsip dan tidak di-hard-delete melalui aplikasi.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | `gen_random_uuid()` | PK |
| `name` | `text` | Tidak | Tidak ada | Check setelah trim tidak kosong, maksimal 255 karakter |
| `category_id` | `uuid` | Tidak | Tidak ada | FK ke `categories(id) ON DELETE RESTRICT` |
| `price` | `numeric(12,2)` | Tidak | Tidak ada | Harga satuan saat ini |
| `stock` | `bigint` | Tidak | `0` | Nilai stok ringkasan saat ini |
| `is_active` | `boolean` | Tidak | `true` | Arsip produk; produk arsip tidak dapat dijual |
| `created_at` | `timestamptz` | Tidak | `now()` | Waktu pembuatan |
| `updated_at` | `timestamptz` | Tidak | `now()` | Diperbarui oleh trigger |

**Unique dan check**

- Tidak ada unique constraint pada nama produk: V1 tidak mewajibkan nama produk unik.
- `price >= 0`.
- `stock >= 0`.
- Nama harus nonkosong setelah trim dan maksimal 255 karakter.
- Produk dengan `is_active = false` tidak dapat dipilih untuk penjualan. Semua pengguna aktif dapat melihat produk aktif maupun arsip.
- Produk diarsipkan melalui perubahan `is_active`, bukan hard delete. Tidak ada grant `DELETE` aplikasi.
- Pengarsipan tidak mengubah atau menghapus saldo `stock` maupun riwayat `stock_movements`. Semua pengguna aktif dapat menyesuaikan stok produk aktif maupun arsip melalui `adjust_stock`.
- Jika kategori diarsipkan, kategori tersebut tidak dapat diberikan kepada produk baru atau saat mengganti kategori produk. FK historis tetap dipertahankan.
- Pemeriksaan status kategori aktif wajib dilakukan pada alur tepercaya pembuatan/perubahan produk; FK biasa hanya memastikan baris kategori ada, bukan bahwa `is_active = true`.
- Penghapusan kategori yang masih dipakai ditolak oleh FK. Pengarsipan kategori tidak menghapus produk yang merujuknya.
- Semua pengguna aktif dapat mengarsipkan produk dengan mengubah `is_active` dan membaca produk aktif maupun arsip.
- Client tidak memperoleh grant untuk `INSERT`, `DELETE`, atau mengubah kolom `stock`. Produk baru dibuat melalui `create_product`; perubahan stok hanya melalui RPC tepercaya.
- V1 memiliki default teks kategori `Umum`, tetapi API create V1 mewajibkan kategori. V2 sebaiknya menyediakan kategori `Umum` saat bootstrap dan meminta `category_id` yang valid; jangan mengasumsikan UUID default tetap.

**Index**

- Index pada `category_id` untuk FK dan filter kategori.
- Partial index nama untuk produk aktif jika pencarian/list produk memerlukannya.
- Partial index stok rendah `WHERE is_active AND stock <= 5` hanya jika halaman stok rendah sering memerlukannya. Ambang `5` berasal dari V1; bila V2 menjadikannya dapat dikonfigurasi, jangan mengunci index pada ambang itu.

### 4.4 `transactions`

Satu header per penjualan. V2 menambahkan aktor yang tidak tersedia di V1 dan mempertahankan transaksi sebagai catatan yang tidak dapat diedit/hapus langsung oleh client.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | `gen_random_uuid()` | PK |
| `receipt_number` | `bigint` identity | Tidak | Identity sequence | Nomor nota; bukan nomor invoice legal dan tidak dijamin tanpa celah |
| `created_by` | `uuid` | Tidak | Tidak ada; diisi RPC dari `auth.uid()` | FK ke `profiles(id) ON DELETE RESTRICT` |
| `total` | `numeric(12,2)` | Tidak | Tidak ada | Dihitung server dari item, bukan diterima dari client |
| `created_at` | `timestamptz` | Tidak | `now()` | Waktu penjualan |

**Unique dan check**

- PK `id`; unique `receipt_number`.
- `receipt_number > 0`.
- `total >= 0`.
- Header harus memiliki satu atau lebih item. Constraint biasa tidak dapat memvalidasi jumlah baris anak; invariant ini ditegakkan dan diuji di RPC.
- Tidak direkomendasikan `updated_at`: transaksi selesai diperlakukan immutable. V1 memiliki timestamps umum tetapi tidak menyediakan endpoint edit/hapus transaksi.
- Aplikasi tidak memberikan hak `INSERT` langsung; transaksi hanya dibuat oleh `create_sale`. Tidak ada grant/policy `UPDATE` atau `DELETE`.

**Index**

- Index `created_at DESC` untuk riwayat dan laporan.
- Index gabungan `(created_by, created_at DESC)` untuk pencarian/audit transaksi berdasarkan pengguna; hak baca tidak dibatasi oleh `created_by`.
- Unique index untuk `receipt_number`; PK mengindeks `id`.

### 4.5 `transaction_items`

Menggantikan `transaction_details`. Menyimpan snapshot agar nota lama tidak berubah ketika data produk diperbarui.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | `gen_random_uuid()` | PK |
| `transaction_id` | `uuid` | Tidak | Tidak ada | FK ke `transactions(id) ON DELETE RESTRICT` |
| `product_id` | `uuid` | Tidak | Tidak ada | FK ke `products(id) ON DELETE RESTRICT` |
| `product_name_snapshot` | `text` | Tidak | Tidak ada | Snapshot nama saat transaksi; rekomendasi tambahan V2 |
| `quantity` | `bigint` | Tidak | Tidak ada | Jumlah unit pada penjualan |
| `unit_price` | `numeric(12,2)` | Tidak | Tidak ada | Snapshot harga satuan dari database |
| `subtotal` | `numeric(12,2)` | Tidak | Tidak ada | `unit_price * quantity` |
| `created_at` | `timestamptz` | Tidak | `now()` | Waktu pencatatan detail |

**Unique dan check**

- Unique `(transaction_id, product_id)`, sesuai aturan V1 yang menolak produk duplikat dalam satu payload.
- FK ke transaksi/produk menggunakan `ON DELETE RESTRICT` agar riwayat penjualan terjaga. Ini keputusan desain V2; migrasi V1 menggunakan cascade untuk detail saat transaksi induk dihapus, tetapi V1 tidak menyediakan endpoint hapus transaksi.
- `quantity > 0`, `unit_price >= 0`, `subtotal >= 0`.
- `subtotal = unit_price * quantity`.
- Snapshot nama harus nonkosong.
- Total header harus sama dengan jumlah subtotal seluruh item; penegakannya dilakukan oleh RPC, bukan check lintas baris.
- Aplikasi tidak memberikan hak `INSERT` langsung; item hanya dibuat oleh `create_sale`. Tidak ada grant/policy `UPDATE` atau `DELETE`.

**Index**

- Unique `(transaction_id, product_id)` juga mendukung pencarian item berdasarkan transaksi.
- Index `product_id` untuk agregasi unit terjual/produk terlaris dan pencarian riwayat produk.

### 4.6 `stock_movements`

Ledger append-only yang mencatat setiap perubahan stok. `products.stock` tetap menjadi saldo terkini untuk pembacaan cepat; function penjualan/penyesuaian memperbarui saldo dan ledger secara atomik.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | `gen_random_uuid()` | PK |
| `product_id` | `uuid` | Tidak | Tidak ada | FK ke `products(id) ON DELETE RESTRICT` |
| `transaction_item_id` | `uuid` | Ya | `NULL` | FK ke `transaction_items(id) ON DELETE RESTRICT`; terisi untuk penjualan |
| `movement_type` | `public.stock_movement_type` | Tidak | Tidak ada | `opening_balance`, `sale`, atau `adjustment` |
| `quantity_change` | `bigint` | Tidak | Tidak ada | Bertanda: negatif untuk penjualan/pengurangan, positif untuk penambahan |
| `stock_before` | `bigint` | Tidak | Tidak ada | Saldo sebelum gerakan |
| `stock_after` | `bigint` | Tidak | Tidak ada | Saldo sesudah gerakan |
| `reason` | `text` | Ya | `NULL` | Alasan penyesuaian; diwajibkan untuk `adjustment` |
| `created_by` | `uuid` | Tidak | Tidak ada; diisi RPC/aktor migrasi | FK ke `profiles(id) ON DELETE RESTRICT` |
| `created_at` | `timestamptz` | Tidak | `now()` | Waktu gerakan |

**Unique dan check**

- PK `id`.
- Unique partial index pada `transaction_item_id` bila tidak null: satu item penjualan hanya menghasilkan satu gerakan stok.
- `stock_before >= 0`, `stock_after >= 0`, dan `stock_after = stock_before + quantity_change` (bandingkan setelah cast ke `numeric` agar check tidak overflow).
- `sale`: harus memiliki `transaction_item_id` dan `quantity_change < 0`.
- `opening_balance`: tanpa `transaction_item_id`, `stock_before = 0`, dan `quantity_change > 0`.
- `adjustment`: tanpa `transaction_item_id`, `quantity_change <> 0`, dan alasan nonkosong.
- Kesesuaian `product_id`, kuantitas detail, aktor, dan gerakan lintas tabel ditegakkan oleh RPC tepercaya; jangan mengandalkan check row-level lintas tabel.
- Baris ledger tidak boleh diubah atau dihapus oleh client. Koreksi dilakukan dengan gerakan kompensasi. Refund/void tidak termasuk tahap awal; jika kelak dipertimbangkan, desain koreksinya perlu ditentukan terpisah.
- Client tidak memperoleh hak `INSERT` langsung; gerakan dibuat oleh RPC atau proses migrasi tepercaya.

**Index**

- `(product_id, created_at DESC)` untuk riwayat per produk.
- `(created_by, created_at DESC)` untuk audit per pegawai.
- Unique partial index `transaction_item_id` untuk mencegah duplikasi gerakan penjualan.

## 5. Relasi antartabel

```text
auth.users 1 ─── 0..1 profiles
profiles   1 ─── N transactions
profiles   1 ─── N stock_movements
categories 1 ─── N products
transactions 1 ─── 1..N transaction_items
products     1 ─── N transaction_items
products     1 ─── N stock_movements
transaction_items 1 ─── 0..1 stock_movements (gerakan sale)
```

- Tidak ada relasi tenant/toko; isolasi terjadi dengan satu proyek Supabase per instalasi.
- Produk/kategori diarsipkan (`is_active = false`) dan tidak di-hard-delete melalui aplikasi. Produk arsip tidak dapat dijual; kategori arsip tidak dapat dipakai untuk produk baru atau perubahan kategori.
- `transactions`, `transaction_items`, dan `stock_movements` immutable serta tidak di-hard-delete melalui aplikasi. Data historis tetap dipertahankan.
- `transaction_items.product_name_snapshot` dan harga snapshot membuat nota historis stabil, walaupun nama/harga katalog berubah.

## 6. Supabase Auth, grant, dan RLS

### Provisioning akun

- Nonaktifkan pendaftaran publik pada konfigurasi Supabase Auth. Akun dibuat melalui undangan atau Dashboard/proses provisioning tepercaya.
- Setelah pengguna Auth dibuat, proses provisioning tepercaya membuat satu baris `profiles` dengan `id = auth.users.id`. Desain ini tidak memakai trigger `auth.users`: tanpa profil, akun tidak mendapat akses aplikasi, sekalipun pendaftaran publik tidak sengaja aktif.
- `profiles.is_active` hanya dapat diubah oleh provisioning/proses administratif tepercaya. `service_role` hanya boleh digunakan pada server, Edge Function, atau Dashboard tepercaya; jangan pernah menaruhnya di React/Vite.
- Semua pengguna dengan profil aktif memiliki hak aplikasi yang sama. Tidak ada jabatan, hierarki hak, atau perubahan hak berdasarkan metadata Auth.
- **Pencabutan akses:** proses tepercaya menetapkan `is_active = false`. Semua policy dan RPC memeriksa status tersebut, sehingga permintaan database berikutnya ditolak meskipun access token lama masih berlaku. Jika diperlukan, proses tepercaya juga mencabut sesi melalui API administrasi Supabase Auth tanpa mengekspos secret ke client.
- Akun yang tidak digunakan dinonaktifkan, bukan dihapus. FK `ON DELETE RESTRICT` dari transaksi dan ledger mencegah penghapusan akun Auth yang profilnya masih dirujuk; atribusi historis tetap terjaga.

### Matriks akses

| Objek/aksi | Pengguna aktif | `anon` / tanpa profil aktif |
| --- | --- | --- |
| Baca/edit `display_name` profil sendiri | Ya | Tolak |
| Baca profil pengguna lain atau ubah `is_active` | Tidak | Tolak |
| Baca produk/kategori aktif dan arsip | Ya | Tolak |
| Kelola/arsipkan kategori dan atribut produk nonstok | Ya | Tolak |
| Buat produk dan sesuaikan stok | Ya, melalui RPC | Tolak |
| Buat penjualan | Ya, melalui RPC | Tolak |
| Baca seluruh transaksi, item, dan stock movements | Ya | Tolak |
| `INSERT` transaksi/item/ledger langsung | Tidak; gunakan RPC terkontrol | Tolak |
| `UPDATE`/`DELETE` transaksi/item/ledger | Tidak | Tolak |

`created_by` mencatat pengguna yang melakukan tindakan, bukan pembatasan akses baca.

### Kebijakan RLS dan grant per tabel

- **`profiles`:** `SELECT` profil sendiri dan `UPDATE` kolom `display_name` sendiri, hanya jika profil aktif. Tidak ada client `INSERT`/`DELETE` atau grant pada `is_active`.
- **`categories`:** setiap pengguna aktif dapat `SELECT` aktif dan arsip serta `INSERT`/`UPDATE`; tidak ada `DELETE` aplikasi.
- **`products`:** setiap pengguna aktif dapat `SELECT` aktif dan arsip serta `UPDATE` atribut nonstok (`name`, `category_id`, `price`, `is_active`). Tidak ada direct `INSERT`/`DELETE` atau grant `UPDATE` kolom `stock`; produk baru dibuat melalui `create_product`, perubahan stok melalui RPC.
- **`transactions`:** setiap pengguna aktif dapat `SELECT` seluruh baris; tidak ada direct `INSERT`/`UPDATE`/`DELETE`.
- **`transaction_items`:** setiap pengguna aktif dapat `SELECT` seluruh baris; tidak ada direct `INSERT`/`UPDATE`/`DELETE`.
- **`stock_movements`:** setiap pengguna aktif dapat `SELECT`; tidak ada direct `INSERT`/`UPDATE`/`DELETE`. Penulisan dilakukan melalui RPC/proses migrasi tepercaya.

### Aturan implementasi keamanan

1. Aktifkan RLS pada setiap tabel di schema yang diekspos; buat policy terpisah per operasi `SELECT`, `INSERT`, `UPDATE`, dan `DELETE`.
2. Audit dan cabut grant default `anon`/`authenticated`, lalu grant hanya operasi yang diperlukan. RLS tidak mencabut grant; kedua lapis harus benar.
3. `anon` tidak mendapat akses ke data bisnis. Pengguna `authenticated` tanpa profil aktif juga ditolak oleh semua policy dan RPC.
4. Gunakan `auth.uid()` untuk identitas pemanggil. Helper `internal.current_profile_is_active()` membaca `profiles` di luar RLS policy untuk menghindari recursion; helper hanya memeriksa profil pemanggil dan `is_active`, tanpa membaca metadata pengguna.
5. Cabut grant `INSERT`/`DELETE` profil dari client. Batasi update profil sendiri ke kolom `display_name`; jangan berikan update `is_active`. Provisioning dan penonaktifan hanya melalui proses tepercaya.
6. Jangan berikan direct `INSERT`/`UPDATE`/`DELETE` pada `transactions`, `transaction_items`, atau `stock_movements`. Header/item dibuat melalui `create_sale`; produk dengan stok awal melalui `create_product`; setiap perubahan stok melalui RPC atomik. Jangan berikan direct `INSERT` produk atau update kolom `products.stock`.
7. Semua policy untuk data aplikasi mensyaratkan profil aktif. SELECT transaksi, item, dan ledger berlaku untuk semua pengguna aktif; `created_by` hanya untuk atribusi/audit.
8. Tidak ada grant `DELETE` aplikasi untuk produk/kategori; pengarsipan adalah update `is_active`. Trigger menolak kategori arsip saat produk dibuat atau kategori produk berubah, dan `create_sale` menolak produk arsip.
9. Jika memakai `SECURITY DEFINER`, set `search_path` kosong, kualifikasikan semua nama schema/tabel, hindari dynamic SQL, periksa `auth.uid()` dan profil aktif, cabut execute dari `PUBLIC`/`anon`, lalu grant hanya ke `authenticated` bila dibutuhkan.
10. Schema `internal` tidak boleh diekspos melalui Supabase Data API. View juga harus ditinjau karena dapat melewati RLS bila dibuat dengan hak pemilik.
11. Uji policy allow/deny untuk anon, profil tidak ada/nonaktif, dan beberapa pengguna aktif menggunakan Supabase DB tests sebelum deployment.

## 7. RPC produk, penjualan, dan ledger stok

### Function yang diusulkan

- `public.create_sale(p_items jsonb) RETURNS uuid`: membuat satu transaksi penjualan; input hanya daftar `product_id` dan `quantity`.
- `public.adjust_stock(p_product_id uuid, p_delta bigint, p_reason text) RETURNS void`: penyesuaian manual pengguna aktif.
- `public.create_product(p_name text, p_category_id uuid, p_price numeric, p_initial_stock bigint DEFAULT 0) RETURNS uuid`: membuat produk pengguna aktif dan, bila stok awal lebih dari nol, mencatat gerakan `opening_balance` dalam transaksi yang sama.

Tiga RPC tersebut cukup untuk penjualan, penyesuaian stok, dan pembuatan produk. Tidak diperlukan RPC publik tambahan untuk kategori: pengguna aktif dapat mengelolanya lewat grant dan policy terbatas. Provisioning dan pencabutan sesi Auth dilakukan oleh proses server tepercaya, bukan RPC client. Nama/signature di atas adalah rancangan.

### Urutan `create_sale`

1. Pastikan pemanggil adalah pengguna Auth dengan profil aktif.
2. Validasi payload: JSON array minimal satu item; ID produk valid dan tidak duplikat; kuantitas integer positif. Tolak produk tidak ditemukan atau `is_active = false`.
3. Ambil semua baris produk yang diminta dengan `SELECT ... FOR UPDATE`, mengunci dalam urutan ID produk yang konsisten untuk mengurangi deadlock.
4. Di dalam lock, baca harga dan saldo dari database; tolak seluruh penjualan bila ada stok yang tidak cukup. Client tidak mengirim harga/subtotal/total yang dipercaya.
5. Hitung subtotal dari `products.price * quantity` dan total dari semua subtotal, lalu simpan header transaksi dengan `created_by = auth.uid()`.
6. Simpan item dengan snapshot nama, harga dan subtotal; satu produk hanya satu baris per transaksi.
7. Kurangi saldo produk dengan syarat stok masih mencukupi, dan buat satu `stock_movements` bertipe `sale` per item berisi delta negatif, stok sebelum/sesudah, item transaksi, dan aktor.
8. Kembalikan ID transaksi; seluruh pengguna aktif dapat membaca header dan item transaksi melalui policy SELECT.

RPC berjalan sebagai satu pemanggilan database/transaction. Bila validasi, FK, constraint, insert, atau update mana pun gagal dan function melempar error, seluruh header, item, pengurangan stok, dan ledger ikut rollback—tidak ada pengurangan parsial. Lock baris mencegah dua penjualan memakai saldo yang sama secara bersamaan. Tambahkan test concurrency/rollback, bukan hanya test respons UI.

### Pembuatan produk dan stok awal

1. `create_product` mensyaratkan `auth.uid()` terautentikasi dengan profil aktif.
2. Validasi nama nonkosong setelah trim dan maksimal 255 karakter, harga nonnegatif yang muat pada `numeric(12,2)`, stok awal nonnegatif yang muat pada `bigint`, serta kategori yang ada dan aktif. Kunci baris kategori selama validasi/pembuatan agar kategori tidak dapat diarsipkan bersamaan sebelum produk tercatat.
3. Insert produk dalam transaksi RPC, dengan `stock = p_initial_stock`. Client tidak dapat mengirim operasi insert tabel produk langsung atau mengubah kolom `stock` langsung.
4. Jika `p_initial_stock > 0`, insert satu `stock_movements` `opening_balance`: `stock_before = 0`, `quantity_change = p_initial_stock`, `stock_after = p_initial_stock`, `created_by = auth.uid()`.
5. Jika `p_initial_stock = 0`, buat produk dengan stok nol dan jangan membuat baris movement. Constraint opening balance mensyaratkan perubahan positif sehingga ledger tidak berisi gerakan nol.
6. Kegagalan insert movement atau langkah lain me-rollback insert produk dan perubahan terkait seluruhnya.

Validasi kategori aktif juga berlaku saat update `products.category_id`, melalui trigger database yang memeriksa insert atau perubahan kategori. Kunci baris kategori selama validasi agar pengarsipan kategori tidak berlomba dengan pembuatan/perubahan produk. FK saja tidak memeriksa `is_active`.

### Penyesuaian stok

`adjust_stock` hanya menerima pemanggil dengan profil aktif. Function mengunci baris produk sebelum memeriksa saldo; produk harus ditemukan, tetapi boleh aktif maupun arsip. Function menolak delta nol, alasan kosong setelah trim, overflow `bigint`, atau hasil stok negatif. Dalam satu transaksi atomik, function hanya memperbarui `products.stock` dan menambahkan satu `stock_movements` bertipe `adjustment` berisi saldo sebelum/sesudah, delta, alasan, produk, dan aktor. Jika langkah apa pun gagal, seluruh perubahan di-rollback. Function tidak mengubah `products.is_active`; penyesuaian tidak pernah mengaktifkan kembali produk arsip.

## 8. Rencana migrasi produk V1

Tahap awal hanya memindahkan katalog produk, kategori, harga, dan saldo stok. Riwayat `transactions`/`transaction_details` V1 tidak dimigrasikan. Sebelum migrasi, buat backup dan verifikasi sumber data yang benar; file CSV/Excel V1 bukan sumber otomatis kecuali dipilih secara eksplisit.

1. Ekspor `id`, `name`, `category`, `price`, dan `stock`. Validasi encoding, ID legacy, harga non-negatif dengan paling banyak dua desimal, dan stok integer non-negatif. V1 menampilkan Rupiah tetapi tidak menyimpan kode mata uang; nilai impor diperlakukan sebagai IDR sesuai keputusan V2.
2. Normalisasikan nama kategori dengan trim dan kunci `lower(btrim(name))`. Buat satu kategori V2 per kunci hasil normalisasi. Tinjau benturan label dan pilih label kanonis sebelum impor; jangan mengasumsikan pemetaan nilai kosong/null. V1 memiliki nilai default kategori `Umum`.
3. Buat UUID V2 baru untuk setiap kategori dan produk. Simpan crosswalk sementara `legacy_category_key → category_id` serta `legacy_product_id → product_id`; gunakan ID tersebut untuk menghubungkan setiap produk ke kategori.
4. Produk dan kategori V1 tidak memiliki status arsip; impor awal menetapkan `is_active = true`. Masukkan harga sebagai `numeric(12,2)` dan stok sebagai `bigint`. Timestamps V1 tidak termasuk field wajib pada tahap ini; jika akan dipertahankan, verifikasi zona waktu sumber dan konversi ke `timestamptz` tanpa mengubah waktu absolut.
5. Untuk setiap produk dengan stok awal positif, tulis saldo produk dan satu `opening_balance` dengan `stock_before = 0`, `quantity_change = stok awal`, `stock_after = stok awal`, tanpa `transaction_item_id`, dan `created_by` profil aktif yang menjalankan impor. Itu adalah aktor proses impor V2, bukan aktor historis V1. Untuk stok awal nol, simpan `stock = 0` dan jangan buat gerakan ledger.
6. Jalankan impor secara tepercaya dan atomik per produk atau dalam batch yang dapat di-rollback. Jangan memberikan akses import atau hak `stock` langsung ke client.
7. Rekonsiliasi jumlah produk/kategori, pemetaan kategori, jumlah stok per produk dan kategori, total stok, serta kesetaraan saldo produk dengan saldo pembukaan ledger. Laporkan record yang ditolak dan selesaikan sebelum cutover.

V1 tidak menyimpan kategori sebagai entitas, status arsip, aktor produk, atau stock movement. Data tersebut tidak dapat direkonstruksi sebagai fakta historis. Transaksi V1 tidak masuk lingkup tahap awal; karena V1 juga tidak menyimpan aktor transaksi atau snapshot nama historis, jangan mengimpor atau merekayasa data itu sebagai fakta.

## 9. Urutan implementasi migration

Urutan berikut adalah rencana implementasi, bukan migration yang telah dibuat atau dijalankan:

1. Verifikasi proyek Supabase, backup, pengaturan Auth, zona waktu sumber, dan hasil audit data V1.
2. Buat enum `stock_movement_type`.
3. Buat tabel sesuai urutan dependensi: `profiles`, `categories`, `products`, `transactions`, `transaction_items`, lalu `stock_movements`; tetapkan PK/FK, nullability, default, unique/check constraints, serta index.
4. Konfigurasikan signup publik nonaktif dan proses provisioning tepercaya yang membuat profil aktif setelah akun Auth diundang/dibuat. Buat trigger `updated_at` dan validasi kategori aktif; jangan gunakan trigger yang otomatis memberi akses kepada setiap signup Auth.
5. Buat helper otorisasi di schema internal, aktifkan RLS pada seluruh tabel yang diekspos, dan pasang policy per operasi berdasarkan matriks.
6. Cabut default grants yang tidak perlu. Grant `SELECT` serta kolom/operasi katalog yang diperlukan; jangan grant client direct insert produk, perubahan stok, DML transaksi/item/ledger, atau hak mengubah status profil.
7. Buat RPC `create_product`, `adjust_stock`, dan `create_sale`. Setiap RPC memvalidasi `auth.uid()` dan profil aktif; gunakan `SECURITY DEFINER` dengan pengamanan di bagian 6. Revoke execute dari `PUBLIC`/`anon`, grant hanya ke `authenticated` sesuai kebutuhan.
8. Uji undangan, provisioning profil, pencabutan akses, dan penolakan akses untuk akun tanpa profil aktif.
9. Jalankan migrasi katalog/saldo V1 di staging, rekonsiliasi hasil, jalankan strategi pengujian, lalu cutover setelah hasil disetujui.

## 10. Strategi pengujian database

- **Constraint dan relasi:** uji PK/FK, larangan hard delete kategori/produk yang direferensikan, nama kategori kosong/duplikat setelah `lower(btrim(name))`, harga/stok negatif, kuantitas nol/negatif, total/subtotal, dan setiap jenis `stock_movement`.
- **Provisioning dan profil:** pastikan profil hanya dibuat melalui proses tepercaya; pengguna hanya dapat membaca profil sendiri dan memperbarui `display_name` sendiri; pengguna tanpa profil atau berprofil nonaktif ditolak.
- **RLS dan grants:** uji `anon`, authenticated tanpa profil, profil nonaktif, dan beberapa profil aktif; semua profil aktif memiliki hak aplikasi yang sama, membaca data aktif/arsip, seluruh transaksi/item/ledger, dan hanya profil masing-masing.
- **Hak tulis langsung:** pastikan client tidak dapat mengubah `products.stock`, insert produk/transaksi/item/ledger langsung, mengubah `profiles.is_active`, atau melakukan update/delete transaksi, item, dan ledger. Pastikan pengguna aktif dapat mengelola kategori/atribut produk tanpa mengubah saldo secara langsung.
- **`create_product`:** uji kategori aktif vs arsip, pengguna aktif vs tanpa profil/nonaktif, stok awal nol (tanpa movement), stok awal positif (tepat satu opening balance), dan rollback produk ketika pembuatan movement gagal.
- **`adjust_stock`:**
  1. Beberapa pengguna aktif dapat menyesuaikan produk aktif maupun arsip.
  2. Pengguna tanpa profil aktif ditolak.
  3. Produk tidak ditemukan ditolak; delta nol, alasan kosong, hasil negatif, dan overflow ditolak.
  4. Penyesuaian produk arsip tetap membuat `stock_movements` bertipe `adjustment`.
  5. `is_active` tetap `false` setelah penyesuaian stok produk arsip.
- **`create_sale`:** uji validasi payload, harga dari database, stok cukup/tidak cukup, dan penolakan produk arsip untuk semua pengguna.
- **Atomicity dan konkurensi:** jalankan dua penjualan bersamaan atas saldo terbatas; pastikan saldo tidak negatif dan tidak ada header/item/movement parsial setelah kegagalan.
- **Pencabutan akun:** setelah profil dinonaktifkan, coba ulang operasi dengan token lama dan pastikan RLS/RPC menolak; verifikasi pencabutan sesi melalui proses tepercaya Supabase Auth.
- **Migrasi:** bandingkan crosswalk dan jumlah data; cocokkan saldo produk dengan opening movements serta laporan stok per kategori sebelum cutover.

Seluruh test database dilakukan di proyek lokal/staging, bukan proyek produksi. Tidak ada test atau perubahan database yang dijalankan dalam revisi dokumen ini.

## 11. Keputusan final dan catatan risiko

1. Satu instalasi Supabase untuk satu toko; tidak ada `store_id`, multi-tenancy, tenant management, atau subscription.
2. Tidak ada pembagian jabatan atau hierarki hak aplikasi. Semua pengguna yang login dan memiliki profil aktif memiliki hak yang sama.
3. Pengguna hanya dapat membaca profilnya sendiri dan mengubah `display_name` miliknya. Profil dibuat/dinonaktifkan melalui provisioning tepercaya; tidak ada akses client untuk mengubah `is_active`.
4. Semua pengguna aktif dapat melihat/mengelola katalog, menyesuaikan stok melalui RPC, membuat penjualan melalui RPC, membaca semua transaksi/item/ledger, dan melihat laporan.
5. Produk/kategori diarsipkan dengan `is_active`, bukan hard delete melalui aplikasi. Produk arsip tidak dapat dijual; kategori arsip tidak dapat dipakai untuk produk baru atau perubahan kategori. Penyesuaian stok tidak mengaktifkan produk kembali.
6. Transaksi, item, dan stock movements immutable. Pengarsipan tidak menghapus saldo stok atau riwayat movement.
7. Nama kategori unik tanpa membedakan kapitalisasi/spasi di tepi melalui unique functional index `lower(btrim(name))`.
8. Semua PK aplikasi UUID; uang `numeric(12,2)` dan stok/kuantitas `bigint`; waktu disimpan sebagai `timestamptz` dan ditampilkan/dilaporkan dalam `Asia/Jakarta`; mata uang instalasi IDR.
9. Supabase Auth mengelola identitas; RLS dan grants mengendalikan akses. Penjualan dan perubahan stok berjalan atomik melalui RPC tepercaya.
10. Migrasi V1 tahap awal hanya produk, kategori, harga, dan saldo stok; transaksi/riwayat penjualan V1 tidak dimigrasikan.

### Catatan risiko/konfirmasi sebelum implementasi

- Tinjau label kanonis untuk kategori V1 yang berbeda kapitalisasi/spasi tetapi menjadi satu key, serta tindakan untuk kategori kosong/null jika ditemukan.
- Pastikan apakah timestamps produk V1 akan dipertahankan; bila ya, verifikasi zona waktu Laravel sebelum konversi.
- Signup publik harus dinonaktifkan pada konfigurasi Supabase Auth. Akun Auth tanpa baris profil aktif tetap harus ditolak oleh setiap policy dan RPC.
- Profil dinonaktifkan melalui proses tepercaya; pastikan proses provisioning tidak menaruh `service_role` di client dan tidak membuat profil berdasarkan metadata pengguna.
- FK `auth.users ON DELETE CASCADE` menghapus profil yang tidak lagi dirujuk bila akun Auth dihapus secara administratif; operasi aplikasi biasa tetap menonaktifkan akun, bukan menghapusnya.

Migration yang disebut pada dokumen dan RPC tahap berikutnya harus diuji di lokal/staging sebelum diterapkan. Dokumen ini tidak mengklaim bahwa database Supabase telah diubah.

## 12. Referensi

- [Analisis SmartStock V1](./ANALISIS-SMARTSTOCK-V1.md)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS, grant, dan pengujian policy.
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — grant Data API dan default privilege.
- [Supabase: Database functions](https://supabase.com/docs/guides/database/functions) — RPC, `SECURITY INVOKER/DEFINER`, `search_path`, dan execute privilege.
- [Supabase: User Management](https://supabase.com/docs/guides/auth/managing-user-data) — profil publik yang merujuk `auth.users` dan trigger pembuatan profil.
