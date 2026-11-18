# Desain Database SmartStock V2

Dokumen ini menetapkan desain database final SmartStock V2 untuk satu toko per instalasi Supabase. Ini hanya dokumen desain: tidak ada SQL yang dijalankan dan tidak ada tabel, function, policy, atau perubahan database yang dibuat.

## 1. Tujuan dan asumsi

- Satu instalasi menggunakan satu proyek Supabase untuk satu toko.
- Setiap pengguna/deployment mengatur proyek dan kredensial Supabase sendiri.
- Satu instalasi dapat memiliki beberapa akun pegawai dengan role `owner`, `admin`, atau `cashier`.
- Maksimal ada satu owner; owner pertama dibuat melalui bootstrap tepercaya.
- Tidak ada `store_id` atau isolasi tenant di dalam skema ini.
- Cashier aktif dapat membaca seluruh transaksi dan seluruh item transaksi, tetapi hanya profilnya sendiri.
- Produk/kategori diarsipkan, bukan dihapus melalui aplikasi. Transaksi, item, dan stock movement immutable.
- Produk arsip tidak dapat dijual, tetapi owner/admin tetap dapat melihatnya dan menyesuaikan stok melalui RPC; cashier tidak melihat atau menyesuaikan produk arsip.
- Waktu laporan/tampilan menggunakan `Asia/Jakarta`; mata uang instalasi adalah IDR.
- RLS dan grant PostgreSQL menjadi batas keamanan; menyembunyikan menu atau tombol di React bukan kontrol akses.
- `profiles.role` menyimpan role aplikasi. Role tidak boleh diambil dari metadata yang dapat diedit pengguna.
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
- V1 memakai autentikasi sesi Laravel/Sanctum. Kode yang diperiksa tidak mempunyai role owner/admin/cashier.

## 3. Rekomendasi tipe dan konvensi

Semua bagian di bawah ini adalah rekomendasi V2, bukan fakta V1.

- Gunakan UUID untuk PK aplikasi dengan default `gen_random_uuid()`. `profiles.id` memakai UUID yang sama dengan `auth.users.id`.
- Gunakan `numeric(12,2)` untuk nilai uang, sama dengan presisi V1. Nilai ini dibatasi check non-negatif; gunakan `bigint` untuk stok/kuantitas dan check non-negatif/positif karena PostgreSQL tidak memiliki unsigned integer.
- Gunakan `timestamptz NOT NULL DEFAULT now()` untuk waktu. PostgreSQL menyimpan waktu absolut; bentuk rentang laporan pada zona `Asia/Jakarta`, konversikan batasnya ke `timestamptz`, dan tampilkan waktu dalam `Asia/Jakarta`, tidak mengikuti zona waktu browser.
- Mata uang tetap `IDR` untuk satu instalasi. Gunakan `numeric(12,2)` untuk nilai uang; tidak diperlukan kolom mata uang per transaksi.
- Tabel bisnis berada di schema `public` hanya jika perlu diakses melalui Supabase Data API. Helper otorisasi ditempatkan di schema internal yang tidak diekspos.
- Role database Data API tetap `anon` dan `authenticated`; `owner`, `admin`, dan `cashier` adalah role aplikasi yang diperiksa melalui `profiles`.
- Semua primary key tabel aplikasi menggunakan UUID. `receipt_number` adalah nomor urut nota, bukan primary key.
- Nama kolom, default, constraint, dan index berikut merupakan rancangan, belum merupakan migration SQL.

### Enum yang diusulkan

- `public.app_role`: `owner`, `admin`, `cashier`.
- `public.stock_movement_type`: `opening_balance`, `sale`, `adjustment`.

Enum ini adalah rancangan untuk membatasi nilai, bukan tipe yang sudah dibuat di Supabase.

## 4. Tabel yang dirancang

### 4.1 `profiles`

