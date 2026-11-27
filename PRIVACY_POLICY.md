# Privacy Policy — Lingoverse Shorts Studio (`GoogleSheet_UI_auditor`)

**Last Updated:** November 27, 2026  
**Application Name:** Lingoverse Shorts Studio (`GoogleSheet_UI_auditor`)  
**Operator:** Independent Creator (Lingoverse Project)  
**Contact:** `fluencylabshorts@gmail.com`

---

## 1. Overview & Private Creator Scope

Lingoverse Shorts Studio (`GoogleSheet_UI_auditor`) is a private, local-only desktop web application running on `127.0.0.1:8005` for the channel owner's exclusive use to audit scripts, manage metadata, and upload original short-form educational videos (YouTube Shorts) to the owner's four language channels (English, French, Spanish, and Italian).

There are **no external users**, no public registration, and no commercial data monetization.

---

## 2. YouTube API Services & Google APIs Used

This application uses **YouTube API Services** (YouTube Data API v3) and the **Google Drive API**. By using this application, you also acknowledge and agree to:

- **Google Privacy Policy:** [https://policies.google.com/privacy](https://policies.google.com/privacy)
- **YouTube Terms of Service:** [https://www.youtube.com/t/terms](https://www.youtube.com/t/terms)

### OAuth 2.0 Scopes Requested
1. `https://www.googleapis.com/auth/youtube` — List the authenticated channel's own playlists (`playlists.list`), verify channel identity (`channels.list`), poll upload processing status (`videos.list`), and add newly uploaded Shorts to a selected playlist (`playlistItems.insert`).
2. `https://www.googleapis.com/auth/youtube.upload` — Upload original video files (`videos.insert`) and apply custom thumbnails (`thumbnails.set`) to those uploads.
3. `https://www.googleapis.com/auth/drive.readonly` — Read-only access to locate and download the creator's own finalized `.mp4` videos and `.png` thumbnails from the creator's Google Drive folder (`_videos terminados`).

---

## 3. Data Accessed, Stored & Processed

- **OAuth Tokens:** Access and refresh tokens are stored **strictly locally** on the creator's machine inside `backend/data/youtube_tokens/` (excluded from version control via `.gitignore`).
- **Upload Metadata History:** Basic upload records (canonical script ID, YouTube video ID, channel title, playlist ID, and scheduled launch timestamp) are stored locally in `backend/data/youtube_uploads.json`.
- **Zero Third-Party Sharing:** No Google or YouTube data is transmitted to, sold to, aggregated for, or shared with any third-party analytics, advertising, or data broker services.

---

## 4. Data Retention, Deletion & Revocation

- **In-App Disconnection:** You can disconnect any connected YouTube channel or Google Drive token at any time using the **Disconnect** button in Tab 5 (**YouTube upload**), which immediately deletes the local token file.
- **Google Account Revocation:** You can revoke this application's access to your Google account and YouTube channels at any time via the **Google Security Settings** page:  
  [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions)
- **Local Deletion:** Deleting `backend/data/youtube_tokens/` and `backend/data/youtube_uploads.json` permanently removes all locally stored credentials and upload logs.
