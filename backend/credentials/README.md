# Google Cloud OAuth 2.0 Setup Guide (YouTube + Google Drive)

Follow these steps to create `backend/credentials/client_secret.json` so `GoogleSheet_UI_auditor` can read finished assets from Google Drive (`_videos terminados`) and upload/schedule Shorts across your 4 YouTube channels (`English`, `French`, `Spanish`, `Italian`).

---

## 1. Enable Required APIs in Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select your existing project (or create a new one, e.g. `YouTube-Shorts-Auditor`).
3. Go to **APIs & Services > Library** and enable both:
   - **YouTube Data API v3**
   - **Google Drive API**

---

## 2. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen** (or **Google Auth Platform > Audience**).
2. Choose **External** (unless you use Google Workspace Internal).
3. Under **Test users**, click **Add users** and add the Google account email that owns/manages your 4 YouTube Brand Account channels and Google Drive folder.
4. Under **Data Access / Scopes**, add:
   - `https://www.googleapis.com/auth/youtube`
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/drive.readonly`

---

## 3. Create OAuth 2.0 Client ID (`client_secret.json`)

1. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
2. Choose **Web application**.
3. Name it `GoogleSheet_UI_auditor_Local`.
4. Under **Authorized redirect URIs**, add:
   - `http://127.0.0.1:8005/api/youtube/oauth/callback`
   - *(Optional)* `http://localhost:8005/api/youtube/oauth/callback`
5. Click **Create**, download the JSON file, rename it to `client_secret.json`, and place it at:
   `backend/credentials/client_secret.json`

*(This path is git-ignored so your credentials are never committed.)*

---

## 4. Connect Your 4 Channels & Google Drive in Tab 5

1. Open the app (`http://127.0.0.1:8005`) and go to **YouTube upload** (Tab 5).
2. Click **Connect** on **Google Drive** and grant read-only Drive access.
3. Click **Connect** for each language (**English**, **French**, **Spanish**, **Italian**).
   - On Google's account/channel selector screen, pick the **exact Brand Account YouTube channel** corresponding to that language.
   - Tab 5 verifies the channel via `channels.list(mine=True)` and displays its channel name so you can verify each slot is mapped to the right language channel.

---

## 5. Important: YouTube API Compliance Audit (Public Publishing)

For Google Cloud projects created after **July 28, 2020**, YouTube locks all API-uploaded videos (`videos.insert`) to **Private**—even when `publishAt` or `public` is requested—until the Google Cloud project passes the **YouTube API Services Compliance Audit**.

- **Before audit approval**: Uploads still succeed end-to-end (video + title + description + custom thumbnail + schedule metadata), and you can flip visibility in YouTube Studio if needed.
- **To unlock automated Public / Scheduled publishing**: Submit Google's **YouTube API Services – Audit and Quota Extension Form** from the YouTube Data API developer documentation.
