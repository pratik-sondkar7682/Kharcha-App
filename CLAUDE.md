# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Kharcha?

A **privacy-first, AI-powered expense tracker** for Android. Reads bank SMS from the device inbox, parses transactions via bank-specific regex, categorizes them using keyword rules + Claude AI, and presents a dashboard with insights and charts.

**Key principle:** Zero financial data leaves the device. Only merchant names are sent to Gemini for enrichment.

## Build & Run

```bash
# Prerequisites
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=~/Library/Android/sdk

# Start Metro bundler (always use --clear after .env changes)
npx expo start --port 8081 --clear

# ADB tunnel for USB-connected device
adb reverse tcp:8081 tcp:8081
```

**WiFi fallback (no USB):** In Expo dev menu > Settings > set bundle URL to `<Mac-LAN-IP>:8081`

## Testing

```bash
# Run all tests
npx jest

# Run a single test file
npx jest src/lib/__tests__/smsParser.test.js

# Run tests matching a pattern
npx jest --testPathPattern="categorizer"
```

Tests live in `src/lib/__tests__/` covering: `smsParser`, `categorizer`, `dateParser`, `preFilter`. Babel is configured in `babel.config.js` with a separate test environment targeting Node.js current.

## Environment

```bash
# .env (project root) — Metro injects EXPO_PUBLIC_ vars at bundle time
EXPO_PUBLIC_GEMINI_API_KEY=AIza...
EXPO_PUBLIC_PROXY_SECRET=<same value set as wrangler secret>   # optional: only if routing via CF Worker
EXPO_PUBLIC_AI_PROXY_URL=https://<your-worker>.workers.dev     # optional: only if routing via CF Worker
```

Restart Metro with `--clear` after changing `.env`.

## AI Enrichment (Gemini)

Merchant enrichment uses **Google Gemini 3.1 Flash Lite Preview** (`gemini-3.1-flash-lite-preview`) via the Generative Language API.

- **Batch size:** up to 200 merchants per call
- **Rate limit retry:** handled automatically via `retry-after` header on 429
- Merchants are normalized (via `merchantNormalizer.js`) before sending — deduplicates variants like `SWIGGY*ORDER123` and `SWIGGY*ORDER456` into one AI call
- Uses `responseMimeType: 'application/json'` for structured output

## Cloudflare Worker (Gemini Proxy)

`worker/` proxies calls to `generativelanguage.googleapis.com`, keeping the API key server-side. Requires these secrets set via `wrangler secret put`:
- `GEMINI_API_KEY`
- `PROXY_SECRET` (matched by `EXPO_PUBLIC_PROXY_SECRET` in `.env`)

Deploy: `wrangler deploy` from the `worker/` directory.

## Architecture

### SMS Pipeline (orchestrated by `syncSMS()` in `src/lib/smsReader.js`)

**Phase 1 — sync (blocking, returns to UI quickly):**
```
readSMSFromPhone(options)    — options.minDate narrows to SMS newer than last sync
  > preFilterSMS()           — reject OTPs, promos, balance alerts, non-bank senders
  > parseBulkSMS()           — bank-specific regex (ICICI, Axis, HDFC, IDFC, SBI, Kotak)
  > categorizeAll()          — rawSMS checks first (UPI/IMPS/CC), then keyword match
  > sanitizeForStorage()     — mask full account numbers in rawSMS before storage
  > deduplicateTransactions()
  > insertTransactions()     — into SQLite via expo-sqlite
  > saveSetting('last_synced_at', syncStartedAt) — persisted for incremental sync
```
Returns `{ newCount, duplicateCount, unparsedCount, ambiguousCount, pendingMerchants }`.

**Phase 2 — `enrichInBackground()` (fire-and-forget after UI renders):**
```
getMerchantCache()           — skip merchants already enriched
enrichMerchantsBatch()       — Gemini 3.1 Flash Lite Preview call for uncached merchants
setMerchantCache()           — store results in SQLite
applyMerchantCacheToTransactions() — backfill cleanName + category into DB
```

### Key Architectural Decisions

- **Credit card transactions are NEVER spend:** All CC transactions (spends, bill payments, acknowledgments) are classified as `internal_transfer` and appear only in the Unaccounted tab. Only UPI and ATM/debit card transactions count as real spend. CC detection happens at two layers: (1) parser sets `category: 'internal_transfer'` for known CC SMS formats, (2) categorizer detects CC patterns in rawSMS as a safety net. CC detection runs BEFORE UPI detection in categorizer because CC SMS can contain "UPI:ref" numbers.
- **categorize() ordering matters:** CC checks first, then rawSMS-based UPI/IMPS checks, then keyword match. ICICI UPI transactions have `merchant: ""` (empty) — the payee is extracted separately. If the merchant guard comes first, all UPI transactions get mis-categorized as 'uncategorized'.
- **Database dual-platform:** `src/lib/database.js` supports native (SQLite via expo-sqlite) and web (localStorage fallback).
- **AI enrichment is cached:** `getMerchantCache()` / `setMerchantCache()` in `database.js` prevents re-calling Gemini for previously enriched merchants.
- **Merchant normalization:** `merchantNormalizer.js` strips UPI prefixes and applies brand aliases before AI enrichment.
- **Account masking:** `accountMasker.js` (`sanitizeForStorage()`) strips full account numbers from rawSMS before storage. Only masked form (XX1234) is persisted.
- **Deduplication:** `deduplicator.js` uses UPI ref as primary key; falls back to `amount|date|merchant|type` hash. Ambiguous matches are flagged with a review note rather than silently dropped.
- **Incremental sync:** `syncSMS()` saves `last_synced_at` (unix ms, captured at sync start) to the settings table after every successful run — including the "no new messages" early-return path. On the next app open, `handleSync()` in `DashboardScreen` reads this value and passes `{ minDate: lastSyncedAt - 30_000 }` to `syncSMS()`, so only SMS newer than the last sync are read. First open (no `last_synced_at`) and manual pull-to-refresh always do a full scan. The 30 s skew buffer handles late-arriving SMS; deduplication handles any resulting overlaps.
- **handleSync() UX modes:** Full-screen loader only fires on first open (`!last_synced_at && transactions.length === 0`). Pull-to-refresh shows the top banner. All other auto-syncs are silent — a brief 3-second toast appears only if `newCount > 0`.