Satu baris per pengguna Supabase Auth. `id` sama dengan ID auth; email/password tetap dikelola Supabase Auth dan tidak disalin ke tabel ini.

| Kolom | Tipe PostgreSQL | Nullable | Default | PK/FK dan catatan |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | Tidak | Tidak ada; diberikan oleh Auth | PK; FK ke `auth.users(id) ON DELETE CASCADE` |
| `display_name` | `text` | Tidak | Tidak ada | Check setelah trim tidak kosong, maksimal 255 karakter |
| `role` | `public.app_role` | Tidak | `'cashier'` | Enum `owner`, `admin`, `cashier`; default least privilege |
| `is_active` | `boolean` | Tidak | `true` | Akun nonaktif harus gagal melewati helper RLS dan RPC |
| `created_at` | `timestamptz` | Tidak | `now()` | Dibuat saat profil diprovisi |
| `updated_at` | `timestamptz` | Tidak | `now()` | Diperbarui oleh trigger saat profil berubah |

**Unique dan check**

- PK `id`.
- Unique partial index pada `role` untuk baris `role = 'owner'` membatasi jumlah owner maksimal satu. Index ini tidak menjamin owner selalu ada; operasi yang menonaktifkan atau menurunkan role owner terakhir harus ditolak oleh mekanisme tepercaya.
- `display_name` harus nonkosong setelah trim dan panjangnya tidak lebih dari 255.
- Nilai role dibatasi oleh enum.
- Client tidak boleh menyisipkan profil atau mengubah `role`/`is_active`; profil dibuat oleh proses provisioning tepercaya dengan role default least-privilege.
- FK `auth.users ON DELETE CASCADE` dapat menghapus profil saat akun Auth dihapus, tetapi FK `RESTRICT` dari transaksi dan ledger mencegah penghapusan akun yang masih dirujuk. Prosedur aplikasi tetap menonaktifkan akun, bukan menghapusnya.

**Index**

- PK `id` sudah menyediakan index untuk lookup profil pengguna pada policy.
- Unique partial index owner tersebut.
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
- Owner/admin dapat membaca kategori aktif maupun arsip; cashier hanya dapat membaca kategori aktif.
- Kategori dengan `is_active = false` tidak dapat dipakai saat membuat produk atau mengganti kategori produk. Produk yang sudah merujuk kategori tersebut tetap menyimpan FK historisnya.
- Tidak ada FK dari kategori ke toko karena satu instalasi hanya untuk satu toko.
- Aplikasi tidak memberi hak hard delete kategori; owner/admin mengarsipkan kategori dengan mengubah `is_active`.

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
- Produk dengan `is_active = false` tidak dapat dipilih untuk penjualan. Owner/admin dapat melihat produk aktif dan arsip; cashier hanya dapat membaca produk aktif.
- Produk diarsipkan melalui perubahan `is_active`, bukan hard delete. Tidak ada grant `DELETE` aplikasi.
- Pengarsipan tidak mengubah atau menghapus saldo `stock` maupun riwayat `stock_movements`. Owner/admin dapat menyesuaikan stok produk aktif maupun arsip melalui `adjust_stock`; cashier tidak dapat menyesuaikan stok.
- Jika kategori diarsipkan, kategori tersebut tidak dapat diberikan kepada produk baru atau saat mengganti kategori produk. FK historis tetap dipertahankan.
- Pemeriksaan status kategori aktif wajib dilakukan pada alur tepercaya pembuatan/perubahan produk; FK biasa hanya memastikan baris kategori ada, bukan bahwa `is_active = true`.
- Penghapusan kategori yang masih dipakai ditolak oleh FK. Pengarsipan kategori tidak menghapus produk yang merujuknya.
- Owner/admin mengarsipkan produk dengan mengubah `is_active`; cashier tidak dapat mengubah data produk.
- Owner/admin dapat membaca produk aktif maupun arsip; cashier hanya dapat membaca produk aktif.
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
- Index gabungan `(created_by, created_at DESC)` untuk pencarian/audit transaksi berdasarkan pegawai; hak baca cashier tidak dibatasi oleh `created_by`.
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

