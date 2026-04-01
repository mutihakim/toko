# Panduan Instalasi Lengkap (Custom Deployment)

Dokumentasi ini merangkum seluruh proses instalasi **Toko SaaS Boilerplate** untuk deployment instans kedua (atau lebih) di server VPS yang sudah memiliki Nginx dan PHP-FPM. Panduan ini mencakup penyesuaian port, database, environment, dan konfigurasi Web Server agar tidak terjadi konflik data maupun *routing* dengan instalasi yang sudah berjalan.

---

## 1. Prasyarat Domain

Karena aplikasi ini menggunakan skema arsitektur *Subdomain Based Routing* (`{tenant}.domain.com`), **WAJIB** menggunakan top-level domain yang berbeda dari instalasi utama untuk setiap *clone* aplikasi baru (Misalnya: `sahstore.my.id`). Hal ini penting agar *wildcard* Nginx (`*.sahstore.my.id`) tidak tumpang tindih dengan domain SaaS utama Anda.

## 2. Clone Repository & Install Dependencies

Clone repository ke folder yang berbeda (misalnya `/var/www/html/apps/saas2`):
```bash
git clone https://github.com/mutihakim/toko.git /var/www/html/apps/saas2
cd /var/www/html/apps/saas2/project

# Install dependensi backend
composer install --no-interaction --prefer-dist

# Install dependensi frontend
npm install

# Install dependensi layanan WhatsApp
cd ../services/whatsapp
npm install
cd ../../project
```

---

## 3. Database PostgreSQL 🗄️

Anda wajib membuat *database* dan *user* PostgreSQL yang berbeda untuk setiap aplikasi:

```sql
# Login ke postgres
sudo -u postgres psql

# Buat set kredensial baru
CREATE USER toko_user WITH PASSWORD 'saas_pass2';
CREATE DATABASE toko_core OWNER toko_user;
GRANT ALL PRIVILEGES ON DATABASE toko_core TO toko_user;
\q
```

---

## 4. Port Services 🚦

Jika instalasi pertama menggunakan port `8015`, `8095` dan `3025`, Anda wajib menggeser seluruh port pada instalasi baru ini agar tidak terjadi *Address already in use*, misalnya:
- **Port 8016** - App Web Server (PHP Artisan / Octane)
- **Port 8096** - Reverb (WebSocket server)
- **Port 3026** - WhatsApp service
- **Port 8017** - Documentation Site

---

## 5. Environment Variables (.env) ⚙️

Salin konfigurasi dasar `.env`:
```bash
cp .env.example .env
php artisan key:generate
```

Ubah parameter krusial di file `.env` di dalam folder `/project/`:
```env
APP_NAME="SaaS Boilerplate 2"
APP_URL=https://sahstore.my.id
APP_DOMAIN=sahstore.my.id

DB_DATABASE=toko_core
DB_USERNAME=toko_user
DB_PASSWORD=saas_pass2

# Reverb Connection
BROADCAST_DRIVER=reverb
REVERB_PORT=8096

# Sanctum Domain harus mendaftarkan domain utama dan wildard barunya
SANCTUM_STATEFUL_DOMAINS="localhost,127.0.0.1,sahstore.my.id,*.sahstore.my.id"

# Konfigurasi WhatsApp
WHATSAPP_SERVICE_ENABLED=true
WHATSAPP_SERVICE_URL=http://127.0.0.1:3026

# REDIS (Opsional jika Anda menggunakan 1 server Redis yang sama)
REDIS_PREFIX=saas2_database_
```

---

## 6. WhatsApp Service 📱

Agar layanan WhatsApp internal tidak memutus jalur pengiriman notifikasi instans lainnya, ubah file `/services/whatsapp/.env`:

```env
PORT=3026
APP_CALLBACK_URL=http://127.0.0.1:8016
WHATSAPP_INTERNAL_TOKEN=change-me-to-secure-token
```

---

## 7. Session, Cache, & Redis 🗃️

- **File Driver**: Mengingat folder *clone* ini berbeda path sistem operasi dari app utama, konfigurasi bawaan `SESSION_DRIVER=file` dan `CACHE_DRIVER=file` tidak akan saling bentrok ukurannya maupun filenya.
- **Shared Session Cookie**: Pastikan variabel `SESSION_DOMAIN=.sahstore.my.id` (*ditambahkan titik di depan*) sudah dipasang di `.env` agar sesi login pengguna menyeberang dengan mulus ke dashboard tenant (`tenant.sahstore.my.id`).
- **Redis Driver**: JIka Anda memutuskan me-manage cache dalam Redis Server (`127.0.0.1:6379`), instalasi kedua akan saling mengenali dan menghapus sesi apabila Anda lupa mengganti *Key Prefix*. Maka **pastikan `REDIS_PREFIX=namaunik_` berbeda di pengaturan `.env`**.

---

## 8. Web Server Configuration (Nginx) 🌐

Anda harus membuat *Virtual Host* Nginx baru di `/etc/nginx/sites-available/sahstore.my.id`. Config Nginx harus secara spesifik me-*redirect* dan mem-*proxy* port `8016` (Web) dan port `8096` (Sockets).

### Contoh Blok Nginx
```nginx
# Tenant Subdomains - HTTPS (*.sahstore.my.id)
server {
    server_name *.sahstore.my.id sahstore.my.id;

    location / {
        proxy_pass http://127.0.0.1:8016; # -> PORT BARU
        proxy_set_header Host $host;
        # ... header standar proxy ...
    }

    # Proxy WebSocket connection for Reverb
    location /app {
        proxy_pass http://127.0.0.1:8096; # -> PORT BARU
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # ... Inklusi Konfigurasi Sertifikat SSL Certbot Anda ...
}
```

---

## 9. Build Frontend, Migrasi & Menjalankan PM2

Jika file konfigurasi telah siap, eksekusi migrasi dari backend dan build static content.

```bash
# Lakukan Migrasi Penuh
php artisan migrate:fresh --seed --force

# Rendering React Application
npm run build

# Menyiapkan Docs (Pastikan base url = '/' dalam config.ts bila dideploy di root domain)
npm run docs:build
```

### Konfigurasi PM2 Process Name

Karena PM2 mengabaikan direktori jika mendapati proses dengan *"nama yang sama"*, Anda harus memperjelas penamaan proses (contoh `saas2-*`) pada `ecosystem.config.cjs` maupun config lainnya, lalu perbarui *Arguments/Port*-nya:

1. **ecosystem.config.cjs**: Ubah Reverb (`saas2-reverb`, `--port=8096`) dan Queue Worker (`saas2-queue-worker`).
2. **toko-web.config.cjs**: Ubah Web Server menjadi `saas2-web`: `args: "serve --host=0.0.0.0 --port=8016"`.
3. **services/whatsapp/pm2.config.js**: Ganti nama `saas2-whatsapp`, serta perbarui \`PORT=3026\` dan \`CALLBACK_URL\`.

Jalankan serentak untuk membangkitkan instance Aplikasi Kedua:
```bash
pm2 start ecosystem.config.cjs
pm2 start toko-web.config.cjs
cd ../services/whatsapp && pm2 start pm2.config.js

pm2 save
```