### Navigation

Three bottom tabs via React Navigation: Dashboard (home), Insights (charts/breakdowns), Settings (rescan/clear/export).

### Dashboard Layout

- **Hero card** — single full-width Total Spent card with Avg/Day, transaction count, and Net Flow stats bar. MoM comparison pill shown when prior period data exists.
- **Date filters** — fixed flex row (no scroll), 4 options: This Month, Last Month, This Year, Custom Range.
- **Feed tabs** — Transactions | Unaccounted. Unaccounted = `internal_transfer` + `isExcluded` transactions.
- **Toolbar** — merchant search + filter/sort modal (category, sort field, order).

### Settings Layout

- **Appearance** — Dark Mode toggle (Switch) with SQLite-persisted preference via `ThemeContext`.
- **Profile Identity** — full name input for self-transfer detection.
- **Data** — Export Data only.
- **Danger Zone** — Re-scan SMS, Reset Transaction Settings (clears user category overrides + isExcluded flags), Clear All Data.
- No manual entry or test data injection.

## Categories

`food`, `groceries`, `shopping`, `transport`, `bills`, `health`, `entertainment`, `transfers`, `rent`, `education`, `investment`, `hardware`, `atm`, `internal_transfer`, `uncategorized`

- `internal_transfer` = credit card payment acknowledgments (shown in Unaccounted tab)
- `transfers` = UPI P2P payments to people (shown in Transactions tab)
- `atm` = ATM/cash withdrawals — detected via rawSMS patterns before UPI check in `categorize()`

## Persistence & Data Layer

- **`getDB()` hot-reload fix:** Re-initializes SQLite if `global.__kharchaDB` is null even when `dbReady = true`. Always use `await getDB()` instead of checking `global.__kharchaDB` directly.
- **User edits persist:** `updateTransaction()` and `saveUserOverride()` both go through `getDB()` — writes survive app close.
- **`INSERT OR IGNORE`** prevents re-categorizing existing transactions on re-sync; old data won't get new categories without Clear + Re-scan.
- **`resetTransactionSettings()`** — clears `user_overrides` table and resets all transactions to `category='uncategorized'`, `isExcluded=0`.

## Analytics Notes

- **`current_month` end date** is capped to today (not end of month) so `averageDailySpend` divides by actual elapsed days and `dailyTrend` shows no empty future bars.
- **`analyticTxns`** (strips `internal_transfer`) is what feeds all dashboard stats. Feed counts use `filteredTxns` (post-search/filter).

## Theme System

- **`ThemeContext`** (`src/context/ThemeContext.js`) — provides `{ isDark, toggleTheme, colors }`. Persists preference to SQLite via `saveSetting('theme_mode', ...)`. Defaults to dark mode.
- **`getColors(isDark)`** in `src/theme/index.js` — returns `darkColors` or `lightColors`. Both palettes are fully defined.
- **All screens use `useTheme()`** — `DashboardScreen`, `InsightsScreen`, `SettingsScreen`, `TransactionCard`, `AppNavigator` all call `const { colors } = useTheme()` and pass colors into a `makeStyles(colors)` factory. Never import the static `colors` export for UI components.
- **Button/chip text on colored backgrounds** — always use `'#FFFFFF'` (not `colors.surface.base`) for text on `primary.main` backgrounds. In light mode `surface.base` is `#F2F3F7` (near-white) which is invisible on white cards.

## Critical Bugs & Fixes (Reference)

1. **ICICI parser `(\d{4})` too strict** — Account shows as `XX681` (3 digits). Fix: `(\d{3,6})`
2. **All merchants "Unknown"** — `categorize()` had early return before rawSMS checks. Fix: reorder checks (rawSMS first)
3. **AI backend** — Merchant enrichment uses Gemini 3.1 Flash Lite Preview. `EXPO_PUBLIC_GEMINI_API_KEY` is required. The CF Worker in `worker/` proxies calls to keep the key server-side.
4. **AI 429** — Auto-retried via `retry-after` header. Up to 200 merchants/call.
5. **Clear Data fails after hot-reload** — SQLite NullPointerException. Workaround: `adb shell "run-as com.antigravity.kharcha rm -f files/SQLite/kharcha.db files/SQLite/kharcha.db-shm files/SQLite/kharcha.db-wal"` then cold-restart
7. **User edits lost on app close** — `updateTransaction()` was falling into in-memory path when `__kharchaDB` was null post hot-reload. Fix: always use `await getDB()`.
8. **Light mode text invisible** — `colors.surface.base` is `#F2F3F7` in light mode. Never use it as text color on white/light card backgrounds. Use `colors.text.headline` for content text, `'#FFFFFF'` for text on colored buttons.

## Local Pipeline Testing (without device)

```bash
# Pull SMS dump from connected device
adb shell "content query --uri content://sms/inbox --projection address,body,date" > /tmp/raw_sms_dump.txt
```

## EAS Build Profiles

Defined in `eas.json`:
- **development** — APK, internal distribution, includes dev client
- **preview** — APK, internal distribution
- **production** — AAB (app bundle), submitted to Play Store internal track via `google-service-account.json`

Build: `eas build --platform android --profile development`

## App Package

`com.antigravity.kharcha`