## 6. Supabase Auth, role, grant, dan RLS

### Provisioning akun

- Nonaktifkan pendaftaran publik untuk aplikasi toko; pegawai masuk melalui undangan.
- Satu pengguna Auth mendapat satu baris `profiles` dengan `id = auth.users.id`. Trigger Auth boleh membuat profil dengan role paling rendah (`cashier`), tetapi tidak boleh mempercayai role dari `raw_user_meta_data` yang dapat dikendalikan pengguna.
- `service_role` hanya boleh digunakan pada server/Edge Function atau Dashboard tepercaya; jangan pernah menaruhnya di React/Vite.
- **Bootstrap owner:** nonaktifkan signup publik, buat akun Auth pertama melalui Dashboard atau undangan tepercaya, lalu biarkan provisioning membuat profil `cashier` secara default. Operator tepercaya mempromosikan akun yang identitasnya sudah diverifikasi menjadi `owner` melalui lingkungan administratif yang tidak diekspos ke Data API/client. Operasi memeriksa bahwa owner belum ada dan berjalan atomik; unique partial index tetap menjadi pengaman maksimal satu owner. Setelah sukses, hapus/nonaktifkan jalur atau kredensial bootstrap. Tidak ada endpoint publik/client untuk promosi owner dan tidak ada bootstrap yang dapat dipanggil kembali setelah owner terbentuk.
- Pemeliharaan akun dilakukan melalui Edge Function/proses tepercaya, bukan grant client untuk mengubah `role`/`is_active`. Proses tersebut memverifikasi JWT pemanggil, profil aktif, dan hak role sebelum menggunakan Supabase Auth Admin/service role. `admin` dapat mengundang cashier; owner dapat mengelola akun dan role admin/cashier. Role `owner` hanya ditetapkan oleh bootstrap awal; transfer owner memerlukan prosedur administratif terpisah. Setiap jalur yang menurunkan atau menonaktifkan owner harus menolak tindakan terhadap owner terakhir.
- **Pencabutan akses:** nonaktifkan profil (`is_active = false`) terlebih dahulu. Semua policy dan RPC membaca status profil aktif sehingga permintaan database berikutnya ditolak walaupun access token lama masih valid. Jika perlu mencabut sesi Auth juga, gunakan alur revokasi sesi Supabase Auth Admin yang didukung melalui server tepercaya; layanan harus memastikan sesi/token sasaran yang benar dan tidak mengekspos service-role secret ke client. Database tetap menolak operasi berdasarkan `is_active` tanpa menunggu token kedaluwarsa.
- Pegawai yang tidak lagi digunakan dinonaktifkan, bukan dihapus. FK `ON DELETE RESTRICT` dari transaksi dan ledger mencegah penghapusan akun Auth yang profilnya masih dirujuk; data atribusi historis tetap terjaga.

### Matriks akses final

| Objek/aksi | Owner | Admin | Cashier | `anon` / tanpa profil aktif |
| --- | --- | --- | --- | --- |
| Baca/edit profil sendiri | Baca; ubah nama | Baca; ubah nama | Baca; ubah nama | Tolak |
| Baca profil pegawai lain | Ya | Ya | Tidak | Tolak |
| Ubah role/aktif pegawai | Atur admin/cashier; lindungi owner terakhir | Tidak; hanya undang cashier melalui proses tepercaya | Tidak | Tolak |
| Baca kategori/produk aktif dan arsip | Ya | Ya | Hanya aktif | Tolak |
| Kelola/arsipkan kategori dan atribut produk nonstok | Ya | Ya | Tidak | Tolak |
| Penyesuaian stok manual produk aktif/arsip | Ya, melalui RPC | Ya, melalui RPC | Tidak | Tolak |
| Buat penjualan | Ya, melalui RPC | Ya, melalui RPC | Ya, melalui RPC | Tolak |
| Baca seluruh transaksi | Ya | Ya | Ya | Tolak |
| Baca seluruh `transaction_items` | Ya | Ya | Ya | Tolak |
| Baca ledger stok | Ya | Ya | Tidak | Tolak |
| `INSERT` transaksi/item/ledger langsung | Tidak; gunakan RPC terkontrol | Tidak; gunakan RPC terkontrol | Tidak; gunakan RPC terkontrol | Tolak |
| `UPDATE`/`DELETE` transaksi/item/ledger | Tidak | Tidak | Tidak | Tolak |

