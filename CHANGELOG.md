# Changelog

Tüm önemli değişiklikler bu dosyada tutulur. Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/).

## [Unreleased]

## [2.3.6] - 2026-10-02

### Fixed
- İkon boyutları: manifest 48/96/128 px ilan ediyordu ama `icons/icon.png` 512 px'di; gerçek 48/96/128 px ikonlar üretilip manifest'ler bunlara bağlandı (web-ext lint ikon uyarıları giderildi)
- Ayarlar > Search sonuç satırları `innerHTML` yerine `textContent` ile kuruluyor (güvenli olmayan atama uyarısı kaldırıldı, kullanılmayan `escapeHtml()` silindi)

### Changed
- `web-ext lint dist/firefox`: 0 hata / 0 uyarı / 0 bildirim

## [2.3.5] - 2026-09-26

### Fixed
- Bozuk (default ticker'lı) snapshot kilitlenmesi: 2.3.4 öncesi build'ler hafta sonu storage'a **AAPL** yazabildiği için, gate kapalıyken cache hydrate edilince rozet kalıcı olarak AAPL'de kilitli kalabiliyordu. `hydrateFromStorage()` artık snapshot'ın sembolünü takip edilen sembolle karşılaştırıyor; uyuşmazsa snapshot reddedilip **tek seferlik onarım fetch'i** yapılıyor (`background.js`)

## [2.3.4] - 2026-09-26

### Fixed
- Varsayılan ticker sızıntısı: MV3 worker her uyanışta `config`'i DEFAULT_CONFIG (AAPL) ile başlatıyordu; `loadConfig()` çözülmeden tetiklenen alarm/mesaj handler'ı **varsayılan** sembolü çekip storage'ı ve toolbar rozetini eziyordu (hafta sonu rozet AAPL'de kilitli kalıyordu). Tüm giriş noktaları artık `ensureLoaded()` bekliyor (`background.js`)
- Hafta sonu/piyasa kapalı gate'i deliniyordu: `checkTimeAndRefresh()` "cache yok" diye network'e çıkıyordu; artık storage'daki son snapshot memory'ye hydrate edilip rozet yeniden uygulanıyor (boşuna fetch yok, rozet doğru sembole dönüyor)

### Changed
- Firefox (AMO unlisted) ve Chrome hedefleri aynı sürümde: 2.3.4

## [2.3.3] - 2026-09-21

### Fixed
- Hafta sonu/piyasa kapalı durumda cross-check susuyordu: `getSessionOpen` seans dönemi mumlardan yeniyse (Cuma verisi + Pazartesi seansı) son işlem gününün açılışına düşüyor, XU100.IS weekend'de +%1,23 yerine -%1,67 gösteriyor

## [2.3.2] - 2026-09-19

### Fixed
- BIST 1D'de bayat intraday baz (XU100.IS 18.09.2026'da +%1,23 yerine gerçek -%1,67): prevClose artık seans açılışıyla çapraz kontrol ediliyor, >%1,5 sapmada açılış baz alınıyor (`getSessionOpen` + `resolvePreviousClose` cross-check, `background.js` + `utils/api.js`)

### Docs
- README: public/AMO yayınına hazırlık — kurulum adımları `dist/firefox` üzerinden güncellendi, sürüm rozeti ve zip referansları 2.3.1'e çekildi, geçersiz legacy-root notu kaldırıldı
- CHANGELOG dosyası eklendi

## [2.3.1] - 2026-09-01

### Changed
- Mimari: kök dosyalar yerine `src/common` (SSOT) + `src/{firefox,chrome}/manifest.json` ayrımı; `scripts/build.js` ile çift hedefli build
- Firefox ve Chrome artık ayrı manifest'lere sahip (gecko id / service worker)

### Fixed
- BIST (`.IS`) sembollerinde 1D aralıkta yanlış yüzde değişimi — `chartPreviousClose` bayat kaldığı için prevClose artık `regularMarketChangePercent`'ten türetiliyor

### Added
- `docs/ARCHITECTURE.md` mimari ve build rehberi
- `package.json` (build/lint/start script'leri)

## [2.2.1] - 2026-08-26

### Added
- Araç çubuğu rozeti 3 karakter destekli (örn. `2.5`), renk ve tooltip

### Fixed
- Backup import: ayarlar DEFAULTS ile birleşiyor; ticker/interval/activeHours için detaylı sonuç durumu gösteriliyor

### Changed
- Repo unlisted test fazı için private yapıldı, `.gitignore` sıkılaştırıldı

## [2.2.0] - 2026-08-26

### Added
- KDE Plasma stock-monitor-widget v2.2'nin ilk Firefox portu
- Yahoo Finance v8 chart, ticker arama, Single/Multi liste, 1D–Max aralıkları
- Otomatik yenileme (`browser.alarms`) + hafta sonu / pazar saatleri yönetimi
- Canvas gradient chart + prevClose çizgisi
- Portfolio (hisse + ortalama maliyet + CSV)
- Backup Export/Import (JSON)