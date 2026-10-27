# Daftar Tugas (Task List) - Marketplace Analytic Dashboard

Dokumen ini berisi rincian langkah pengerjaan (*checklist*) berdasarkan [PRD.md](./PRD.md) untuk membangun aplikasi **Marketplace Analytic Dashboard** (Shopee, Tokopedia, Blibli).

---

## Tahap 1: Inisialisasi Proyek & Database Lokal
- [x] **1.1. Setup Proyek Web (Next.js + TypeScript + Tailwind CSS)**
  - [x] Inisialisasi struktur proyek Next.js (App Router) di folder proyek.
  - [x] Instalasi library pendukung UI & ikon (`lucide-react`, `clsx`, `tailwind-merge`).
  - [x] Instalasi library grafik analitik (`recharts`) dan export Excel/CSV (`xlsx`).
- [x] **1.2. Setup Database Lokal (SQLite)**
  - [x] Instalasi & konfigurasi database lokal (`node:sqlite` di `data/marketplace.db`).
  - [x] Pembuatan skema tabel `SearchSession` (menyimpan kata kunci, pilihan marketplace, ringkasan harga, waktu pencarian).
  - [x] Pembuatan skema tabel `ProductSnapshot` (menyimpan nama produk, link, gambar, nama toko, **kota penjual**, badge toko, harga final, harga asli, % diskon, total terjual, rating, jumlah ulasan).
  - [x] Pembuatan fungsi helper CRUD database (simpan hasil pencarian, ambil daftar riwayat, ambil detail sesi, hapus riwayat).

---

## Tahap 2: Pembuatan Mesin Scraper & Normalisasi Data (Playwright)
- [x] **2.1. Setup Playwright & Persistent Browser Profile**
  - [x] Instalasi `playwright` beserta dukungan browser lokal (Chrome/Edge/Chromium).
  - [x] Konfigurasi *Persistent Browser Context* (menyimpan sesi/cookies di folder lokal `.browser-profile` agar sesi login/verifikasi aman dari Captcha).
  - [x] Pembuatan fitur pembuka browser sesi manual (*Open Browser Session*) jika pengguna perlu login akun Shopee/Tokopedia/Blibli sekali di awal.
- [x] **2.2. Utilitas Normalisasi Data (Data Parser)**
  - [x] Fungsi konversi format harga (`"Rp45.000"` -> `45000`).
  - [x] Fungsi perhitungan persentase diskon penjual (`price_original` vs `price_final` -> `discount_pct`).
  - [x] Fungsi konversi teks terjual (`"1rb+ terjual"`, `"10RB+ Terjual"`, `"Terjual 250+"` -> angka integer `1000`, `10000`, `250`).
  - [x] Fungsi pembersihan nama **Kota Penjual (`shop_city`)** agar seragam (misal menormalisasi `"Kota Jakarta Selatan"` / `"Jakarta Selatan"`).
- [x] **2.3. Modul Scraper per Marketplace**
  - [x] **Scraper Tokopedia**: Mengambil daftar produk dari pencarian Tokopedia (Nama produk, Harga Final, Harga Coret, % Diskon, Nama Toko, Kota Penjual, Badge Toko, Terjual, Rating).
  - [x] **Scraper Blibli**: Mengambil daftar produk dari pencarian Blibli (Nama produk, Harga Final, Harga Coret, % Diskon, Nama Toko, Kota Penjual, Terjual, Rating).
  - [x] **Scraper Shopee**: Mengambil daftar produk dari pencarian Shopee menggunakan intercept API / DOM dengan profil browser lokal (Nama produk, Harga Final, Harga Coret, % Diskon, Nama Toko, Kota Penjual, Terjual, Rating).

---

## Tahap 3: Pembuatan Backend API Routes
- [x] **3.1. Endpoint Pencarian & Scraping (`POST /api/search`)**
  - [x] Menerima input `keyword`, daftar `marketplaces` (`tokopedia`, `shopee`, `blibli`), `limit` jumlah data, dan `sortBy`.
  - [x] Menjalankan scraper secara berurutan/paralel dan menggabungkan hasilnya.
  - [x] Menghitung metrik agregat sesi (rata-rata harga, harga termurah, harga termahal, total item) dan menyimpannya ke database SQLite.