Matriks ini mencatat keputusan akses final V2. V1 tidak memiliki role aplikasi owner/admin/cashier; hak akses V2 tidak boleh dianggap sebagai fakta V1.

### Kebijakan RLS dan grant per tabel

- **`profiles`:** `SELECT` profil sendiri untuk semua role aktif; owner/admin dapat membaca semua profil pegawai. Pengubahan `display_name` sendiri dibatasi melalui column grant dan RLS. Client tidak dapat insert/delete profil atau mengubah `role`/`is_active`; provisioning dan pengelolaan pegawai memakai proses tepercaya.
- **`categories`:** owner/admin dapat `SELECT` aktif dan arsip serta `INSERT`/`UPDATE`; cashier hanya `SELECT` kategori aktif. Tidak ada `DELETE` aplikasi.
- **`products`:** owner/admin dapat `SELECT` aktif dan arsip serta mengubah kolom nonstok yang diizinkan (`name`, `category_id`, `price`, `is_active`). Cashier hanya `SELECT` produk aktif. Tidak ada direct `INSERT`/`DELETE` atau grant `UPDATE` kolom `stock`; pembuatan melalui `create_product` dan perubahan stok aktif/arsip melalui `adjust_stock`.
- **`transactions`:** semua role aplikasi aktif dapat `SELECT` seluruh baris tanpa syarat `created_by`; tidak ada direct `INSERT`/`UPDATE`/`DELETE`.
- **`transaction_items`:** semua role aktif dapat membaca item yang transaksi induknya dapat dibaca; tidak ada direct `INSERT`/`UPDATE`/`DELETE`.
- **`stock_movements`:** owner/admin dapat `SELECT`; cashier dan anon tidak. Tidak ada direct `INSERT`/`UPDATE`/`DELETE`; penulisan dilakukan melalui RPC/proses migrasi tepercaya.

### Aturan implementasi keamanan

