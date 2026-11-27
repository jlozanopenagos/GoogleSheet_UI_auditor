# GoogleSheet_UI_auditor (v1.0)

A standalone, high-performance web studio engineered for rapid script auditing, YouTube Shorts title & SEO description creation, 4-state ID readiness tracking, and release scheduling across 16 Google Sheets (4 languages × 4 video formats).

---

The auditor handles editorial script review, Short titles (Column J), Gemini SEO descriptions (Column I), readiness tracking, and release planning. Shorts Studio in the separate `shorts_automation` repository handles voice, image, thumbnail, and video production. Both tools connect to the same 16 Google Sheets, while `GoogleSheet_UI_auditor` runs through its own **standalone Google Apps Script Web App** completely isolated from `shorts_automation`.

## Key Features

1. **Deterministic Single-ID Routing**:
   - Enter an ID (e.g. `EE01`, `FG04`, `SR12`, `EF01`) and the system routes directly to the corresponding Google Sheet without requiring full-text search.
   - Decodes `<Language><Type><Index>` instantly:
     - Language: `E` (English), `F` (French), `S` (Spanish), `I` (Italian).
     - Format: `E` (Expression), `G` (Game), `R` (Roleplay), `F` (Fun Facts).

2. **Tab 1: Script Auditor & Editor**:
   - Header shows: `Editing X (ID): Y(expression_name)`.
   - **Left Column**: Read-only display of Column C (`script`) with a quick 1-click Copy button.
   - **Right Column**: Editable textbox for Column D (`SCRIPT_CHANGED`), defaulting to `"you can edit here the new version of the script {expression}"` if empty.
   - **Gemini Script Doctor**:
     - Star/Gemini icon button positioned in the top-right corner of the Column D text editor with hover tooltip `"change the script with Gemini"`.
     - Automatically reads Column C (`script`), diagnoses the narrative, and doctors it completely into an authentic, creative, out-of-the-box script adhering strictly to format rules and word budgets.
     - Rewritten script instantly populates Column D, enabling the Save button.
   - **Under-the-Box Controls**:
     - **Save Button**: Updates Column D, Column E, and Column F in place on Google Sheets. Disabled during transmission and remains deactivated until subsequent text modifications are made.
     - **Column E Checkbox (`script_ready`)**: Toggleable only when script content is edited.
     - **Column F Date Input (`script_date`)**: Formatted strictly as `DD/MM/YY` (e.g. `31/01/26`).

3. **Tab 2: Title & Description (Columns J & I)**:
   - Shared ID search bar and active script context.
   - **Short Title Card (Column J)** *(always visible for the selected ID)*:
     - Shows whether a title is already saved in Column J (`Title saved` vs `No saved title`).
     - Supports manual input/editing, non-empty validation, 1-click **Copy title**, and a live `100`-character YouTube title length counter (plus thumbnail readability guidance for ≤ 45 chars).
     - **Generate title with Gemini**: Uses Column D (`SCRIPT_CHANGED`, strictly required) and format-specific thumbnail rules (2–7 words, zero emojis/prefixes/spoilers, triad differentiation across `E`/`G`/`R`, and rotating creative angles with `previous_titles` memory so every retry produces a fresh title). Fills the input box for review/editing before clicking **Save title**.
   - **When Column I has content**:
     - Left box: Current Column I (`short_description`), read-only with copy button.
     - Right box: Editable Column I + Save button.
   - **When Column I is empty**:
     - Shows two centered actions:
       1. **Write description manually**: Manual entry card with immediate save action.
       2. **Generate with Gemini**: Consumes Google Gemini AI to synthesize a viral, format-specific YouTube Shorts description.
   - **Gemini SEO Invariants & 3-Beat Architecture**:
     - Specialized system prompts per format (`EXPRESSION`, `GAME`, `ROLEPLAY`, `FUN_FACTS`).
     - **Rich 3-Beat Pacing (60–90 words, 350–500 characters)**:
       * *Paragraph 1*: High-curiosity hook within the first 120–150 characters (above the fold).
       * *Paragraph 2*: Narrative scenario/dilemma + mandatory retention driver (*"Watch until the end..."*).
       * *Paragraph 3*: Active social engagement question (*"Drop your guess below! 👇"* or *"Tag them in the comments! 👇"*).
     - **100% Target Language Purity**: Body prose written purely in the target language (no mixed languages).
     - **3 to 5 Targeted Hashtags**: Blends target language keywords with high-volume discovery tags (`#Shorts`, `#LearnEnglish`, etc.).
     - **Zero Spoilers**: Never reveals the quiz solution, punchline, or idiom translation.
     - **Tasteful Emojis (1 to 3 MAX)**: Expressive emojis (e.g. `😬`, `👇`, `🤯`, `💬`) adding visual personality.
     - **Dynamic Variation**: High-temperature sampling (0.75) and varied opening/middle/closing angles ensure repeated runs for the same script produce fresh, non-repetitive descriptions.
     - **Prerequisite Gate**: Requires Column D (`SCRIPT_CHANGED`) to be non-empty before calling Gemini.

