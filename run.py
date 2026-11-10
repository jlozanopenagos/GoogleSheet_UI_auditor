"""
run.py — Unified launcher for GoogleSheet_UI_auditor
"""

import sys
import os
import argparse
import webbrowser
from pathlib import Path
# pyrefly: ignore[missing-import]
import uvicorn

# Ensure backend directory is in sys.path
root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Auto-initialize .env from .env.example if missing
env_file = root_dir / ".env"
env_example = root_dir / ".env.example"
if not env_file.exists() and env_example.exists():
    import shutil
    shutil.copy(env_example, env_file)
    print("[*] Initialized .env from .env.example")

# pyrefly: ignore[missing-import]
from app.core.config import settings


def main():
    parser = argparse.ArgumentParser(description="Launch GoogleSheet_UI_auditor")
    parser.add_argument("--host", default=settings.host, help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=settings.port, help="Bind port (default: 8005)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")
    parser.add_argument("--reload", action="store_true", help="Enable uvicorn auto-reload")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"
    print("=" * 65)
    print(f"  GoogleSheet_UI_auditor — Management Studio")
    print(f"  Listening at: {url}")
    print("=" * 65)

    if not args.no_browser:
        # Schedule browser opening after server startup
        import threading
        import time

        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(url)
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run("main:app", host=args.host, port=args.port, reload=args.reload, app_dir=str(backend_dir))


if __name__ == "__main__":
    main()

