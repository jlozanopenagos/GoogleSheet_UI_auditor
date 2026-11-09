# Google Apps Script Setup & Deployment Guide

This directory contains the enhanced `Code.gs` script for Google Apps Script Web App that powers `GoogleSheet_UI_auditor`.

---

## What's New in this Version

1. **Column I (`short_description`) Support**:
   - `doGet` automatically retrieves Column I as `short_description`.
   - If Column I has no header in your sheet, row 1 is automatically initialized with `"short_description"`.
2. **In-Place Targeted Row Updates**:
   - `action: "update_script"`: Locates the exact row matching the script `ID` (e.g. `EE01`) and updates Column D (`SCRIPT_CHANGED`), Column E (`script_ready`), and Column F (`script_date`) in place.
   - `action: "update_description"`: Locates the exact row matching the script `ID` and updates Column I (`short_description`) in place.
3. **Strict Date Formatting**:
   - Cell dates in Column F are normalized to `DD/MM/YY` (e.g. `31/01/26`).

---

## Deployment Steps (2 Minutes)

1. Open your master Google Sheet (the one where your scripts live).
2. Click **Extensions > Apps Script** in the top menu.
3. Delete any existing code in `Code.gs` and paste the entire contents of [`Code.gs`](./Code.gs).
4. Click the **Save** icon (💾 or `Ctrl + S`).
5. Click **Deploy > Manage deployments** (top right).
6. Click the **pencil icon (Edit)** next to your active deployment.
7. Under **Version**, click the dropdown and choose **New version**.
8. Ensure:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
9. Click **Deploy**.
10. If the Web App URL changed, update `SHEETS_MASTER_WEBAPP_URL` in `.env`. If you used "Manage deployments > New version", the URL stays exactly the same!
