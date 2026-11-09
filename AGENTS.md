# AGENTS.md — System Guidelines & Operational Architecture

## 1. Project Context & Purpose

`GoogleSheet_UI_auditor` is an independent, high-performance web studio engineered to inspect, audit, modify, and enrich YouTube Shorts video scripts and metadata across 16 Google Sheets (4 languages × 4 video formats).

Instead of manually navigating multiple Google Sheets files in a browser, creators use this standalone tool to:
1. Instantly navigate to any script by canonical ID (e.g., `EF01`, `SR04`).
2. Compare original script narration (Column C) against edited revisions (Column D).
3. Update modified scripts in Google Sheets in-place alongside readiness flags (Column E) and scheduled dates (Column F in `DD/MM/YY` format).
4. Inspect, author, or generate viral, SEO-optimized YouTube Shorts descriptions (Column I) using Google Gemini AI tailored strictly per video type with zero spoilers and zero emojis.

---

## 2. Core Architectural Tenets (SOLID & DRY)

1. **Single Responsibility Principle (SRP)**:
   - `core/routing.py`: Parses canonical IDs and resolves them to their corresponding Google Sheet ID and tab.
   - `services/sheet_service.py`: Handles resilient HTTP communication with the Google Apps Script Web App (redirects, retries, payload serialization).
   - `services/prompt_service.py`: Generates format-specific, high-CTR YouTube Shorts description prompts.
   - `services/gemini_service.py`: Manages the Gemini API client, response validation, emoji sanitization, and hashtag verification.
2. **Open/Closed Principle (OCP)**:
   - Format prompt strategies are decoupled into modular strategies (`ExpressionPromptStrategy`, `GamePromptStrategy`, `RoleplayPromptStrategy`, `FunFactsPromptStrategy`), allowing easy addition of new content types or tuning without touching the orchestration engine.
3. **Liskov Substitution & Interface Segregation (LSP / ISP)**:
   - Clean, strict Pydantic models (`ScriptRecord`, `UpdateScriptPayload`, `UpdateDescriptionPayload`, `GeminiGeneratePayload`) ensure explicit data boundaries between frontend and backend.
4. **Don't Repeat Yourself (DRY)**:
   - The frontend shares the canonical `IdSearchBar` component across Tab 1 (Script Auditor) and Tab 2 (Description Creation).
   - The `DualContentEditor` component abstracts the side-by-side read-only vs. editable panel layout for both script revisions and description editing.
   - Centralized status badges, date inputs, and error notifications.

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

| Column Letter | Header Name in Sheet | Data Type | Tab 1 (Script Auditor) | Tab 2 (Description Creation) |
| :---: | :--- | :---: | :---: | :---: |
| **A** | `ID` | Text (`EE01`, `FG03`) | Row Key / Identification | Row Key / Identification |
| **B** | `expression` | Text | Display label ("Editing X: Y") | Display label ("Editing X: Y") |
| **C** | `script` | Text | Read-only (Left comparison box) | Contextual reference |
| **D** | `SCRIPT_CHANGED` | Text | Editable (Right box) | Required Gemini Input |
| **E** | `script_ready` | Checkbox (`TRUE`/`FALSE`) | Editable checkbox | - |
| **F** | `script_date` | Date (`DD/MM/YY` e.g. `31/01/26`) | Editable date input | - |
| **I** | `short_description` | Text | - | Read-only (Left) & Editable (Right) |

> [!IMPORTANT]
> **Column I Auto-Initialization**: In sheets where Column I is currently unassigned or headerless, the system automatically writes `"short_description"` into row 1 of Column I upon initialization or first save.

---

## 5. UI Operational Workflow

### Tab 1: "Script Auditor / Script Editing"
- **Header**: `Editing <ID>: <expression_name>`
- **Left Box (Read-Only)**: Content of Column C (`script`). Copying text is allowed; direct editing is locked.
- **Right Box (Editable)**: Content of Column D (`SCRIPT_CHANGED`).
  - If empty: displays placeholder `"you can edit here the new version of the script {expression_name}"`.
- **Under the Right Box**:
  - **Save Script Button**: Pushes updated `SCRIPT_CHANGED`, `script_ready`, and `script_date` to the sheet in place.
  - **Button State**: Disabled while an update is in flight. Once updated, displays a success notification and remains disabled until the user modifies the text again.
  - **Column E Checkbox (`script_ready`)**: Toggleable only when script content has been edited or populated.
  - **Column F Date Input (`script_date`)**: Formatted as `DD/MM/YY` (e.g. `31/01/26`). Accessible only when script content is edited.

### Tab 2: "Description creation"
- **Header**: `Editing <ID>: <expression_name>`
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

---

## 6. Gemini SEO Description Engine Rules

The Gemini system prompts are specialized per video format to follow 2026 YouTube Shorts SEO best practices:

1. **Format-Specific Psychological Angles**:
   - **`EXPRESSION`**: Highlights the hidden conversational meaning and the hilarious/awkward literal translation trap.
   - **`GAME`**: Fast trivia / ear-test challenge. Urges viewers to pause or guess before time runs out.
   - **`ROLEPLAY`**: Real-life situational tension. Focuses on interpersonal banter and awkward conflict resolution.
   - **`FUN_FACTS`**: Mind-bending linguistic discovery. Uses "Wait, really?!" curiosity hooks.
2. **Strict Output Invariants**:
   - **Target Language Purity**: The description text MUST be 100% in the video's target language (English, French, Spanish, or Italian). No mixed languages in the prose.
   - **No Spoilers**: NEVER reveal the answer to the quiz, the secret meaning, or the punchline in the description.
   - **High-CTR Hook**: Front-load curiosity in the first 80–120 characters before the mobile `...more` fold.
   - **Hashtags**: Exactly 3 to 5 relevant hashtags at the end, combining high-volume discovery tags (`#Shorts`, `#LearnSpanish`, etc.) and target language tags.
   - **Zero Emojis & Zero Commentary**: Banned from outputting emojis, conversational prefixes ("Here is the description:"), markdown wrappers, or explanations.
   - **Prerequisite Check**: If Column D (`SCRIPT_CHANGED`) is empty, generation is blocked with an explicit error.

---

## 7. Developer Guidelines

- **Portability**: The web app runs on localhost via a single command: `py run.py`.
- **Backend**: FastAPI + Uvicorn with clean async route handlers.
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS pre-compiled into static assets.
- **Version Control**: Completely isolated inside `D:\AI_video_generation\GoogleSheet_UI_auditor/.git`.