4. **Tab 3: ID Checklist (4-State Bingo Matrix)**:
   - Displays all canonical IDs per `(language, video_type)` color-coded across 4 lifecycle states:
     - **Violet**: Already scheduled / launched on the YouTube Launch Calendar (`video_ready` + `video_date`, with Col D + Col I complete).
     - **Green**: Ready to launch (Column D script revision + Column I SEO description both filled).
     - **Yellow**: Script revision ready (Column D filled), needs SEO description (Column I empty).
     - **Grey**: Script revision (Column D) empty.
   - Displays informational **Column J (`short_title`)** status (`Col J (Title): ✓ Filled / ✗ Empty`), title preview, and title search in the quick-inspection banner and tile tooltips without altering the 4-state lifecycle colors.
   - Clicking a Green card exposes a 1-click **"Schedule in Calendar"** button; clicking a Violet card shows its launch date and **"View / Move in Calendar"**.

5. **Tab 4: Launch Calendar (Dynamic YouTube Release Tracker)**:
   - Interactive Month/Week calendar tracking YouTube Shorts per language (`All`, `English`, `French`, `Spanish`, `Italian`).
   - **Readiness Gate**: Verifies Column D (`SCRIPT_CHANGED`), Column E (`script_ready = TRUE`), and Column I (`short_description`) before scheduling, with jump links to Tab 1 / Tab 2 or a 1-click **"Check Column E & Add to Calendar"** shortcut when D + I are ready.
   - **Per-Language Daily Cadence Rules (Soft Warning + Override)**: Supports **Fun Fact Day** (`1 Fun Fact`) or **Triad Day** (up to `3` shorts: `1 Expression + 1 Game + 1 Roleplay`) per language per day with an optional `"Force schedule anyway"` override.
   - Syncs launch status to Column G (`video_ready`) and Column H (`video_date` plain-text `DD/MM/YY` via `.setNumberFormat("@")`) in Google Sheets alongside `backend/data/launch_calendar.json`, turning scheduled IDs **Violet** inside the Bingo matrix (or reverting them to **Green** when unscheduled).
   - Includes a **"Sync from Sheets"** button (`POST /api/calendar/sync`) to pull scheduled IDs across all 16 Google Sheet tabs onto any PC.

6. **Tab 5: YouTube Upload (Multi-Channel OAuth + Google Drive)**:
   - Connects **Google Drive** (read-only) and each of the **4 language Brand Account YouTube channels** (`English`, `French`, `Spanish`, `Italian`) independently using a single `backend/credentials/client_secret.json` (see [`backend/credentials/README.md`](./backend/credentials/README.md)).
   - Automatically locates finished assets in Google Drive under `_videos terminados/<language>/<video_type>/<ID>/` (`<ID>.mp4` + thumbnail PNGs) and reads Title (Column J) & Description (Column I) directly from Google Sheets.
   - For Spanish Shorts with both **LatAm** and **Spain** thumbnail variants, renders side-by-side previews and requires an explicit selection before upload.
   - Supports **Schedule for Public** (`privacyStatus="private"` + UTC ISO 8601 `publishAt` converted from **America/Bogota, UTC-05:00**, with user-entered launch hour), **Publish Now (Public)**, or **Private Draft**.
   - Waits for YouTube processing (`processingDetails.processingStatus == "succeeded"`) before calling `thumbnails.set` (with a 1-click **Retry Thumbnail** fallback), and logs uploads locally in `backend/data/youtube_uploads.json` independently of Tab 4.

---

## Quick Start (Any Windows 11 PC or Tablet)

### Option A: One-Click Launcher (`start.bat` — Recommended)
Simply double-click **`start.bat`** in the project folder:
1. Automatically detects if Python is installed. If not, installs Python 3.11 automatically using Windows 11's built-in `winget`.
2. Creates an isolated `.venv` environment and installs the lightweight requirements (`requirements.txt`).
3. Auto-initializes `.env` from `.env.example` if not already present.
4. Starts the studio at `http://127.0.0.1:8005` and launches your default web browser in desktop view.

> **Zero Node.js Required**: The pre-compiled production frontend bundle is included directly in `frontend/dist/`. Any device can run the full studio without installing Node.js, npm, or build tools!

---

### Option B: Manual Command Line
```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Launch Studio
python run.py
```
- Starts the FastAPI backend on `http://127.0.0.1:8005`.
- Automatically opens the application in your default web browser.

Optional flags:
```powershell
python run.py --port 8080 --no-browser
```

