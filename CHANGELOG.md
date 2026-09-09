# Changelog

Tüm önemli değişiklikler bu dosyada tutulur. Format: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/).

## [Unreleased]

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