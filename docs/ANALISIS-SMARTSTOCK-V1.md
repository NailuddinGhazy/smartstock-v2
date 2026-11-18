# Analisis SmartStock V1

Dokumen ini mencatat kondisi yang ditemukan pada kode SmartStock V1 dan rekomendasi terpisah untuk adaptasi di V2. Folder V1 hanya digunakan sebagai referensi dan tidak diubah.

## Cakupan pemeriksaan

Pemeriksaan mencakup migrasi database, model Laravel, endpoint API dan login, implementasi frontend untuk produk/stok/transaksi/laporan, README, dan tes backend. File utama yang diperiksa:

- `backend/database/migrations/2026_10_15_173918_create_products_table.php`
- `backend/database/migrations/2026_10_15_180343_add_category_to_products_table.php`
- `backend/database/migrations/2026_10_15_174313_create_transactions_table.php`
- `backend/database/migrations/2026_10_15_174403_create_transaction_details_table.php`
- `backend/database/migrations/0001_01_01_000000_create_users_table.php`
- `backend/database/migrations/2026_10_15_174810_create_personal_access_tokens_table.php`
- `backend/app/Models/Product.php`
- `backend/app/Models/Transaction.php`
- `backend/app/Models/TransactionDetail.php`
- `backend/app/Models/User.php`
- `backend/routes/api.php`
- `backend/routes/web.php`
- `smartstock/frontend/src/App.jsx`
- `smartstock/frontend/src/api.js`
- `backend/tests/Feature/ExampleTest.php`

## Kondisi asli V1

### Fitur yang tersedia

- **Dashboard:** ringkasan produk, stok, nilai stok, transaksi, pendapatan, produk terbaru, dan grafik pendapatan tujuh hari terakhir.
- **Produk:** menampilkan, menambah, mengubah, dan menghapus produk. Form kategori berupa input teks; tidak ada tabel atau pengelolaan kategori terpisah.
- **Stok:** menampilkan stok dan status. Stok sebanyak lima unit atau kurang ditandai menipis. Antarmuka menyediakan aksi tambah atau kurang satu unit.
- **Kasir:** mencari produk, mengelola keranjang dan kuantitas, menyimpan transaksi, menampilkan/mencetak nota, serta melihat riwayat penjualan.
- **Laporan:** menampilkan pendapatan, jumlah transaksi, unit terjual, produk terlaris, grafik dan riwayat transaksi untuk hari ini, minggu ini, minggu pilihan, bulan ini, tahun ini, tanggal pilihan, atau semua transaksi.
- **Autentikasi:** login/logout berbasis sesi Laravel dan Sanctum; endpoint bisnis pada `/api/*` memerlukan autentikasi.

### Struktur database dan relasi

Database bawaan V1 adalah SQLite; README backend juga menyebut konfigurasi koneksi MySQL. Skema bisnisnya:

| Tabel | Kolom utama | Relasi dan perilaku |
| --- | --- | --- |
| `products` | `id`, `name`, `category`, `price DECIMAL(12,2)`, `stock UNSIGNED INTEGER` default `0`, timestamps | `category` berupa teks dengan default `Umum`; tidak ada tabel `categories`. |
| `transactions` | `id`, `total DECIMAL(12,2)` default `0`, timestamps | Tidak memiliki `user_id` atau relasi pemilik/toko. |
| `transaction_details` | `id`, `transaction_id`, `product_id`, `quantity UNSIGNED INTEGER`, `price DECIMAL(12,2)`, `subtotal DECIMAL(12,2)`, timestamps | Setiap detail belongs-to satu transaksi dan satu produk. Transaksi has-many detail. |

Foreign key `transaction_details.transaction_id` mengarah ke `transactions.id` dan menggunakan cascade saat transaksi dihapus. Foreign key `transaction_details.product_id` mengarah ke `products.id` dan membatasi penghapusan produk yang sudah memiliki detail transaksi. Detail menyimpan harga dan subtotal transaksi saat itu, tetapi nama produk di riwayat/nota diambil melalui relasi ke data produk saat ini.

Tabel Laravel lain yang muncul dari migrasi adalah `users`, `password_reset_tokens`, `sessions`, `personal_access_tokens`, `cache`, `cache_locks`, `jobs`, `job_batches`, dan `failed_jobs`. Tabel-tabel tersebut merupakan kebutuhan autentikasi/infrastruktur Laravel, bukan inti skema penjualan. Model `User` menyembunyikan password dan remember token saat serialisasi serta menggunakan cast password hashed. Migrasi V1 tidak menghubungkan transaksi ke pengguna.

