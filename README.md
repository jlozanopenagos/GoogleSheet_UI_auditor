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
   - **Gemini SEO Invariants**:
     - Specialized system prompts per format (`EXPRESSION`, `GAME`, `ROLEPLAY`, `FUN_FACTS`).
     - **100% Target Language Purity**: Body prose written purely in the target language (no mixed languages).
     - **3 to 5 Targeted Hashtags**: Blends target language keywords with high-volume English discovery tags (`#Shorts`, `#LearnEnglish`, etc.).
     - **Zero Spoilers**: Never gives away the quiz answer, twist, or meaning.
     - **Zero Emojis & Zero Commentary**: Clean, pure description text.
     - **Prerequisite Gate**: Requires Column D (`SCRIPT_CHANGED`) to be non-empty before calling Gemini.

---

## Quick Start

### 1. Prerequisites
- Python 3.10+ (Windows `py` launcher or `python3`)
- Node.js 18+ (only if rebuilding frontend sources)

### 2. Launch the Application
Run the root launcher:
```powershell
py run.py
```
- Starts the FastAPI backend on `http://127.0.0.1:8005`.
- Automatically opens the application in your default web browser.

Optional flags:
```powershell
py run.py --port 8080 --no-browser
```

---

## Directory Architecture

```text
GoogleSheet_UI_auditor/
├── backend/
│   ├── app/
│   │   ├── core/               # Configuration (.env), canonical ID routing & sheet resolution
│   │   ├── models/             # Typed Pydantic schemas (ScriptRecord, API envelopes)
│   │   ├── routers/            # /api/sheets (script ops), /api/gemini (SEO generation)
│   │   └── services/           # SheetService (HTTP client & retries), GeminiService, PromptService
│   ├── main.py                 # FastAPI application factory & static SPA host
│   └── requirements.txt        # Production Python dependencies
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/         # IdSearchBar (DRY), Header, NotificationToast
│   │   ├── views/              # ScriptAuditorView (Tab 1), DescriptionCreationView (Tab 2)
│   │   ├── services/           # Typed API fetch client
│   │   └── types/              # TypeScript interfaces
│   ├── dist/                   # Pre-compiled static assets served directly by FastAPI
│   ├── package.json
│   └── vite.config.ts
├── apps_script/                # Enhanced Code.gs for Google Sheets Web App deployment
│   ├── Code.gs                 # Full Apps Script code (reading A-I, updating D, E, F, I in place)
│   └── README.md               # 2-minute deployment guide
├── tests/                      # Automated test suite (routing, prompts, sheet mapping)
│   └── test_auditor.py
├── .env.example                # Environment variable configuration template
├── AGENTS.md                   # System guidelines, prompt rules & developer directives
├── run.py                      # Root one-click launcher
└── README.md                   # Operational manual (this document)
```

---

## Google Apps Script Deployment

To ensure Google Sheets reads Column I (`short_description`), formats dates as `DD/MM/YY`, and performs in-place cell updates for Columns D, E, F, and I:

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

