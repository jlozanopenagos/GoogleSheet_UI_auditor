"""
main.py — FastAPI Server Entrypoint for GoogleSheet_UI_auditor
"""

from __future__ import annotations

from pathlib import Path
# pyrefly: ignore[missing-import]
from fastapi import FastAPI
# pyrefly: ignore[missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore[missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore[missing-import]
from fastapi.responses import FileResponse
# pyrefly: ignore[missing-import]
from app.core.config import settings
# pyrefly: ignore[missing-import]
from app.routers.sheets import router as sheets_router
# pyrefly: ignore[missing-import]
from app.routers.gemini import router as gemini_router
# pyrefly: ignore[missing-import]
from app.routers.calendar import router as calendar_router
# pyrefly: ignore[missing-import]
from app.routers.youtube import router as youtube_router

app = FastAPI(
    title="GoogleSheet UI Auditor API",
    description="Standalone v1.0 studio for Google Sheets script auditing, YouTube Shorts titles & Gemini SEO descriptions, ID checklist, and Launch Calendar.",
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
app.include_router(calendar_router)
app.include_router(youtube_router)


@app.get("/api/health")
def health_check():
    """Health probe reporting API status, configured endpoints, and Gemini readiness."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "app": "GoogleSheet_UI_auditor",
        "master_webapp_configured": bool(settings.master_webapp_url),
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_model": settings.gemini_model
    }


# Static frontend hosting (serves pre-compiled React SPA from frontend/dist)
static_dir = (Path(__file__).resolve().parent.parent / "frontend" / "dist").resolve()
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve static file if exists, else serve index.html for SPA client-side routing
        file_path = (static_dir / full_path).resolve()
        if file_path.is_relative_to(static_dir) and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")


if __name__ == "__main__":
    # pyrefly: ignore[missing-import]
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