### Model Laravel

- `Product` mengizinkan mass assignment untuk `name`, `category`, `price`, dan `stock`.
- `Transaction` mengizinkan mass assignment untuk `total` dan mendefinisikan relasi `details()` sebagai has-many.
- `TransactionDetail` mengizinkan `transaction_id`, `product_id`, `quantity`, `price`, dan `subtotal`, serta mendefinisikan relasi belongs-to ke transaksi dan produk.
- Model bisnis belum menunjukkan casts khusus atau aturan relasi kategori.

### CRUD produk dan aturan validasi

Endpoint bisnis dilindungi `auth:sanctum`.

- `GET /api/products` mengembalikan produk terbaru.
- `POST /api/products` dan `PUT /api/products/{product}` mewajibkan nama dan kategori berupa string maksimal 255 karakter, harga numerik minimal 0, dan stok bilangan bulat minimal 0.
- `PATCH /api/products/{product}/stock` menerima nilai stok akhir berupa bilangan bulat minimal 0. API ini menetapkan stok secara absolut; UI menggunakannya untuk menaikkan/menurunkan satu unit.
- `DELETE /api/products/{product}` menghapus produk. Bila ada detail transaksi yang merujuk produk tersebut, foreign key membatasi penghapusan.
- Validasi backend tidak mewajibkan nama/kategori unik dan tidak menetapkan batas maksimum harga selain batas tipe database.
- Kolom pencarian daftar produk pada UI V1 tidak memfilter daftar; pencarian produk tersedia di antarmuka kasir.

### Alur transaksi dan pengurangan stok

1. UI mengirim array `items`; setiap item berisi `product_id` dan `quantity`. UI melakukan pemeriksaan awal terhadap keranjang dan stok yang sedang ditampilkan.
2. Backend mewajibkan `items` berupa array minimal satu item, setiap `product_id` integer, unik dalam payload, dan ada di tabel produk; setiap `quantity` bilangan bulat minimal 1.
3. Backend memulai transaksi database, mengurutkan ID produk, mengambil baris produk terkait berdasarkan ID dalam urutan terurut, dan meminta row lock (`lockForUpdate`).
4. Backend memeriksa keberadaan produk dan kecukupan stok terkini. Harga tidak dipercaya dari klien: subtotal dihitung dari harga produk di database dikali kuantitas. Total merupakan penjumlahan subtotal.
5. Backend menyimpan satu baris `transactions`, membuat satu `transaction_details` per produk dengan kuantitas, snapshot harga, dan subtotal, lalu mengurangi stok tiap produk.
6. Operasi tersebut berada dalam satu transaksi database; jika gagal, perubahan database dibatalkan. Respons transaksi menyertakan detail beserta relasi produk untuk nota/riwayat.
7. Setelah respons sukses, frontend memperbarui stok lokal, menambahkan transaksi ke riwayat, mengosongkan keranjang, dan menampilkan nota.

Validasi stok di UI hanya pemeriksaan awal; validasi backend dan transaksi database merupakan perlindungan yang menentukan. Nilai stok negatif tidak diterima oleh endpoint produk dan stok tidak boleh kurang dari jumlah yang dijual.

### Perhitungan laporan dan filter tanggal

V1 mengambil daftar transaksi lengkap melalui `GET /api/transactions` beserta detail dan produk. Agregasi laporan dilakukan di browser, bukan query laporan backend.

- Pendapatan adalah penjumlahan `transactions.total`.
- Jumlah transaksi adalah jumlah transaksi yang lolos filter.
- Unit terjual adalah penjumlahan `quantity` pada seluruh detail transaksi terfilter.
- Produk terlaris adalah produk dengan kuantitas terjual terbanyak pada periode tersebut.
- Grafik hari ini dan tanggal pilihan mengelompokkan pendapatan per jam; minggu pilihan/berjalan per hari; bulan berjalan per hari; tahun berjalan per bulan; seluruh transaksi per bulan.
- Minggu dimulai Senin dan berakhir Minggu. Tanggal pilihan dan minggu pilihan tidak dapat memilih tanggal masa depan dari kontrol UI.
- Filter bulan dan tahun hanya tersedia untuk bulan/tahun berjalan. Tidak ada pemilih bulan atau tahun lampau.
- Pengelompokan tanggal memakai `Date` di browser dan kunci tanggal lokal `YYYY-MM-DD`; sehingga interpretasi hari dapat bergantung pada zona waktu lingkungan browser. Tidak ada endpoint laporan berparameter tanggal di backend.

