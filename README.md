# InflataPay

Payroll & work tracking for InflataPalooza. Frontend on GitHub Pages; backend is a
Google Apps Script Web App living inside the "RENTAL INSPECTION LOG (2026)" Google Sheet
(the sheet stays the single source of truth — the Google Form keeps working untouched).

## One-time setup (Ryan)

1. **Backend (~5 min):** Open the Google Sheet → Extensions → Apps Script.
   Delete anything in the editor, paste the full contents of `apps-script/Code.gs`, hit Save.
2. Click **Deploy → New deployment → ⚙️ Web app**.
   - Description: `InflataPay`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy, **Authorize** with your Google account (it will ask for Sheets + Gmail —
     Gmail is what lets it email paystubs from your address).
3. Copy the **Web app URL** (ends in `/exec`).
4. Open the app → paste that URL on the Connect screen → log in with your PIN.
   First load auto-creates 4 new tabs in the sheet (IP_RATES, IP_EMPLOYEES, IP_PAYMENTS,
   IP_FIXUPS) pre-seeded with rates, team, Tay's $196 payment, and the three entry fixes.

## Updating the backend later
Paste the new Code.gs over the old one → Deploy → **Manage deployments** → ✏️ edit →
Version: New → Deploy. (Same URL keeps working.)

## Notes
- PINs live in the IP_EMPLOYEES tab (change anytime, or from the Team screen).
- The app never moves money. You pay by ACH from your bank as usual, then record it.
- Employees see only their own pay + a counts-only leaderboard.