1. Aktifkan RLS pada setiap tabel di schema yang diekspos; buat policy terpisah per operasi `SELECT`, `INSERT`, `UPDATE`, dan `DELETE`.
2. Audit dan cabut grant default `anon`/`authenticated`, lalu grant hanya operasi yang diperlukan. RLS tidak mencabut grant; kedua lapis harus benar.
3. `anon` tidak mendapat akses ke data bisnis. Pengguna `authenticated` tanpa profil aktif juga ditolak oleh semua policy dan RPC.
4. Gunakan `auth.uid()` untuk identitas pemanggil. Helper otorisasi membaca `profiles` secara aman di schema internal agar tidak terjadi policy recursion; helper selalu mensyaratkan `is_active = true` dan tidak mempercayai metadata/JWT role yang dapat diedit pengguna.
5. Cabut grant `INSERT`/`DELETE` profil dari client. Batasi update profil sendiri ke kolom `display_name`; jangan berikan update kolom `role`/`is_active`. Pengelolaan role/status hanya melalui proses tepercaya dengan pemeriksaan owner dan perlindungan owner terakhir.
6. Jangan berikan direct `INSERT`/`UPDATE`/`DELETE` pada `transactions`, `transaction_items`, atau `stock_movements`. Insert transaksi dan item hanya lewat `create_sale`; insert produk dengan stok awal hanya lewat `create_product`; insert penyesuaian hanya lewat `adjust_stock`. Ledger tidak dapat diubah/dihapus. Jangan berikan direct `INSERT` atau update kolom `products.stock`; semua perubahan saldo harus melewati RPC.
7. Policy `SELECT` pada `transactions` mengizinkan seluruh owner/admin/cashier yang profilnya aktif, tanpa filter `created_by`. Policy `SELECT` pada `transaction_items` mengikuti hak baca transaksi induknya, sehingga seluruh role aktif dapat membaca seluruh item. `created_by` tetap untuk atribusi/audit.
8. Policy `SELECT` produk/kategori memberi owner/admin akses ke data aktif dan arsip, sedangkan cashier hanya melihat baris `is_active = true`. Tidak ada grant `DELETE` aplikasi untuk produk/kategori; pengarsipan adalah update `is_active` oleh owner/admin. Validasi database menolak kategori arsip saat membuat produk atau mengganti kategori, dan `create_sale` menolak produk arsip.
9. Jika memakai `SECURITY DEFINER`, set `search_path` kosong, kualifikasikan semua nama schema/tabel, hindari dynamic SQL, periksa `auth.uid()`/profil aktif/role secara eksplisit, cabut execute dari `PUBLIC` dan `anon`, lalu grant hanya ke `authenticated` yang berhak.
10. Jangan menaruh tabel atau function internal helper di schema yang diekspos Data API tanpa kebutuhan. View juga harus ditinjau karena dapat melewati RLS bila dibuat dengan hak pemilik.
11. Uji policy allow/deny untuk anon, profil nonaktif, owner, admin, dan cashier menggunakan Supabase DB tests sebelum deployment.

## 7. RPC produk, penjualan, dan ledger stok

### Function yang diusulkan

- `public.create_sale(p_items jsonb) RETURNS uuid`: membuat satu transaksi penjualan; input hanya daftar `product_id` dan `quantity`.
- `public.adjust_stock(p_product_id uuid, p_delta bigint, p_reason text) RETURNS void`: penyesuaian manual owner/admin.
- `public.create_product(p_name text, p_category_id uuid, p_price numeric, p_initial_stock bigint DEFAULT 0) RETURNS uuid`: membuat produk owner/admin dan, bila stok awal lebih dari nol, mencatat gerakan `opening_balance` dalam transaksi yang sama.

Tiga RPC tersebut cukup untuk penjualan, penyesuaian stok, dan pembuatan produk. Tidak diperlukan RPC publik tambahan untuk kategori: owner/admin dapat mengelola kategori lewat grant dan policy terbatas. Undangan dan pencabutan sesi Auth dilakukan oleh proses server tepercaya, bukan RPC client. Nama/signature di atas adalah rancangan; function belum dibuat atau dijalankan.

### Urutan `create_sale`

1. Pastikan pemanggil adalah pengguna Auth, memiliki profil aktif, dan berhak menjual (`owner`, `admin`, atau `cashier`).
2. Validasi payload: JSON array minimal satu item; ID produk valid dan tidak duplikat; kuantitas integer positif. Tolak produk tidak ditemukan atau `is_active = false` tanpa pengecualian, termasuk produk yang diminta oleh owner/admin.
3. Ambil semua baris produk yang diminta dengan `SELECT ... FOR UPDATE`, mengunci dalam urutan ID produk yang konsisten untuk mengurangi deadlock.
4. Di dalam lock, baca harga dan saldo dari database; tolak seluruh penjualan bila ada stok yang tidak cukup. Client tidak mengirim harga/subtotal/total yang dipercaya.
5. Hitung subtotal dari `products.price * quantity` dan total dari semua subtotal, lalu simpan header transaksi dengan `created_by = auth.uid()`.
6. Simpan item dengan snapshot nama, harga dan subtotal; satu produk hanya satu baris per transaksi.
7. Kurangi saldo produk dengan syarat stok masih mencukupi, dan buat satu `stock_movements` bertipe `sale` per item berisi delta negatif, stok sebelum/sesudah, item transaksi, dan aktor.
8. Kembalikan ID transaksi; seluruh role aktif dapat membaca header dan item transaksi melalui policy SELECT.

