from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.requests import Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

from .services import (
    BedrockConsoleBridge,
    MapDataCache,
    get_live_players,
    perform_safe_teleport,
    queue_todo_request,
    resolve_ground_target,
    summarize_status,
)


NO_STORE_HEADERS = {"Cache-Control": "no-store"}


@dataclass
class DashboardRuntime:
    root_dir: Path
    server_dir: Path
    map_cache: MapDataCache
    command_bridge: BedrockConsoleBridge

    @property
    def frontend_dist_dir(self) -> Path:
        return self.root_dir / "webapp" / "dist"


runtime: DashboardRuntime | None = None


def require_runtime() -> DashboardRuntime:
    if runtime is None:
        raise RuntimeError("Dashboard runtime is not configured")
    return runtime


def serve_frontend(path: str = "index.html"):
    current = require_runtime()
    dist_dir = current.frontend_dist_dir
    target = (dist_dir / path).resolve()

    if not dist_dir.exists():
        return HTMLResponse(
            "<h1>Frontend not built</h1><p>Run <code>npm --prefix webapp run build</code> first.</p>",
            status_code=503,
            headers=NO_STORE_HEADERS,
        )

    try:
        target.relative_to(dist_dir)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Not found") from error

    if not target.exists():
        if "." in Path(path).name:
            raise HTTPException(status_code=404, detail="Not found")
        target = dist_dir / "index.html"

    return FileResponse(target)


app = FastAPI(title="Minecraft Bedrock Dashboard")
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.get("/api/status")
def api_status() -> JSONResponse:
    current = require_runtime()
    payload = summarize_status(current.root_dir, current.server_dir).as_dict()
    return JSONResponse(payload, headers=NO_STORE_HEADERS)


@app.get("/api/map-data")
def api_map_data(refresh: bool = False) -> JSONResponse:
    current = require_runtime()
    payload = current.map_cache.get_public(current.root_dir, current.server_dir, refresh=refresh)
    return JSONResponse(payload, headers=NO_STORE_HEADERS)


@app.get("/api/live-players")
def api_live_players() -> JSONResponse:
    current = require_runtime()
    snapshot = summarize_status(current.root_dir, current.server_dir)
    payload = {"players": get_live_players(current.command_bridge, snapshot.players_online)}
    return JSONResponse(payload, headers=NO_STORE_HEADERS)


@app.post("/api/agent/request")
async def api_agent_request(request: Request) -> Response:
    current = require_runtime()
    try:
        body = await request.json()
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON body") from error
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    user_request = body.get("request")
    if not isinstance(user_request, str) or not user_request.strip():
        raise HTTPException(status_code=400, detail="Missing request text")

    try:
        queue_todo_request(current.root_dir / "TODO.md", user_request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return Response(status_code=204, headers=NO_STORE_HEADERS)


@app.get("/api/teleport-preview")
def api_teleport_preview(x: float, z: float) -> JSONResponse:
    current = require_runtime()
    try:
        target = resolve_ground_target(current.map_cache.get(current.root_dir, current.server_dir), x, z)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return JSONResponse({"target": target}, headers=NO_STORE_HEADERS)


@app.post("/api/teleport-player")
async def api_teleport_player(request: Request) -> JSONResponse:
    current = require_runtime()
    try:
        body = await request.json()
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid JSON body") from error

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    player_name = body.get("playerName")
    confirm = body.get("confirm")
    try:
        x_value = float(body.get("x"))
        z_value = float(body.get("z"))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Invalid teleport coordinates") from error

    if not isinstance(player_name, str) or not player_name.strip():
        raise HTTPException(status_code=400, detail="Missing player name")
    if confirm is not True:
        raise HTTPException(status_code=400, detail="Teleport confirmation is required")

    try:
        target = perform_safe_teleport(
            current.command_bridge,
            current.map_cache.get(current.root_dir, current.server_dir),
            player_name.strip(),
            x_value,
            z_value,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return JSONResponse({"ok": True, "playerName": player_name.strip(), "target": target}, headers=NO_STORE_HEADERS)


@app.get("/assets/{asset_path:path}", response_model=None)
def frontend_assets(asset_path: str):
    return serve_frontend(f"assets/{asset_path}")


@app.get("/", response_model=None)
def frontend_root():
    return serve_frontend("index.html")


@app.get("/map", response_model=None)
def frontend_map():
    return serve_frontend("index.html")


@app.get("/{path:path}", response_model=None)
def frontend_fallback(path: str):
    return serve_frontend(path or "index.html")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve Minecraft Bedrock status dashboard")
    parser.add_argument("--root-dir", required=True)
    parser.add_argument("--server-dir", required=True)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=60120)
    return parser.parse_args()


def configure_runtime(root_dir: Path, server_dir: Path) -> None:
    global runtime
    runtime = DashboardRuntime(
        root_dir=root_dir.resolve(),
        server_dir=server_dir.resolve(),
        map_cache=MapDataCache(),
        command_bridge=BedrockConsoleBridge(server_dir.resolve()),
    )
    runtime.map_cache.start_refresh(runtime.root_dir, runtime.server_dir)


def main() -> int:
    args = parse_args()
    configure_runtime(Path(args.root_dir), Path(args.server_dir))
    uvicorn.run(app, host=args.bind, port=args.port, log_level="warning")
    return 0
