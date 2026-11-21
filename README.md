# GoogleSheet_UI_auditor

A standalone, high-performance web application designed for rapid auditing, editing, and YouTube Shorts SEO description creation across 16 Google Sheets (4 languages × 4 video formats).

---

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

3. **Tab 2: Description Creation & Gemini SEO Engine**:
   - Shared ID search bar and active script context.
   - **When Column I has content**:
     - Left box: Current Column I (`short_description`), read-only with copy button.
     - Right box: Editable Column I + Save button.
   - **When Column I is empty**:
     - Shows two centered actions:
       1. **Create a new description**: Manual entry card with immediate save action.
       2. **Gemini creation**: Consumes Google Gemini AI to synthesize a viral, format-specific YouTube Shorts description.
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
   - Clicking a Green card exposes a 1-click **"Schedule in Calendar"** button; clicking a Violet card shows its launch date and **"View / Move in Calendar"**.

5. **Tab 4: Launch Calendar (Dynamic YouTube Release Tracker)**:
   - Interactive Month/Week calendar tracking YouTube Shorts per language (`All`, `English`, `French`, `Spanish`, `Italian`).
   - **Readiness Gate**: Verifies Column D (`SCRIPT_CHANGED`), Column E (`script_ready = TRUE`), and Column I (`short_description`) before scheduling, with jump links to Tab 1 / Tab 2 or a 1-click **"Check Column E & Add to Calendar"** shortcut when D + I are ready.
   - **Per-Language Daily Cadence Rules (Soft Warning + Override)**: Supports **Fun Fact Day** (`1 Fun Fact`) or **Triad Day** (up to `3` shorts: `1 Expression + 1 Game + 1 Roleplay`) per language per day with an optional `"Force schedule anyway"` override.
   - Syncs launch status to Column G (`video_ready`) and Column H (`video_date` in `DD/MM/YY`) in Google Sheets alongside `backend/data/launch_calendar.json`, turning scheduled IDs **Violet** inside the Bingo matrix (or reverting them to **Green** when unscheduled).

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

---

## Directory Architecture

```text
GoogleSheet_UI_auditor/
├── backend/
│   ├── app/
│   │   ├── core/               # Configuration (.env), canonical ID routing & sheet resolution
│   │   ├── models/             # Typed Pydantic schemas (ScriptRecord, MatrixItem, Calendar schemas)
│   │   ├── routers/            # /api/sheets, /api/gemini, /api/calendar (Launch Calendar API)
│   │   └── services/           # SheetService, CalendarService, GeminiService, PromptService
│   ├── main.py                 # FastAPI application factory & static SPA host
│   └── requirements.txt        # Production Python dependencies
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/         # Header, NavigationTabs (4 tabs), IdSearchBar, NotificationToast
│   │   ├── views/              # ScriptAuditorView, DescriptionCreationView, IdChecklistView, LaunchCalendarView
│   │   ├── services/           # Typed API fetch client
│   │   └── types/              # TypeScript interfaces
│   ├── dist/                   # Pre-compiled static assets served directly by FastAPI
│   ├── package.json
│   └── vite.config.ts
├── apps_script/                # Enhanced Code.gs for Google Sheets Web App deployment
│   ├── Code.gs                 # Full Apps Script code (reading A-I, updating D, E, F, G, H, I in place)
│   └── README.md               # 2-minute deployment guide
├── tests/                      # Automated test suite (routing, prompts, sheets, calendar & Bingo)
│   └── test_auditor.py
├── .env.example                # Environment variable configuration template
├── AGENTS.md                   # System guidelines, prompt rules & developer directives
├── run.py                      # Root one-click launcher
└── README.md                   # Operational manual (this document)
```

---

## Google Apps Script Deployment

To ensure Google Sheets reads Column I (`short_description`), formats dates as `DD/MM/YY`, and performs in-place cell updates for Columns D, E, F, G (`video_ready`), H (`video_date`), and I:

1. Open your Google Sheet(s).
2. Go to **Extensions > Apps Script**.
3. Replace `Code.gs` with the code in [`apps_script/Code.gs`](./apps_script/Code.gs).
4. Save (💾) and click **Deploy > Manage deployments > Edit > New version > Deploy**.
5. See [`apps_script/README.md`](./apps_script/README.md) for full instructions.

---

## Running Automated Tests

```powershell
py tests/test_auditor.py
```
Executes all unit tests covering ID routing, format-specific prompt synthesis, and API endpoints.