RPC berjalan sebagai satu pemanggilan database/transaction. Bila validasi, FK, constraint, insert, atau update mana pun gagal dan function melempar error, seluruh header, item, pengurangan stok, dan ledger ikut rollback—tidak ada pengurangan parsial. Lock baris mencegah dua kasir memakai saldo yang sama secara bersamaan. Tambahkan test concurrency/rollback, bukan hanya test respons UI.

### Pembuatan produk dan stok awal

1. `create_product` mensyaratkan `auth.uid()` terautentikasi dengan profil aktif ber-role `owner` atau `admin`.
2. Validasi nama nonkosong setelah trim dan maksimal 255 karakter, harga nonnegatif yang muat pada `numeric(12,2)`, stok awal nonnegatif yang muat pada `bigint`, serta kategori yang ada dan aktif. Kunci baris kategori selama validasi/pembuatan agar kategori tidak dapat diarsipkan bersamaan sebelum produk tercatat.
3. Insert produk dalam transaksi RPC, dengan `stock = p_initial_stock`. Client tidak dapat mengirim operasi insert tabel produk langsung atau mengubah kolom `stock` langsung.
4. Jika `p_initial_stock > 0`, insert satu `stock_movements` `opening_balance`: `stock_before = 0`, `quantity_change = p_initial_stock`, `stock_after = p_initial_stock`, `created_by = auth.uid()`.
5. Jika `p_initial_stock = 0`, buat produk dengan stok nol dan jangan membuat baris movement. Constraint opening balance mensyaratkan perubahan positif sehingga ledger tidak berisi gerakan nol.
6. Kegagalan insert movement atau langkah lain me-rollback insert produk dan perubahan terkait seluruhnya.

Validasi kategori aktif juga berlaku saat update `products.category_id`, misalnya melalui trigger database yang memeriksa hanya pada insert atau perubahan category. Kunci baris kategori selama validasi agar pengarsipan kategori tidak berlomba dengan pembuatan/perubahan produk. Hal ini menutup jalur direct update berizin owner/admin; FK saja tidak memeriksa `is_active`.

### Penyesuaian stok

`adjust_stock` hanya menerima pemanggil `owner` atau `admin` dengan profil aktif. Function mengunci baris produk sebelum memeriksa saldo; produk harus ditemukan, tetapi boleh aktif maupun arsip. Function menolak delta nol, alasan kosong setelah trim, overflow `bigint`, atau hasil stok negatif. Dalam satu transaksi atomik, function hanya memperbarui `products.stock` dan menambahkan satu `stock_movements` bertipe `adjustment` berisi saldo sebelum/sesudah, delta, alasan, produk, dan aktor. Jika langkah apa pun gagal, seluruh perubahan di-rollback. Function tidak mengubah `products.is_active`; penyesuaian tidak pernah mengaktifkan kembali produk arsip.

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
2. Buat enum `app_role` dan `stock_movement_type`.
3. Buat tabel sesuai urutan dependensi: `profiles`, `categories`, `products`, `transactions`, `transaction_items`, lalu `stock_movements`; tetapkan PK/FK, nullability, default, unique/check constraints, serta index.
4. Buat trigger untuk membuat profil Auth ber-role least-privilege, mengelola `updated_at`, menjaga owner terakhir, dan menolak pembuatan/perubahan kategori produk ke kategori arsip.
5. Buat helper otorisasi di schema internal, aktifkan RLS pada seluruh tabel yang diekspos, dan pasang policy per operasi berdasarkan matriks.
6. Cabut default grants yang tidak perlu. Grant `SELECT` serta kolom/operasi katalog yang diperlukan; jangan grant client direct insert produk, perubahan stok, DML transaksi/item/ledger, atau hak role/aktif profil.
7. Buat RPC `create_product`, `adjust_stock`, dan `create_sale`. Setiap RPC memvalidasi `auth.uid()`, profil aktif, dan role; gunakan `SECURITY DEFINER` dengan pengamanan di bagian 6. Revoke execute dari `PUBLIC`/`anon`, grant hanya ke `authenticated` sesuai kebutuhan.
8. Bootstrap owner pertama melalui jalur administratif satu-kali, verifikasi akses owner, lalu hapus/nonaktifkan jalur bootstrap.
9. Jalankan migrasi katalog/saldo V1 di staging, rekonsiliasi hasil, jalankan strategi pengujian, lalu cutover setelah hasil disetujui.