### Autentikasi dan cakupan tes

`POST /login` memvalidasi email dan password, mencoba autentikasi Laravel, lalu meregenerasi sesi; kredensial salah menghasilkan HTTP 401. `POST /logout` mengakhiri sesi dan meregenerasi token CSRF. API bisnis memakai middleware `auth:sanctum`. Dari rute yang diperiksa, tidak tampak aturan role/otorisasi granular untuk operasi bisnis.

Tes backend yang diperiksa hanya memastikan route `/` merespons sukses. README juga menyatakan tes API produk, stok, transaksi, dan autentikasi belum tersedia. File CSV/spreadsheet ada di proyek V1, tetapi dokumentasi backend menyebut belum ada alur aplikasi otomatis untuk mengimpor file tersebut.

## Rekomendasi adaptasi untuk V2 dengan Supabase PostgreSQL

Bagian ini adalah rekomendasi, bukan deskripsi perilaku V1.

### Skema dan relasi yang disarankan

- Pertahankan entitas bisnis `products`, `transactions`, dan detail transaksi; beri nama tabel detail secara konsisten, misalnya `transaction_items`.
- Buat tabel `categories` dengan identitas dan nama unik, lalu hubungkan produk melalui `category_id`. Saat migrasi data, nilai kategori V1 yang berupa teks perlu dipetakan; nilai kosong atau tidak diketahui dapat dipetakan secara eksplisit ke kategori “Umum”.
- Gunakan `numeric(12,2)` untuk nilai uang dan integer untuk kuantitas/stok. Tambahkan constraint database untuk nilai non-negatif agar aturan penting tidak hanya bergantung pada UI.
- Pertahankan snapshot harga pada item transaksi. Pertimbangkan juga snapshot nama produk agar nota dan riwayat lama tidak berubah ketika nama produk diedit.
- Pertahankan aturan referensial: jangan menghapus produk yang memiliki penjualan; detail dapat ikut terhapus jika transaksi induk dihapus, sesuai kebijakan retensi V2.
- Tambahkan `created_by`/`store_id` hanya bila model pengguna dan kepemilikan toko V2 memang memerlukannya. V1 tidak menyimpan hubungan tersebut.
- Supabase Auth menggantikan kebutuhan menyalin skema password/sesi Laravel. Terapkan Row Level Security (RLS) sesuai aturan kepemilikan pengguna/toko V2 dan jangan mengekspos kunci service role ke klien.
- Tambahkan indeks pada waktu transaksi dan kolom foreign key yang dipakai dalam pencarian atau agregasi.

### Perilaku dan fitur yang disarankan untuk diperbaiki

1. Implementasikan pembuatan transaksi sebagai satu fungsi PostgreSQL/RPC atomik: validasi produk/kuantitas/stok, ambil harga dari database, simpan transaksi dan item, serta kurangi stok dalam satu operasi. Jangan mempercayai total atau harga yang dikirim browser.
2. Catat perubahan stok manual sebagai stock movements (jenis perubahan, jumlah, waktu, alasan, dan aktor) agar penyesuaian dapat diaudit; tentukan apakah stok akhir juga dipelihara sebagai nilai ringkasan.
3. Pindahkan agregasi laporan ke query atau fungsi server dengan rentang waktu yang terdefinisi, paginasi riwayat, dan batas akhir eksklusif. Tentukan zona waktu bisnis, misalnya Asia/Jakarta, secara konsisten untuk query, grafik, dan tampilan.
4. Gunakan representasi uang desimal secara konsisten di semua lapisan; hindari akumulasi uang dengan floating point di browser.
5. Tambahkan tes untuk validasi CRUD, stok nol/kurang, item produk duplikat, transaksi gagal/atomis dan akses bersamaan, batas tanggal laporan, RLS, serta aturan penghapusan.
6. Putuskan secara eksplisit perilaku yang belum menjadi kebijakan khusus di V1: arsip atau hapus produk, ambang stok menipis yang dapat dikonfigurasi, kategori yang boleh dihapus, role pengguna, serta apakah satu akun mencakup satu toko atau beberapa toko.
7. Perbaiki pencarian produk dan pertimbangkan paginasi/filter server untuk daftar besar.

## Status pemeriksaan V2

Saat analisis awal dilakukan, folder `smartstock-v2` hanya berisi metadata Git (`.git`); belum ada source aplikasi, skema, atau migrasi V2 untuk dibandingkan. Dokumen ini tidak mengimplementasikan aplikasi atau mengubah file V1.
