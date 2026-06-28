# TODO_PREMOTERM

Bu dosya DocsBot Ops icin premortem notudur: "Iki ay sonra patron demosu basarisiz olduysa neden oldu?" sorusuna gore tutulur.

## Premortem Senaryosu

Sistem demo gununde calisiyor gibi gorundu ama kullanicilar arasi yetki sinirlari net degildi, mesajlar yanlis kisilere akti, Telegram belgelerine erisim kontrolsuz kaldi, admin onay surecleri tutarsizdi ve testler sadece mutlu yolu kapsiyordu. Sonuc: patron sistemi guvenilir bir operasyon araci olarak gormedi.

## Olmali

- Her ekran backend yetkisiyle desteklenmeli; frontend gizleme tek basina guvenlik kabul edilmemeli.
- Mesajlar gorev bazli, kullanici bazli ve okunma durumlu olmali.
- Calisan gorevi "tamamladim" diyebilmeli; gorev ancak admin onayindan sonra done olmali.
- Bildirimler kullaniciya ozel olmali ve okunma durumu backend'de saklanmali.
- Telegram/Tender Hub dosyalari rol, gorev ve ihale baglamina gore goruntulenmeli.
- Demo verisi ile gercek veri kesin ayrilmali.
- SQLite ve vault icin kolay backup/restore proseduru olmali.
- Kritik akislarda unit, integration ve browser smoke test olmali.

## Olmamali

- Mock veri production ekranlarinda gorunmemeli.
- Kullanici kendisine atanmamis goreve mesaj, tamamlama istegi veya dosya ekleyememeli.
- Admin disi kullanicilar hesap talepleri, tum calisan listesi, klasor agaci ve Telegram yonetim ekranlarina erisememeli.
- Token, parola, Telegram bot tokeni veya dosya yolu gibi hassas bilgiler loglanmamali.
- Webhook ve bot komutlari herkese acik admin islemi yapmamalidir.

## Kritik Riskler

- Java migration parity: endpoint JSON shapes or file behavior can silently diverge from the working Python implementation.
- Big-bang rewrite: replacing every backend feature at once would make rollback and fault isolation impractical.
- Dual-write corruption: Python and Java writing the same domain can produce duplicate notifications, Telegram documents, or inconsistent task state.
- Backend authorization eksikligi: UI gizlese bile endpoint'ler dogrudan cagrilabilir.
- Mesaj izolasyonu: task-specific thread yoksa herkes her gorevi gorebilir.
- Dosya erisimi: Tender Hub dosyalari ileride gorevlerle paylasilacaksa dosya bazli izin gerekir.
- Presence yaniltici olabilir: tarayici kapanirsa online durumu stale kalabilir.
- Obsidian/vault dosya adlari: farkli bilgisayarlarda path ve encoding sorunlari cikabilir.
- Telegram bot abuse: bilinmeyen grup/kullanici botu dokuman deposu gibi kullanabilir.

## TODO

- [x] FastAPI OpenAPI ve kritik response fixture'larini Java gecisinden once dondur.
- [x] Her migrate edilen domain icin tek writer ve route owner tablosu tut.
- [ ] Java/Python contract parity testleri yaz.
- [ ] PostgreSQL veri migrasyonu icin count, unique ve checksum dogrulama raporu uret.
- [ ] Python kaldirilmadan once rollback provasi yap.
- [x] Backend'e gercek session token/JWT ve role guard ekle.
- [x] Aktif Java ERP endpoint'lerine admin/user izin kontrolu ekle.
- [x] Calisan mesajlarini sadece atandigi gorevlerle sinirla.
- [x] Calisan tamamlama istegini sadece atandigi gorevlerle sinirla.
- [x] ERP gorev dosyasi indirme/goruntuleme endpoint'lerinde gorev yetkisi kontrolu ekle.
- [ ] Telegram admin allowlist ve grup allowlist ekle.
- [x] Mesajlari task_id ve gorev atamalariyla izole et.
- [x] Bildirim dropdown ve tamamlama onayi davranisini browser smoke test ile sabitle.
- [ ] Presence heartbeat endpoint'ini frontend interval'i ile bagla.
- [ ] Demo seed komutunu production database'den ayir.
- [ ] Playwright smoke: login, hesap talebi, admin onayi, gorev atama, mesajlasma, bildirim okundu.
- [ ] Backup/restore scriptleri: `data/db.sqlite3`, `data/originals`, `vault`.

## Test Stratejisi

- Unit: classifier, storage, ERP service kurallari.
- Integration: gecis sirasinda FastAPI karakterizasyon testleri; hedefte Spring Boot auth, task/message/notification ve PostgreSQL testleri.
- Contract: frontend API client'in backend response shape'i ile uyumu.
- Browser smoke: admin ve calisan iki ayri oturumda temel akislari dogrulama.
- Regression: daha once bozulan login, sidebar, bildirim ve mesaj akislari icin sabit test.

## Done Criteria

- Admin ve calisan girisi temiz aciliyor.
- Calisan yalniz kendi gorevlerini, mesajlarini ve bildirimlerini goruyor.
- Admin tum operasyonu goruyor ama "done" karari onay surecinden geciyor.
- Mesaj ve bildirimler refresh gerektirmeden makul surede guncelleniyor.
- Testler lokal makinede tek komutla geciyor.