## 10. Strategi pengujian database

- **Constraint dan relasi:** uji PK/FK, larangan hard delete kategori/produk yang direferensikan, nama kategori kosong/duplikat setelah `lower(btrim(name))`, harga/stok negatif, kuantitas nol/negatif, total/subtotal, dan setiap jenis `stock_movement`.
- **Owner dan profil:** uji maksimal satu owner, bootstrap hanya saat belum ada owner, owner terakhir tidak dapat dinonaktifkan/diturunkan role-nya, serta profile/auth deletion ditolak jika masih direferensikan.
- **RLS dan grants:** uji anon, authenticated tanpa profil, profil nonaktif, owner, admin, cashier; owner/admin bisa membaca data arsip, cashier hanya data aktif; cashier hanya profil sendiri; semua role aktif dapat membaca seluruh transaksi dan item; cashier tidak dapat membaca ledger.
- **Hak tulis langsung:** pastikan client tidak dapat mengubah `products.stock`, insert produk/transaksi/item/ledger langsung, mengubah role/status profil, atau melakukan update/delete transaksi, item, dan ledger. Pastikan kategori/atribut produk tetap hanya dapat dikelola owner/admin.
- **`create_product`:** uji kategori aktif vs arsip, role/akun aktif, stok awal nol (tanpa movement), stok awal positif (tepat satu opening balance), dan rollback produk ketika pembuatan movement gagal.
- **`adjust_stock`:**
  1. Owner dapat menyesuaikan produk aktif.
  2. Admin dapat menyesuaikan produk aktif.
  3. Owner dapat menyesuaikan produk arsip.
  4. Admin dapat menyesuaikan produk arsip.
  5. Cashier ditolak saat mencoba menyesuaikan produk aktif maupun arsip.
  6. Produk tidak ditemukan ditolak; delta nol, alasan kosong, hasil negatif, dan overflow ditolak.
  7. Penyesuaian produk arsip tetap membuat `stock_movements` bertipe `adjustment`.
  8. `is_active` tetap `false` setelah penyesuaian stok produk arsip.
- **`create_sale`:** uji validasi payload, harga dari database, stok cukup/tidak cukup, dan penolakan produk arsip oleh owner, admin, maupun cashier tanpa pengecualian.
- **Atomicity dan konkurensi:** jalankan dua penjualan bersamaan atas saldo terbatas; pastikan saldo tidak negatif dan tidak ada header/item/movement parsial setelah kegagalan.
- **Pencabutan akun:** setelah profil dinonaktifkan, coba ulang operasi dengan token lama dan pastikan RLS/RPC menolak; verifikasi global sign-out melalui proses Auth Admin tepercaya.
- **Migrasi:** bandingkan crosswalk dan jumlah data; cocokkan saldo produk dengan opening movements serta laporan stok per kategori sebelum cutover.

Seluruh test database dilakukan di proyek lokal/staging, bukan proyek produksi. Tidak ada test atau perubahan database yang dijalankan dalam revisi dokumen ini.

## 11. Keputusan Final dan catatan risiko

