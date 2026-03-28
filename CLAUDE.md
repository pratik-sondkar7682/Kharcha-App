# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Kharcha?

A **privacy-first, AI-powered expense tracker** for Android. Reads bank SMS from the device inbox, parses transactions via bank-specific regex, categorizes them using keyword rules + Claude AI, and presents a dashboard with insights and charts.

**Key principle:** Zero financial data leaves the device. Only merchant names are sent to Claude for enrichment.

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
EXPO_PUBLIC_CLAUDE_API_KEY=sk-ant-api03-...
```

Restart Metro with `--clear` after changing `.env`.

## Claude API Constraints

- **Model:** `claude-sonnet-4-6` only (3.x models return 404 on this account)
- **Rate limits:** 5 req/min, 4,000 output tokens/min
- **Batch size:** max 20-25 merchants per call, `max_tokens: 600`
- **Multi-batch:** add ~15s delay between chunks to stay within TPM

## Architecture

### SMS Pipeline (orchestrated by `syncSMS()` in `src/lib/smsReader.js`)

```
readSMSFromPhone()
  > preFilterSMS()           — reject OTPs, promos, balance alerts, non-bank senders
  > parseBulkSMS()           — bank-specific regex (ICICI, Axis, HDFC, IDFC, SBI, Kotak)
  > categorizeAll()          — rawSMS checks first (UPI/IMPS/CC), then keyword match
  > enrichMerchantsBatch()   — single Claude API call per batch of unique merchants
  > deduplicateTransactions()
  > insertTransactions()     — into SQLite via expo-sqlite
```

### Key Architectural Decisions

- **Credit card transactions are NEVER spend:** All CC transactions (spends, bill payments, acknowledgments) are classified as `internal_transfer` and appear only in the Unaccounted tab. Only UPI and ATM/debit card transactions count as real spend. CC detection happens at two layers: (1) parser sets `category: 'internal_transfer'` for known CC SMS formats, (2) categorizer detects CC patterns in rawSMS as a safety net. CC detection runs BEFORE UPI detection in categorizer because CC SMS can contain "UPI:ref" numbers.
- **categorize() ordering matters:** CC checks first, then rawSMS-based UPI/IMPS checks, then keyword match. ICICI UPI transactions have `merchant: ""` (empty) — the payee is extracted separately. If the merchant guard comes first, all UPI transactions get mis-categorized as 'uncategorized'.
- **Database dual-platform:** `src/lib/database.js` supports native (SQLite via expo-sqlite) and web (localStorage fallback).
- **AI enrichment is cached:** `getMerchantCache()` / `setMerchantCache()` in database.js prevents re-calling Claude for previously enriched merchants.
- **Merchant normalization:** `merchantNormalizer.js` strips UPI prefixes and applies brand aliases before AI enrichment.

### Navigation

Three bottom tabs via React Navigation: Dashboard (home), Insights (charts/breakdowns), Settings (rescan/clear/export).

### Dashboard Layout

- **Hero card** — single full-width Total Spent card with Avg/Day, transaction count, and Net Flow stats bar. MoM comparison pill shown when prior period data exists.
- **Date filters** — fixed flex row (no scroll), 4 options: This Month, Last Month, This Year, Custom Range.
- **Feed tabs** — Transactions | Unaccounted. Unaccounted = `internal_transfer` + `isExcluded` transactions.
- **Toolbar** — merchant search + filter/sort modal (category, sort field, order).

### Settings Layout

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

## Critical Bugs & Fixes (Reference)

1. **ICICI parser `(\d{4})` too strict** — Account shows as `XX681` (3 digits). Fix: `(\d{3,6})`
2. **All merchants "Unknown"** — `categorize()` had early return before rawSMS checks. Fix: reorder checks (rawSMS first)
3. **Claude 404** — Only `claude-sonnet-4-6` works. All 3.x model IDs return 404
4. **AI 429 RPM** — Fixed by batching all merchants in one call (`enrichMerchantsBatch()`)
5. **AI 429 TPM** — Cap at 20-25 merchants/chunk, `max_tokens: 600`, 15s delay between chunks
6. **Clear Data fails after hot-reload** — SQLite NullPointerException. Workaround: `adb shell "run-as com.anonymous.Kharcha rm -f files/SQLite/kharcha.db files/SQLite/kharcha.db-shm files/SQLite/kharcha.db-wal"` then cold-restart
7. **User edits lost on app close** — `updateTransaction()` was falling into in-memory path when `__kharchaDB` was null post hot-reload. Fix: always use `await getDB()`.

## Local Pipeline Testing (without device)

```bash
# Pull SMS dump from connected device
adb shell "content query --uri content://sms/inbox --projection address,body,date" > /tmp/raw_sms_dump.txt
```

## App Package

`com.anonymous.Kharcha`