- [x] **3.2. Endpoint Riwayat Pencarian (`GET /api/history` & `GET /api/history/[id]`)**
  - [x] Mengambil daftar seluruh riwayat pencarian yang pernah dilakukan.
  - [x] Mengambil detail produk dari sesi pencarian tertentu tanpa perlu *scrape* ulang.
  - [x] Endpoint `DELETE /api/history/[id]` untuk menghapus riwayat pencarian tertentu.
- [x] **3.3. Endpoint Manajemen Browser (`POST /api/browser-session`)**
  - [x] Membuka jendela browser profil lokal agar pengguna bisa mengecek/login marketplace jika dibutuhkan.

---

## Tahap 4: Pembuatan Frontend Dashboard & Visualisasi Analitik
- [x] **4.1. Layout Utama & Sidebar Riwayat**
  - [x] Desain header & sidebar untuk melihat daftar **Riwayat Pencarian** yang tersimpan di database.
  - [x] Fitur klik riwayat untuk langsung memuat data lama ke dashboard.
- [x] **4.2. Form Kontrol Pencarian**
  - [x] Input kata kunci pencarian (contoh: *"fillet dada ayam"*).
  - [x] Pilihan checkbox Marketplace (**Tokopedia**, **Shopee**, **Blibli**).
  - [x] Pilihan jumlah batas produk per marketplace & tombol **Mulai Analisa**.
  - [x] Indikator *loading progress* saat proses pengambilan data berlangsung.
- [x] **4.3. Kartu Ringkasan Statistik (KPI Summary Cards)**
  - [x] Kartu **Total Produk & Jumlah Toko/Kota Unik**.
  - [x] Kartu **Rata-rata Harga Pasar**, dilengkapi info Harga Termurah (Min) & Termahal (Max).
  - [x] Kartu **Total Volume Terjual & Estimasi Omzet Pasar** (`Harga Final × Total Terjual`).
  - [x] Kartu **Analisis Diskon Penjual** (% produk yang memakai diskon & rata-rata besaran diskon penjual).
- [x] **4.4. Grafik Analitik Visual (Charts)**
  - [x] **Grafik 1: Perbandingan Harga Antar Marketplace (Bar Chart)** — Rata-rata, Min, dan Max harga di Shopee vs Tokopedia vs Blibli.
  - [x] **Grafik 2: Distribusi Rentang Harga (Price Histogram)** — Sebaran jumlah produk berdasarkan kelompok harga.
  - [x] **Grafik 3: Sebaran Kota Penjual Terbanyak (City Distribution Chart)** — Kota mana yang paling banyak penjual & volume penjualannya.
  - [x] **Grafik 4: Top 8 Produk / Toko Terlaris (Horizontal Bar Chart)** — Toko dengan penjualan tertinggi beserta kotanya.
- [x] **4.5. Tabel Data Produk Interaktif & Export**
  - [x] Tabel lengkap dengan foto produk, badge marketplace, nama produk (klik ke link asli), **nama toko**, **kota penjual**, harga final, harga coret + badge `% diskon`, total terjual, estimasi omzet, dan rating.
  - [x] **Filter Interaktif**: Filter Marketplace, **Dropdown Filter Kota Penjual**, Filter Nama Produk/Toko, dan toggle **Hanya Produk Diskon**.
  - [x] **Sorting Kolom**: Urutkan berdasarkan Terjual Terbanyak, Harga Termurah/Termahal, Diskon Terbesar, Rating Tertinggi, atau Estimasi Omzet.
  - [x] **Tombol Export**: Unduh data yang sedang ditampilkan ke file **Excel (`.xlsx`)** atau **CSV (`.csv`)**.

---

## Tahap 5: Pengujian & Penyempurnaan (Testing & Refinement)
- [x] **5.1. Uji Coba Studi Kasus Nyata**
  - [x] Pengujian pencarian kata kunci **"fillet dada ayam"** di Tokopedia, Blibli, dan Shopee.
  - [x] Verifikasi keakuratan data harga, diskon penjual, kota penjual, total terjual, dan rating.
- [x] **5.2. Uji Coba Database & Fitur Export**
  - [x] Memastikan riwayat tersimpan dengan benar di SQLite dan dapat dibuka kembali.
  - [x] Memastikan file hasil Export Excel/CSV rapi dan lengkap.
