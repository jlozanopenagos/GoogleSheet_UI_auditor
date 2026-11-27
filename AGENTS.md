# AGENTS.md — System Guidelines & Operational Architecture (v1.0)

## 1. Project Context & Purpose

`GoogleSheet_UI_auditor` (v1.0) is an independent, high-performance web studio engineered to inspect, audit, modify, and enrich YouTube Shorts video scripts, titles, descriptions, and launch schedules across 16 Google Sheets (4 languages × 4 video formats).

This repository owns editorial review, Short titles (Column J), descriptions (Column I), readiness, and release scheduling. Shorts Studio and ComfyUI run separately, and `apps_script/Code.gs` is deployed as a **standalone auditor-only Web App** isolated from `shorts_automation`. Always run the full quality gate — `.venv\Scripts\python.exe tests/run_tests.py --layer all --check-static` (backend static checks + `unit`, `api`, `integration`, and `contract` suites) and `cd frontend; npm.cmd run test` (Vitest UI/API suite) — before finishing changes. Preserve mocked Sheets and Gemini boundaries in offline tests and keep the checked-in production frontend bundle (`frontend/dist/`) in sync with frontend source changes.

Instead of manually navigating multiple Google Sheets files in a browser, creators use this standalone tool to:
1. Instantly navigate to any script by canonical ID (e.g., `EF01`, `SR04`).
2. Compare original script narration (Column C) against edited revisions (Column D).
3. Update modified scripts in Google Sheets in-place alongside readiness flags (Column E) and scheduled dates (Column F in `DD/MM/YY` format).
4. Inspect, author, and copy YouTube Shorts titles (Column J, `short_title`) alongside viral, SEO-optimized YouTube Shorts descriptions (Column I) generated via Google Gemini AI tailored strictly per video type with zero spoilers and tasteful emojis (1–3 max).

---

## 2. Core Architectural Tenets (SOLID & DRY)

1. **Single Responsibility Principle (SRP)**:
   - `core/routing.py`: Parses canonical IDs and resolves them to their corresponding Google Sheet ID and tab.
   - `services/sheet_service.py`: Handles resilient HTTP communication with the Google Apps Script Web App (redirects, retries, payload serialization).
   - `services/prompt_service.py`: Generates format-specific, high-CTR YouTube Shorts description prompts.
   - `services/title_prompt_service.py`: Generates format-specific, compact thumbnail title prompts (2–7 words, ≤ 45 chars ideal, triad-differentiated, zero emojis/prefixes, rotating creative angles).
   - `services/gemini_service.py`: Manages the Gemini API client, response validation, emoji sanitization, title auditing, and hashtag verification.
   - `services/youtube_auth_service.py`: Manages per-language Brand Account YouTube OAuth 2.0 and read-only Google Drive OAuth tokens.
   - `services/drive_asset_service.py`: Navigates `_videos terminados/<lang>/<type>/<ID>/`, streams thumbnail previews, and downloads MP4/thumbnail assets for upload.
   - `services/youtube_upload_service.py`: Converts `America/Bogota` schedule timestamps to UTC ISO 8601 (`privacyStatus="private"` + `publishAt`), runs resumable `videos.insert`, polls `processingDetails` before `thumbnails.set`, and persists local upload history.
2. **Open/Closed Principle (OCP)**:
   - Format prompt strategies are decoupled into modular strategies (`ExpressionPromptStrategy`, `GamePromptStrategy`, `RoleplayPromptStrategy`, `FunFactsPromptStrategy`), allowing easy addition of new content types or tuning without touching the orchestration engine.
3. **Liskov Substitution & Interface Segregation (LSP / ISP)**:
   - Clean, strict Pydantic models and TypeScript contracts (`ScriptRecord`, `UpdateScriptRequest`, `UpdateDescriptionRequest`, `UpdateTitleRequest`, `GeminiGenerateRequest`, `GeminiTitleGenerateRequest`, `CalendarCheckRequest`, `CalendarScheduleRequest`) ensure explicit data boundaries between frontend and backend.