Keputusan berikut telah disetujui dan menjadi dasar desain V2:

1. Satu instalasi Supabase untuk satu toko/keluarga; tidak ada `store_id`, multi-tenancy, tenant management, atau subscription.
2. Role `owner`, `admin`, dan `cashier`; maksimal satu owner, dibuat pertama kali melalui bootstrap tepercaya yang tidak dapat dipanggil client dan ditutup setelah sukses.
3. Semua pegawai aktif, termasuk cashier, dapat membaca seluruh transaksi dan seluruh `transaction_items`. Cashier hanya membaca profilnya sendiri, tidak membaca ledger, serta tidak mengelola pegawai/kategori/produk dan tidak menyesuaikan stok. Cashier tetap boleh membuat penjualan.
4. Owner/admin membaca produk dan kategori aktif maupun arsip; cashier hanya membaca produk dan kategori aktif. Produk arsip tidak dapat dijual; kategori arsip tidak dapat dipakai untuk produk baru atau perubahan kategori. Owner/admin tetap dapat menyesuaikan stok produk arsip melalui `adjust_stock`; cashier tidak dapat melakukannya.
5. Produk/kategori diarsipkan dengan `is_active`, bukan hard delete melalui aplikasi. Pengarsipan tidak menghapus saldo stok atau riwayat movement. Transaksi, item, dan stock movements immutable. Akun pegawai yang tidak digunakan dinonaktifkan; profil yang dirujuk transaksi/ledger tidak dapat dihapus.
6. Nama kategori unik tanpa membedakan kapitalisasi/spasi di tepi melalui unique functional index `lower(btrim(name))`.
7. Semua PK aplikasi UUID; uang `numeric(12,2)` dan stok/kuantitas `bigint`; waktu disimpan sebagai `timestamptz` dan ditampilkan/dilaporkan dalam `Asia/Jakarta`; mata uang instalasi IDR.
8. Supabase Auth mengelola identitas; RLS dan grants mengendalikan akses; operasi stok/penjualan/produk baru berjalan melalui RPC tepercaya.
9. Migrasi V1 tahap awal hanya produk, kategori, harga, dan saldo stok; transaksi/riwayat penjualan V1 tidak dimigrasikan.

### Catatan risiko/konfirmasi sebelum implementasi

- Tinjau label kanonis untuk kategori V1 yang berbeda kapitalisasi/spasi tetapi menjadi satu key, serta tindakan untuk kategori kosong/null jika ditemukan.
- Pastikan apakah timestamps produk V1 akan dipertahankan; bila ya, verifikasi zona waktu Laravel sebelum konversi.
- Prosedur transfer owner (mengganti owner tanpa periode tanpa owner) belum ditentukan; perlindungan owner terakhir dan maksimal satu owner tetap wajib.
- FK `auth.users ON DELETE CASCADE` menghapus profil yang tidak lagi dirujuk bila akun Auth dihapus secara administratif; operasi aplikasi biasa tetap menonaktifkan akun, bukan menghapusnya.

Migration, trigger, function/RPC, RLS, grants, dan CRUD belum dibuat atau dijalankan. Revisi ini hanya memperbarui dokumen desain.

## 12. Referensi

- [Analisis SmartStock V1](./ANALISIS-SMARTSTOCK-V1.md)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS, grant, dan pengujian policy.
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — grant Data API dan default privilege.
- [Supabase: Database functions](https://supabase.com/docs/guides/database/functions) — RPC, `SECURITY INVOKER/DEFINER`, `search_path`, dan execute privilege.
- [Supabase: User Management](https://supabase.com/docs/guides/auth/managing-user-data) — profil publik yang merujuk `auth.users` dan trigger pembuatan profil.
- [Supabase: Custom claims & RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac) — opsi role claim/Auth Hook; rancangan ini memilih role database di `profiles` agar perubahan role tidak bergantung pada JWT lama.
