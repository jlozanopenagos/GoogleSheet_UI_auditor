# Google Apps Script Setup & Deployment Guide (Standalone Auditor Web App)

This directory contains the standalone `Code.gs` Google Apps Script Web App **exclusively for `GoogleSheet_UI_auditor`**.

> [!IMPORTANT]
> Deploy this script in **its own standalone Google Apps Script project** (completely separate from `short-automation`). That way, `short-automation` and `GoogleSheet_UI_auditor` never share deployment code, fallback handlers, or conflicting actions.

---

## Capabilities in this Version

1. **Columns A through J Support**:
   - `doGet` reads Columns A–J (`ID`, `expression`, `script`, `SCRIPT_CHANGED`, `script_ready`, `script_date`, `video_ready`, `video_date`, `short_description`, `short_title`).
   - `ensureAuditorHeaders` automatically initializes Row 1 headers for Column I (`"short_description"`) and Column J (`"short_title"`) if blank.
2. **Explicit In-Place Actions (`doPost`)**:
   - `action: "update_script"`: Updates Column D (`SCRIPT_CHANGED`), Column E (`script_ready`), and Column F (`script_date`) in place.
   - `action: "update_description"`: Updates Column I (`short_description`) in place.
   - `action: "update_title"`: Updates Column J (`short_title`) in place (requires non-empty text).
   - `action: "update_launch"`: Updates Column G (`video_ready`), Column H (`video_date`), and optionally Column E/F for Launch Calendar tracking.
   - `action: "batch_update"`: Bulk updates rows by ID.
   - Unknown or missing `action` values return an explicit `Unsupported action` error (zero legacy fallback behavior).
3. **Strict Date Formatting**:
   - Cell dates in Columns F and H are written with `.setNumberFormat("@")` and normalized to `DD/MM/YY` (e.g. `31/01/26`).

---

## Standalone Deployment Steps (2 Minutes)

1. Go to [script.google.com](https://script.google.com/) (signed in with the Google account that has edit access to all 16 spreadsheets).
2. Click **New project** and name it `GoogleSheet_UI_auditor_WebApp` (do **not** reuse your `short-automation` project).
3. Delete the placeholder `myFunction()` code in `Code.gs` and paste the entire contents of [`Code.gs`](./Code.gs).
4. Click **Save** (`Ctrl + S`).
5. Click **Deploy > New deployment** (or **Deploy > Manage deployments > Edit > New version** when updating an existing standalone auditor deployment).
6. Select type **Web app** and set:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
7. Click **Deploy**, authorize permissions if prompted, and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).
8. Set `SHEETS_MASTER_WEBAPP_URL` in `.env` to that dedicated Web App URL.