4. **Don't Repeat Yourself (DRY)**:
   - The frontend shares the canonical `IdSearchBar` component across Tab 1 (Script auditor) and Tab 2 (Title & description).
   - `ScriptAuditorView` and `DescriptionCreationView` follow a consistent side-by-side read-only reference vs. editable panel layout with collapsible mobile reference drawers.
   - Centralized status badges, date inputs, API fetch helpers (`frontend/src/services/api.ts`), and toast notifications (`NotificationToast`).

---

## 3. Canonical ID Architecture & Routing Engine

Every script in the production universe possesses a unique, deterministic 4-character ID:

$$\textbf{<Language\_Code><Type\_Code><Index:02d>}$$

- **Language Code** (1st character):
  - `E` $\to$ English
  - `F` $\to$ French
  - `S` $\to$ Spanish
  - `I` $\to$ Italian
- **Video Type Code** (2nd character):
  - `E` $\to$ EXPRESSION (Idiomatic/colloquial focus)
  - `G` $\to$ GAME (Fast-paced interactive quiz/trivia)
  - `R` $\to$ ROLEPLAY (Real-life situational dialogue)
  - `F` $\to$ FUN_FACTS (Curious cultural or linguistic discoveries)
- **Index** (3rd and 4th characters):
  - 2-digit zero-padded integer (`01` to `99`).

### Routing Decision Matrix
When the user submits an ID into the search bar:
- The system automatically identifies the exact Google Sheet URL from the environment matrix.
- It queries the sheet via the Apps Script Web App API (`?id=<SPREADSHEET_ID>`).
- It extracts the exact row matching the ID without full-text searching by title.
- If the ID does not exist, a clean error notification is displayed immediately.

---

## 4. Google Sheets Column Schema

| Column Letter | Header Name in Sheet | Data Type | Tab 1 (Script Auditor) | Tab 2 (Description Creation) | Tab 3 & 4 (Bingo / Launch Calendar) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **A** | `ID` | Text (`EE01`, `FG03`) | Row Key / Identification | Row Key / Identification | Matrix / Calendar Key |
| **B** | `expression` | Text | Display label ("Editing X: Y") | Display label ("Editing X: Y") | Tooltip / Topic Label |
| **C** | `script` | Text | Read-only (Left comparison box) | Contextual reference | - |
| **D** | `SCRIPT_CHANGED` | Text | Editable (Right box) | Required Gemini Input | Yellow / Green / Calendar Gate |
| **E** | `script_ready` | Checkbox (`TRUE`/`FALSE`) | Editable checkbox | - | Required Calendar Gate (auto-check option) |
| **F** | `script_date` | Date (`DD/MM/YY` e.g. `31/01/26`) | Editable date input | - | Production ready date |
| **G** | `video_ready` | Checkbox (`TRUE`/`FALSE`) | - | - | Launch Calendar sync (`TRUE` when launched) |
| **H** | `video_date` | Date (`DD/MM/YY`) | - | - | Launch Calendar date (`DD/MM/YY`) |
| **I** | `short_description` | Text | - | Read-only (Left) & Editable (Right) | Green / Calendar Gate |
| **J** | `short_title` | Text | - | Editable Short Title card (non-empty) | Informational status & search |

> [!IMPORTANT]
> **Standalone Apps Script & Column I/J Auto-Initialization**: `apps_script/Code.gs` is a standalone Web App exclusively for `GoogleSheet_UI_auditor` (supporting only the 5 explicit `doPost` actions: `update_script`, `update_description`, `update_title`, `update_launch`, and `batch_update`, and rejecting unknown actions). In sheets where Column I or Column J is currently unassigned or headerless, it automatically writes `"short_description"` into row 1 of Column I and `"short_title"` into row 1 of Column J.

---

## 5. UI Operational Workflow

