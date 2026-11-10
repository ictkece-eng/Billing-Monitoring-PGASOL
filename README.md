<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JfmsB3ObC29m55gKJrFkFEkwtCPO4TRr

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## (Optional) Persist data to TiDB (TiDB Cloud / TiDB Server)

The frontend **must not** connect directly to TiDB (it would expose credentials).
This repo includes a small Express API server under `server/` that acts as a secure bridge.

### 1) Create table

Run the SQL in `server/schema.sql` on your TiDB database (once).

### 2) Configure environment

Fill TiDB credentials in `.env` (this file is gitignored). You can either:

- Use `TIDB_URL` (recommended for TiDB Cloud), e.g. `mysql://.../DB?ssl=true`, OR
- Use `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`.

For TiDB Cloud, set `TIDB_SSL=true` (or `?ssl=true` in `TIDB_URL`).
If your environment requires a custom CA, set `TIDB_SSL_CA_BASE64`.

### 3) Run API server + frontend

In two terminals:

- API server: `npm run server:dev`
- Frontend: `npm run dev`

The app will show a button **Upload TiDB** and will also try to load existing records from TiDB on startup.

### Monitoring multiple projects

Pilih proyek aktif sebelum impor Excel atau input manual. Tabel, dashboard, dan upload TiDB akan mengikuti proyek yang dipilih. Data lama yang belum memiliki penanda proyek otomatis dianggap sebagai `SPHR01031A`; data untuk `SPHR01300A` disimpan terpisah. Anggaran kontrak `SPHR01300A` ditetapkan Rp 182.227.686.800 di `constants.tsx` (`SPHR01300A_CONTRACT_VALUE_IDR`), dan persentase serapannya dihitung dari Total Nilai RO Monitoring Billing (baris area FOD dikecualikan).

Di beranda proyek `SPHR01031A`, kartu di bawah Pencarian Cepat menerima impor `Dashboard.xlsx` dan `Database Workflow.xlsx`. Snapshot Dashboard, tabel Database Workflow, dan pivot disimpan melalui API pada TiDB yang sama, sehingga dapat dimuat dari perangkat/browser berbeda; data lokal lama otomatis dipindahkan ke server jika snapshot server belum tersedia. Kartu Dashboard menampilkan KPI, tren bulanan, dan tabel status dari workbook dengan pencarian pada tabel. Kartu Database Workflow menampilkan seluruh kolom/baris master dengan pencarian dan halaman, serta mengganti data `SPHR01031A` di tampilan aplikasi ketika workbook diimpor. Kartu Pivot Nilai Tagihan mengelompokkan jumlah nilai berdasarkan Tim, Nama User, dan Periode Bulan dari Database Workflow, termasuk subtotal tim dan grand total, dan dapat dicari berdasarkan tim, user, atau periode. Insight & Visualisasi menggunakan nilai Tim, Nama User, Periode, Nilai Tagihan, dan STATUS dari Database Workflow yang sama selama snapshot tersedia, mengikuti filter periode dan pencarian aplikasi. Pagu SPHR01031A tetap Rp 185.068.724.480 dan kartu ringkasan Status2 berdasarkan filter aktif tidak ditampilkan. Sinkronisasi antarperangkat memerlukan API berjalan dan konfigurasi TiDB yang sama.

Setelah impor Database Workflow, admin dapat memilih **Ganti data SPHR01031A di TiDB** pada kartu tersebut. Aksi ini meminta konfirmasi lalu mengganti data proyek itu dalam satu transaksi; data SPHR01300A dan proyek lain tidak dihapus. Baris berisi nilai tagihan tetap diimpor meskipun nomor transaksinya kosong, sehingga jumlahnya dapat berbeda dari hitungan nomor pada Dashboard.xlsx.

Untuk input billing manual `SPHR01300A`, pilih proyek tersebut lalu buka **Monitoring Billing**. Data dicatat per periode bulanan; total Nilai RO, Actual, Remaining, dan SA dihitung otomatis. Entri disimpan di tabel TiDB terpisah dari transaksi billing umum.

Di beranda proyek `SPHR01300A`, kartu **Impor Monitoring Billing SPHR01300A** menyediakan pemilih bulan dan tahun yang fleksibel. Pilih periode dan workbook yang sesuai; setelah konfirmasi, data hanya mengganti periode tersebut. Jika workbook mencantumkan bulan dan tahun pada judulnya, judul juga divalidasi dengan periode yang dipilih. Penggantian dijalankan dalam satu transaksi agar data bulan lain tetap utuh dan data lama periode terpilih tetap tersedia jika impor gagal. Periksa hasilnya pada halaman **Monitoring Billing** dengan memilih periode yang sama.

Saat proyek `SPHR01300A` dipilih di beranda, kartu ringkasannya hanya menampilkan jumlah baris, pagu, dan nilai terserap (sama seperti `SPHR01031A`). Detailnya tampil di dashboard di bawahnya: baris Monitoring Billing dipetakan ke bentuk record (PIC → Nama User, AREA → Tim, Nilai RO → Nilai, tahap BAST terakhir → Status2) sehingga Grand Total, KPI serapan, pivot, tabel, dan grafik bekerja seperti proyek `SPHR01031A`. Pivot memakai kolom tahap BAST (bukan Status2), dan kartu ringkasan Status2 diganti kartu tahapan BAST. Baris area FOD tetap tampil di tabel detail, tetapi tidak dihitung ke total/pivot/grafik maupun serapan kontrak.

Tujuh kartu tahapan BAST di beranda selalu sinkron dengan checkbox tahapan di **Monitoring Billing**: setiap checkbox yang dicentang/dilepas memicu ringkasan dimuat ulang, dan tab yang kembali aktif juga menyegarkan data (maksimal sekali per 2 detik).

## Deploy to Vercel (with TiDB)

This repo includes Vercel Serverless Functions under `api/`.
When deployed to Vercel:

- Frontend is served from `dist/`
- Backend endpoints are available at:
   - `GET /api/health`
   - `GET /api/budget-records`
   - `POST /api/budget-records/upload`
   - `GET /api/workbook-snapshots`
   - `PUT /api/workbook-snapshots`

### Vercel Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables** (do not commit secrets):

- `TIDB_URL` (recommended): `mysql://USER:PASSWORD@HOST:4000/DBNAME?ssl=true`
   - OR set `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`
- `TIDB_SSL` = `true` (if not using `?ssl=true`)
- `TIDB_SSL_CA_BASE64` (optional)

Also set (if you use AI insight):

- `GEMINI_API_KEY`

Optional (admin tools UI lock):

- `VITE_TOOLS_PIN` (contoh: `123456`) — dipakai untuk membuka menu tersembunyi (Impor Excel + Upload/History TiDB).
   - Penting: ini dibaca oleh frontend (Vite), jadi harus diset sebagai env var di Vercel dan **re-deploy**.
