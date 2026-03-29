# Privacy Policy — Kharcha

**Effective date:** 1 April 2026
**App:** Kharcha — UPI & SMS Expense Tracker
**Developer:** Antigravity Projects
**Contact:** pratiksondkar1994@gmail.com

---

## What Kharcha does

Kharcha is a personal expense tracker for Android. It reads SMS messages from your device's inbox to automatically detect and categorize bank transactions (UPI payments, debit card spends, ATM withdrawals). It uses AI to assign clean merchant names and categories to those transactions.

---

## What data we collect

### Data stored only on your device
- **Bank SMS content** — Kharcha reads your SMS inbox to detect bank transaction messages. This data is processed locally and stored in a private SQLite database on your device. It is never transmitted to any server.
- **Transaction records** — amount, merchant name, bank, account (last 4 digits), date, and category. Stored locally only.
- **App preferences** — theme mode, your display name (used to detect self-transfers), and onboarding status. Stored locally only.

### Data sent off-device
- **Merchant names only** — Raw merchant/payee strings (e.g., "SWIGGY ORDER", "RAMESH TRADERS") are sent to our AI categorization service to obtain a clean display name and spending category. **No amounts, account numbers, bank names, or personal details are ever sent.**
- **Crash reports** — If you experience a crash, anonymized diagnostic data (device model, OS version, stack trace) is sent to Sentry (sentry.io) to help us fix bugs. No financial data is included in crash reports.

---

## Third-party services

| Service | Purpose | Data sent |
|---|---|---|
| Claude AI (Anthropic) via proxy | Merchant name enrichment and category prediction | Merchant/payee names only |
| Sentry | Crash diagnostics | Anonymized crash traces, no financial data |

Anthropic's privacy policy: https://www.anthropic.com/privacy
Sentry's privacy policy: https://sentry.io/privacy/

---

## SMS permission

Kharcha requests the `READ_SMS` Android permission to read bank SMS messages. We do **not** request `RECEIVE_SMS` (real-time interception) and we do **not** read personal, OTP, or non-bank messages. Filtering is done locally on your device before any processing occurs.

---

## Data retention and deletion

All data is stored on your device. You can delete all data at any time from **Settings → Danger Zone → Clear All Data**. Uninstalling the app also removes all locally stored data.

---

## Children's privacy

Kharcha is not directed at children under 13. We do not knowingly collect data from children.

---

## Changes to this policy

We may update this policy when features change. The effective date at the top of this document will be updated. Continued use of the app after changes constitutes acceptance of the updated policy.

---

## Contact

For privacy questions or data deletion requests, contact: pratiksondkar1994@gmail.com