### Tab 1: "Script Auditor / Script Editing"
- **Header**: `Editing <ID>: <expression_name>`
- **Left Box (Read-Only)**: Content of Column C (`script`). Copying text is allowed; direct editing is locked.
- **Right Box (Editable)**: Content of Column D (`SCRIPT_CHANGED`).
  - If empty: displays placeholder `"you can edit here the new version of the script {expression_name}"`.
  - **Gemini Script Doctor**: Top-right corner button with Gemini/Sparkles icon and tooltip `"change the script with Gemini"`. Reads Column C and doctors it into a fresh, out-of-the-box script adhering strictly to format rules and word budgets:
    - `EXPRESSION`: 85–110 words, 5-paragraph progression (Hook, Setup, Discovery, Example, Payoff).
    - `ROLEPLAY`: 145–180 words, 6-block peer dialogue (Narrator Hook, 4 dialogue exchanges with emotional tags, Narrator Payoff). Banned tutor tropes and bets.
    - `GAME`: 95–125 spoken words across 5 sections (Hook, Challenge, Pressure, Answer, Explanation). **Zero chalkboard graphic cards in spoken audio**. Zero isolated bare words (e.g. `Record` / `reCORD`), zero all-caps stress spoilers. Rotates through **6+ viral game mechanics** (Native Intuition Test, Collocation Duel, Minimal Pair Acoustic Test, Spot the Imposter, False Friend Ambush, Context Mystery) rather than repetitive "A/B" options.
    - `FUN_FACTS`: 95–135 words, 3–5 clean paragraphs (Hook, Historical/Phonetic mystery, Payoff). 100% factual integrity.
  - Automatically loads the doctored result into Column D and activates the Save button.
- **Under the Right Box**:
  - **Save Script Button**: Pushes updated `SCRIPT_CHANGED`, `script_ready`, and `script_date` to the sheet in place.
  - **Button State**: Disabled while an update is in flight. Once updated, displays a success notification and remains disabled until the user modifies the text again.
  - **Column E Checkbox (`script_ready`)**: Toggleable only when script content has been edited or populated.
  - **Column F Date Input (`script_date`)**: Formatted as `DD/MM/YY` (e.g. `31/01/26`). Accessible only when script content is edited.

### Tab 2: "Title & description"
- **Header**: `Editing <ID>: <expression_name>`
- **Short Title Card (Column J)**: Always visible for the selected ID; displays whether a title is already saved in Column J, supports 1-click copy, live `100`-char counter with thumbnail readability indicator, manual editing/saving (non-empty text required), and **Generate title with Gemini** (requires Column D, fills input for review/regeneration with no auto-save, avoids `previous_titles`).
- **If Column I has content**:
  - Left Box: Read-only Column I content.
  - Right Box: Editable Column I content + Save Button.
- **If Column I is empty**:
  - Displays two prominent action buttons:
    1. **"Create a new description"**: Opens an editable input card + Save button.
    2. **"Gemini creation"**: Invokes the Gemini API generation engine.
- **When Gemini Generates Output**:
  - Displays the generated copy on the left (read-only) and in the editable right box.
  - User can polish text and click "Save Description" to push directly to Column I in the sheet.

### Tab 3: "ID checklist" (4-State Bingo Matrix)
- Displays all canonical IDs for the selected `(language, video_type)` across 4 states:
  - **Violet (`violet`)**: Already scheduled on the YouTube Launch Calendar (with Column D + Column I ready).
  - **Green (`green`)**: Script revision (Column D) + SEO Description (Column I) ready to launch.
  - **Yellow (`yellow`)**: Script revision ready (Column D), needs SEO description (Column I).
  - **Grey (`grey`)**: Script revision (Column D) empty.
- Clicking a Green card exposes a **"Schedule in Calendar"** button; clicking a Violet card displays its launch date and a **"View in Calendar"** shortcut.

### Tab 4: "Launch calendar" (Dynamic YouTube Launch Tracker)
- Interactive monthly/weekly calendar tracking YouTube Shorts already launched or scheduled per language (`All` / `English` / `French` / `Spanish` / `Italian`).
- **Readiness Gate**: Before adding an ID, verifies live Google Sheets state (`SCRIPT_CHANGED` in Col D, `script_ready` checkbox in Col E, and `short_description` in Col I). If Col D + Col I are ready while Col E is unchecked, provides a 1-click **"Check Column E & Add to Calendar"** shortcut; missing D or I routes straight to Tab 1 or Tab 2.
- **Per-Language Daily Cadence Rules (Soft Warning + Override)**:
  - **Fun Fact Day**: `1 FUN_FACTS` short per day per language.
  - **Triad Day**: Up to `3` shorts per day per language (`1 EXPRESSION + 1 GAME + 1 ROLEPLAY`, flagging format duplicates or mixing Fun Facts unless overridden with `"Force schedule anyway"`).