> **Troubleshooting Port `8005` (`WinError 10048`)**: If `py run.py` fails to bind because `127.0.0.1:8005` is already in use, an older instance of the studio is still running in the background. Either launch on another port (`py run.py --port 8006`) or stop the existing `python.exe` process holding port `8005` before restarting.

---

## Directory Architecture

```text
GoogleSheet_UI_auditor/
├── backend/
│   ├── app/
│   │   ├── core/               # Configuration (.env), canonical ID routing & sheet resolution
│   │   ├── models/             # Typed Pydantic schemas (ScriptRecord, MatrixItem, Calendar & YouTube schemas)
│   │   ├── routers/            # /api/sheets, /api/gemini, /api/calendar, /api/youtube
│   │   └── services/           # SheetService, CalendarService, GeminiService, PromptService, YouTube/Drive services
│   ├── credentials/            # OAuth 2.0 client_secret.json (git-ignored) & setup README.md
│   ├── main.py                 # FastAPI application factory & static SPA host
│   └── requirements.txt        # Production Python dependencies
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS + Vitest
│   ├── src/
│   │   ├── components/         # Header, NavigationTabs (5 tabs), IdSearchBar, NotificationToast
│   │   ├── views/              # ScriptAuditorView, DescriptionCreationView, IdChecklistView, LaunchCalendarView, YouTubeUploadView
│   │   ├── services/           # Typed API fetch client
│   │   ├── types/              # TypeScript interfaces
│   │   └── __tests__/          # Vitest + React Testing Library unit/component suites
│   ├── dist/                   # Pre-compiled static assets served directly by FastAPI
│   ├── package.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── apps_script/                # Standalone auditor-only Google Apps Script Web App
│   ├── Code.gs                 # Reads A-J; explicit doPost actions (update_script, update_description, update_title, update_launch, batch_update)
│   └── README.md               # 2-minute standalone deployment guide
├── tests/                      # Layered quality suite (isolated offline by conftest.py)
│   ├── unit/                   # Routing, prompts, Gemini, Script Doctor, Calendar, SheetService, YouTube/Drive
│   ├── api/                    # FastAPI TestClient router contract tests (sheets, gemini, calendar, youtube)
│   ├── integration/            # End-to-end Calendar <-> Bingo 4-state workflows
│   ├── contract/               # Structural verification against apps_script/Code.gs
│   ├── conftest.py             # Temp CalendarService isolation & network guardrails
│   ├── helpers.py              # Shared test data builders
│   └── run_tests.py            # Unified runner (--layer, --check-static, --coverage, --live-smoke)
├── .env.example                # Environment variable configuration template
├── AGENTS.md                   # System guidelines, architecture, & mandatory test-layer policy
├── pyproject.toml              # Pytest markers, local basetemp & ruff configuration
├── requirements-dev.txt        # Test & static-check dependencies (pytest, pytest-cov, ruff)
├── run.py                      # Root one-click launcher
└── README.md                   # Operational manual (this document)
```

---

## Google Apps Script Deployment

`GoogleSheet_UI_auditor` uses its own standalone Apps Script project (separate from `shorts_automation`) to read Columns A–J, auto-initialize Column I (`short_description`) and Column J (`short_title`) headers, format dates as plain-text `DD/MM/YY`, and handle explicit in-place updates (`update_script`, `update_description`, `update_title`, `update_launch`, `batch_update`):

1. Go to [script.google.com](https://script.google.com/) and create (or open) your standalone `GoogleSheet_UI_auditor_WebApp` project.
2. Replace `Code.gs` with the contents of [`apps_script/Code.gs`](./apps_script/Code.gs) and save (`Ctrl + S`).
3. Click **Deploy > New deployment** (or **Deploy > Manage deployments > Edit > New version > Deploy**).
4. Set `SHEETS_MASTER_WEBAPP_URL` in `.env` to that Web App URL.
5. See [`apps_script/README.md`](./apps_script/README.md) for full instructions.

---

## Running Automated Tests & Quality Gates

The test layer is an **integral part of the project**, never an isolated afterthought. Whenever application code or `Code.gs` changes, always consider whether corresponding tests must be **created, updated, or deleted**, and run both backend and frontend gates:

### Backend & Contract Suite
```powershell
# Install dev/test dependencies once
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

# Run ruff static checks + all layers (unit, api, integration, contract) + coverage
.venv\Scripts\python.exe tests/run_tests.py --layer all --check-static --coverage

# Optional: run a single layer or the opt-in live Apps Script health probe (ZZ999)
.venv\Scripts\python.exe tests/run_tests.py --layer unit
.venv\Scripts\python.exe tests/run_tests.py --live-smoke
```
All default layers run 100% offline with mocked HTTP and an isolated temporary `launch_calendar.json`.

### Frontend Suite (`Vitest` + `TypeScript`)
```powershell
cd frontend
npm.cmd run test
npm.cmd run build
```

