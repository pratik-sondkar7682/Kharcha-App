# Privacy Policy — Kharcha

**Effective date:** 1 April 2026
**App:** Kharcha — SMS Expense Tracker
**Developer:** Antigravity Projects
**Contact:** pratiksondkar1994@gmail.com

---

## What Kharcha does

Kharcha is a privacy-first expense tracker for Android. It reads bank SMS messages from your device's inbox, parses them using bank-specific rules, categorizes transactions automatically, and presents a dashboard with spending summaries and insights. No financial data ever leaves your device.

---

## How Kharcha processes your data

### Step 1 — SMS reading

When you open the app or trigger a manual re-scan, Kharcha requests access to your SMS inbox using the `READ_SMS` Android permission. It reads only messages from recognized bank sender IDs (e.g., ICICIB, HDFCBK, AXISBK, SBIINB, IDFCFB, KOTAKB). All other messages — personal, OTP, promotional — are filtered out immediately on your device before any further processing.

### Step 2 — Transaction parsing

Bank SMS messages are parsed locally using bank-specific regular expressions. Each message is matched against known patterns to extract:
- Transaction amount
- Transaction type (debit, credit, UPI, ATM, etc.)
- Merchant or payee name
- Bank name and last 4 digits of account number
- Date and time
- UPI reference number (if applicable)

Full account numbers are masked (e.g., `XX1234`) before being stored. Raw SMS content is only held in memory during parsing; only the masked form is persisted.

### Step 3 — Categorization

Transactions are categorized locally in two passes:

1. **Rule-based categorization** — Credit card transactions, UPI P2P transfers, ATM withdrawals, and known merchant keywords are categorized without any network call. Credit card spends and bill payments are classified as `internal_transfer` and shown in the Unaccounted tab rather than counted as real spend.

2. **AI enrichment (background, merchant names only)** — For uncategorized merchants, only the raw merchant/payee string (e.g., `"SWIGGY*ORDER123"`, `"RAMESH TRADERS UPI"`) is sent to Google Gemini for a clean display name and spending category. **No amounts, account numbers, bank names, dates, or any other transaction details are ever sent.** Merchant strings are normalized and deduplicated before sending — multiple variations of the same merchant (e.g., `SWIGGY*ORDER1` and `SWIGGY*ORDER2`) are collapsed into a single lookup.

### Step 4 — Local storage

All transaction data is stored in a private SQLite database on your device, inside the app's sandboxed storage area. This database is not accessible to other apps.

Enrichment results (clean merchant name + category) are cached locally so the same merchant is never sent to AI more than once.

---

## What data is stored on your device

| Data | Where stored | Notes |
|---|---|---|
| Transaction records (amount, merchant, type, category, bank, masked account, date, UPI ref) | SQLite on device | Never transmitted |
| Masked raw SMS (account numbers replaced with XX####) | SQLite on device | Never transmitted |
| Merchant enrichment cache (merchant name → clean name + category) | SQLite on device | Never transmitted |
| App settings (theme, display name, last sync time) | SQLite on device | Never transmitted |
| Your display name (for self-transfer detection) | SQLite on device | Never transmitted |

---

## What data leaves your device

| Data | Recipient | Purpose | What is NOT sent |
|---|---|---|---|
| Merchant/payee name strings only (e.g., "SWIGGY", "RAMESH TRADERS") | Google Gemini API via Cloudflare Worker proxy | Obtain clean display name and spending category | Amounts, account numbers, bank names, dates, UPI refs, personal details |
| Anonymized crash diagnostics (device model, OS version, stack trace) | Sentry (sentry.io) | Bug detection and crash reporting | Financial data, transaction details, SMS content |

### Cloudflare Worker proxy

AI enrichment requests are routed through a Cloudflare Worker proxy operated by Antigravity Projects. This proxy forwards only the merchant name strings to Google Gemini and returns the results. It does not log, store, or analyze the data passing through it. The proxy exists to keep the AI API key server-side and off the device.

---

## SMS permission

Kharcha requests the `READ_SMS` Android permission. It does **not** request `RECEIVE_SMS` (live interception). SMS reading happens only when you open the app or manually trigger a re-scan — never in the background without your action.

Only messages from known bank sender IDs are read. Filtering runs entirely on your device before any parsing or storage occurs.

---

## Self-transfer detection

If you enter your full name in Settings → Profile, Kharcha uses it to detect UPI transfers to yourself (e.g., between your own bank accounts) and classifies them as `internal_transfer` so they don't inflate your spending stats. Your name is stored only on your device and is never transmitted.

---

## Data retention and deletion

All data is stored on your device and under your control:

- **Clear All Data** (Settings → Danger Zone → Clear All Data) — permanently deletes all transactions from the local database.
- **Reset Transaction Settings** (Settings → Danger Zone → Reset Transaction Settings) — clears all manual category overrides and exclude flags.
- **Clear Merchant Cache** (Settings → Danger Zone → Clear Merchant Cache) — removes all cached AI enrichment results, forcing re-enrichment on the next scan.
- **Uninstalling the app** removes all locally stored data.

There is no account, no cloud backup, and no server-side copy of your data. Deletion is immediate and permanent.

---

## Third-party services

| Service | Purpose | Privacy policy |
|---|---|---|
| Google Gemini (via Generative Language API) | Merchant name enrichment and category prediction | https://policies.google.com/privacy |
| Sentry | Crash diagnostics | https://sentry.io/privacy/ |
| Cloudflare Workers | AI API proxy (operated by Antigravity Projects) | https://www.cloudflare.com/privacypolicy/ |

---

## Children's privacy

Kharcha is not directed at children under 13. We do not knowingly collect data from children.

---

## Changes to this policy

We may update this policy when features change. The effective date at the top of this document will be updated. Continued use of the app after changes constitutes acceptance of the updated policy.

---

## Contact

For privacy questions or data deletion requests, contact: pratiksondkar1994@gmail.com