- **Persistence & Multi-PC Sync**: Saves launch records to `backend/data/launch_calendar.json` and syncs Column G (`video_ready = TRUE`) + Column H (`video_date = DD/MM/YY`) in Google Sheets via `action: "update_launch"`. `apps_script/Code.gs` applies `.setNumberFormat("@")` on `script_date` / `video_date` writes so Google Sheets preserves `DD/MM/YY` literal text without locale day/month flipping. Once added, the ID card turns **Violet** in Tab 3 (removing it reverts the Bingo card to **Green**). Use the **"Sync from Sheets"** button (`POST /api/calendar/sync`) to pull scheduled rows across all 16 Google Sheet tabs onto any PC.

### Tab 5: "YouTube upload" (Multi-Channel OAuth + Drive Uploader)
- Connects Google Drive (`drive.readonly`) and each of the 4 language Brand Account channels (`english`, `french`, `spanish`, `italian`) via `backend/credentials/client_secret.json` (tokens stored in `backend/data/youtube_tokens/`).
- Independent of Tab 4 (reads Tab 4 / Column H launch date only as a read-only date suggestion without mutating Tab 4 or Sheets).
- Locates `<ID>.mp4` and thumbnail PNGs in `_videos terminados/<lang>/<type>/<ID>/`; requires explicit selection between **LatAm** and **Spain** thumbnails when multiple variants exist.
- Schedules using `privacyStatus = "private"` + `publishAt` in UTC ISO 8601 (converted from user-entered **America/Bogota, UTC-05:00** hour), waits for `processingStatus == "succeeded"` before calling `thumbnails.set`, and records upload history in `backend/data/youtube_uploads.json`.

---

## 6. Gemini SEO Description Engine Rules

The Gemini system prompts are specialized per video format to follow 2026 YouTube Shorts SEO and high-retention engagement best practices:

1. **Rich 3-Beat Narrative Architecture (60–90 words, 350–500 characters)**:
   - **Paragraph 1 (The Hook)**: Punchy high-curiosity opening (provocative myth-buster, rhetorical question, or relatable blunder) placed within the first 120–150 characters before the mobile `...more` fold.
   - **Paragraph 2 (The Stakes & Retention Driver)**: Expands the scenario, tension, or mystery without spoilers. MUST include an explicit viewer retention driver (e.g. *"Stick around until the end to discover..."*, *"Watch till the end to see the correct answer and learn..."*, *"Watch what happens next!"*).
   - **Paragraph 3 (The Social Engagement CTA)**: A conversational call-to-action question urging viewers to comment, tag a friend, or drop a guess, ending with a pointer emoji (`👇` or `💬`).
   - **Hashtags**: Exactly 3 to 5 targeted hashtags at the bottom (blending target language tags like `#ApprendreLeFrancais`, `#AprenderEspanol` with high-traffic global discovery tags like `#Shorts`, `#LearnEnglish`).

2. **Format-Specific Psychological Angles**:
   - **`EXPRESSION`**: Highlights the gap between literal textbook translation and true native conversational meaning. Good intentions triggering unexpected panic, laughter, or disaster.
   - **`GAME`**: Fast trivia ear challenge / dilemma. Urges viewers to test their knowledge, challenge their ears, and guess before the reveal countdown.
   - **`ROLEPLAY`**: Real-life conversational banter, awkward interpersonal tension, and dialogue misunderstandings between two characters.
   - **`FUN_FACTS`**: The "Wait, really?!" phenomenon. Mind-bending linguistic etymologies, forgotten historical inventions (e.g. printing press), or bizarre linguistic fossils trapped in time.

