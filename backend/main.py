"""
main.py — FastAPI Server Entrypoint for GoogleSheet_UI_auditor
"""

from __future__ import annotations

import os
from pathlib import Path
# pyrefly: ignore[missing-import]
from fastapi import FastAPI
# pyrefly: ignore[missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore[missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore[missing-import]
from fastapi.responses import FileResponse

from app.core.config import settings
from app.routers.sheets import router as sheets_router
from app.routers.gemini import router as gemini_router

app = FastAPI(
    title="GoogleSheet UI Auditor API",
    description="Standalone studio for Google Sheets script auditing, editing, and YouTube Shorts SEO description generation.",
    version="1.0.0"
)

# CORS Middleware (permits Vite dev server and localhost requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(sheets_router)
app.include_router(gemini_router)


@app.get("/api/health")
def health_check():
    """Health probe reporting API status, configured endpoints, and Gemini readiness."""
    return {
        "status": "healthy",
        "app": "GoogleSheet_UI_auditor",
        "master_webapp_configured": bool(settings.master_webapp_url),
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_model": settings.gemini_model
    }


# Static frontend hosting (serves pre-compiled React SPA from frontend/dist)
static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve static file if exists, else serve index.html for SPA client-side routing
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")


if __name__ == "__main__":
    # pyrefly: ignore[missing-import]
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

