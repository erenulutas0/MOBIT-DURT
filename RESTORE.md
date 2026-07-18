# Felaket Kurtarma Rehberi (Restore Runbook)

Yedekler: **Off-site DB Backup** workflow'u her gece 03:30 UTC'de çalışır ve GitHub Actions
artifact'i olarak iki şifreli dosya bırakır (90 gün saklanır):

- `docsbot-db-<TARIH>.sql.gz.gpg` — PostgreSQL dökümü
- `docsbot-files-<TARIH>.tar.gz.gpg` — yüklenen dosyalar (`/opt/docsbot/data`, `uploads`, `vault`)

Şifre çözme anahtarı: MOBIT-DURT reposundaki `BACKUP_PASSPHRASE` secret'ının değeri.
**Bu passphrase'i GitHub dışında da güvenli bir yerde (parola kasası) saklayın** — repo erişimi
kaybedilirse yedekler onsuz açılamaz.

## A. Yedeği indir ve çöz (herhangi bir makinede)

1. GitHub → MOBIT-DURT → Actions → **Off-site DB Backup** → son yeşil koşu → Artifacts → indir.
2. Çöz:
   ```bash
   gpg --batch --decrypt --passphrase 'PASSPHRASE' -o db.sql.gz  docsbot-db-*.sql.gz.gpg
   gpg --batch --decrypt --passphrase 'PASSPHRASE' -o files.tar.gz docsbot-files-*.tar.gz.gpg
   gunzip -k db.sql.gz    # db.sql elde edilir
   ```

## B. Veritabanını geri yükle (yeni/temiz sunucuda)

Ön koşul: `/opt/docsbot` klonlanmış, `.env` dosyası (secrets ile) yerinde, docker kurulu.

```bash
cd /opt/docsbot
docker compose up -d docsbot-postgres          # önce sadece DB
sleep 10
# Boş şemaya dökümü bas (mevcut veri varsa önce DROP gerekir — dikkat!)
cat db.sql | docker exec -i docsbot-postgres psql -U docsbot -d docsbot
```

Mevcut dolu bir DB'nin ÜZERİNE dönülecekse önce:
```bash
docker exec -it docsbot-postgres psql -U docsbot -d postgres \
  -c "DROP DATABASE docsbot;" -c "CREATE DATABASE docsbot OWNER docsbot;"
```

## C. Dosyaları geri yükle

```bash
tar -xzf files.tar.gz -C /            # arşiv mutlak yollarla alınmıştır (/opt/docsbot/...)
ls /opt/docsbot/data                  # doğrula
```

## D. Uygulamayı başlat ve doğrula

```bash
cd /opt/docsbot
docker compose up -d
sleep 30
curl -s -o /dev/null -w "health=%{http_code}\n" https://84-46-251-95.sslip.io/health   # 200 beklenir
```

Uygulamadan giriş yapıp: bir görev, bir alan dokümanı ve bir DM'nin yerinde olduğunu kontrol edin.

## E. Tatbikat (yılda en az 1–2 kez)

Gerçek restore'a hiç ihtiyaç olmadan şu tatbikatı yapın — **canlı DB'ye dokunmadan**:

```bash
# VPS'te geçici bir postgres'e yedeği kur, satır sayılarını canlıyla kıyasla, sonra sil
docker run -d --name restore-test -e POSTGRES_USER=docsbot -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=docsbot postgres:17-alpine
sleep 10
cat db.sql | docker exec -i restore-test psql -U docsbot -d docsbot
docker exec restore-test psql -U docsbot -d docsbot -c "select count(*) from erp_users;"
docker exec restore-test psql -U docsbot -d docsbot -c "select count(*) from erp_tasks;"
docker rm -f restore-test
```

Sayılar canlıdakiyle tutarlıysa yedek **kanıtlanmış** demektir. Tatbikat tarihini not edin.