3. **Strict Output Invariants**:
   - **Target Language Purity**: The prose description MUST be written 100% in the video's target language (English, French, Spanish, or Italian). No mixed languages in the prose.
   - **Zero Spoilers (Absolute Rule)**: NEVER reveal the quiz answer, the secret native expression, the translation, or the punchline in the description!
   - **Tasteful Emojis (1 to 3 MAX)**: Emojis are permitted and encouraged in moderation (e.g. `😬`, `👇`, `🤯`, `💬`, `🤔`, `👀`) to add visual personality without looking spammy.
   - **Dynamic Variation Mandate**: Temperature is set to `0.75` with diverse opening/middle/closing strategies so that repeated generations for the same script produce fresh, varied descriptions rather than formulaic templates.
   - **Prerequisite Check**: If Column D (`SCRIPT_CHANGED`) is empty, Gemini generation is blocked with an explicit error.
   - **Zero Commentary**: Strictly forbidden from outputting conversational fluff ("Here is your description:"), markdown quotes, or explanations.

---

## 7. Testing Architecture & Mandatory Test-Layer Policy

### Multi-Layer Quality Architecture
| Layer | Location | Purpose & Scope |
| :--- | :--- | :--- |
| **Static Analysis** | `pyproject.toml` (`ruff`) + `tsc` | Catches undefined names, unused imports, lint errors, and TypeScript regressions before runtime. |
| **Backend Unit** | `tests/unit/` | Fast pure-logic & service tests (`routing`, `prompt_service`, `title_prompt_service`, `gemini_auditor`, `gemini_service`, `script_doctor_service`, `calendar_service`, `sheet_service`, `youtube_auth_service`, `drive_asset_service`, `youtube_upload_service`). |
| **Backend API** | `tests/api/` | FastAPI `TestClient` router contracts (`sheets`, `gemini`, `calendar`, `youtube`), HTTP status codes (`400`/`404`/`502`), and validation rules. |
| **Backend Integration** | `tests/integration/` | Cross-service lifecycles (`Schedule -> Violet Bingo -> Move -> Unschedule -> Green Bingo -> Sync from Sheets`). |
| **Apps Script Contract** | `tests/contract/` | Verifies `apps_script/Code.gs` handles all backend `doPost` actions, returns `updated_fields`, and enforces `.setNumberFormat("@")` on date cells. |
| **Frontend Tests** | `frontend/src/__tests__/` | `vitest` + `@testing-library/react` tests for `services/api.ts`, `ScriptAuditorView.tsx`, `DescriptionCreationView.tsx`, `IdChecklistView.tsx`, `LaunchCalendarView.tsx`, and `YouTubeUploadView.tsx`. |

- **Global Isolation Guardrails (`tests/conftest.py`)**: An `autouse` fixture isolates `CalendarService` to a per-test temp JSON file (protecting live `backend/data/launch_calendar.json`) and blocks accidental real outbound HTTP requests via `requests.Session.request` unless explicitly running `--live-smoke`.
- **Unified Runner (`tests/run_tests.py`)**: Run `--layer {unit,api,integration,contract,all}`, `--check-static`, `--coverage`, or opt-in `--live-smoke` (harmless `ZZ999` probe verifying live Apps Script deployment).

### Mandatory Test-Layer Coupling Rule (Never Isolate Tests)
> [!IMPORTANT]
> **The test layer is an inseparable part of this application — never isolate tests from feature or maintenance work.**
> Whenever you introduce a new feature, modify existing logic, refactor modules, or remove/deprecate functionality, you **MUST** evaluate the impact on every relevant test layer:
> 1. **Create** unit, API, integration, contract, and/or frontend tests covering any new behavior, edge cases, or bug fixes.
> 2. **Update** existing tests whenever schemas, API contracts, UI flows, or Apps Script handlers change.
> 3. **Delete** obsolete tests when features or modules are intentionally removed so the suite never carries dead or misleading coverage.
> 4. **Verify** the full static + test + build gate passes before concluding (`tests/run_tests.py --layer all --check-static --coverage`, `npm.cmd run test`, and `npm.cmd run build`).

---

## 8. Developer Guidelines

- **Portability**: The web app runs on localhost via a single command: `py run.py`.
- **Backend**: FastAPI + Uvicorn with clean route handlers and `ruff` linting configured in `pyproject.toml`.
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Vitest (`frontend/vitest.config.ts`) pre-compiled into `frontend/dist/`.
- **Version Control**: Completely isolated inside `D:\AI_video_generation\GoogleSheet_UI_auditor/.git`.

