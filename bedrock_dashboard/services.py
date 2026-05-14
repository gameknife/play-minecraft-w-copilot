#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import math
import re
import shutil
import struct
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4


TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S:%f"
SECONDS_PER_DAY = 20 * 60
TICKS_PER_DAY = 24000
MAP_CACHE_TTL_SECONDS = 600
PREDICTED_STRUCTURE_VERSION = "26.0"
SEED_FINDER_REPOSITORY = "https://github.com/unworthyzeus/minecraft-seed-finder.git"
SEED_FINDER_DIRNAME = "minecraft-seed-finder"

START_RE = re.compile(r"^\[(?P<ts>.+?) INFO\] Starting Server$")
STARTED_RE = re.compile(r"^\[(?P<ts>.+?) INFO\] Server started\.$")
VERSION_RE = re.compile(r"^\[.+? INFO\] Version: (?P<value>.+)$")
LEVEL_RE = re.compile(r"^\[.+? INFO\] Level Name: (?P<value>.+)$")
GAMEMODE_RE = re.compile(r"^\[.+? INFO\] Game mode: \d+ (?P<value>.+)$")
DIFFICULTY_RE = re.compile(r"^\[.+? INFO\] Difficulty: \d+ (?P<value>.+)$")
GAMEPLAY_PORT_RE = re.compile(r"^\[.+? INFO\] IPv4 supported, port: (?P<value>\d+): Used for gameplay$")
LAN_PORT_RE = re.compile(r"^\[.+? INFO\] IPv4 supported, port: (?P<value>\d+) used for LAN discovery$")
CONNECTED_RE = re.compile(r"^\[.+? INFO\] Player connected: (?P<value>[^,]+),")
SPAWNED_RE = re.compile(r"^\[.+? INFO\] Player Spawned: (?P<value>.+?) xuid:")
DISCONNECTED_RE = re.compile(r"^\[.+? INFO\] Player disconnected: (?P<value>[^,]+),")
QUERYTARGET_HEADER_RE = re.compile(r"Target data:\s*(\[.*)?$")
CLAUDE_CLI_PATHS = ("claude",)
COPILOT_CLI_PATHS = ("copilot",)
CODEX_CLI_PATHS = ("codex",)
FORBIDDEN_AGENT_COMMANDS = {
    "ban",
    "ban-ip",
    "banlist",
    "deop",
    "kick",
    "op",
    "permission",
    "reload",
    "restart",
    "save",
    "save-all",
    "save-off",
    "save-on",
    "stop",
    "whitelist",
}
AGENT_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["ready", "needs_clarification", "unsupported"]},
        "summary": {"type": "string"},
        "reasoning": {"type": "string"},
        "commands": {"type": "array", "items": {"type": "string"}},
        "warnings": {"type": "array", "items": {"type": "string"}},
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["status", "summary", "reasoning", "commands", "warnings", "questions"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class AvailableAgentCli:
    key: str
    label: str
    path: str

    def as_dict(self) -> dict[str, str]:
        return {"key": self.key, "label": self.label, "path": self.path}


@dataclass
class AgentPlan:
    id: str
    backend: str
    requested_by: str
    status: str
    summary: str
    reasoning: str
    commands: list[str]
    warnings: list[str]
    questions: list[str]
    created_at: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "backend": self.backend,
            "requestedBy": self.requested_by,
            "status": self.status,
            "summary": self.summary,
            "reasoning": self.reasoning,
            "commands": self.commands,
            "warnings": self.warnings,
            "questions": self.questions,
            "createdAt": self.created_at,
        }


class AgentPlanStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._plans: dict[str, AgentPlan] = {}

    def put(self, plan: AgentPlan) -> AgentPlan:
        with self._lock:
            self._plans[plan.id] = plan
        return plan

    def get(self, plan_id: str) -> AgentPlan | None:
        with self._lock:
            return self._plans.get(plan_id)


def is_agent_cli_healthy(path: str) -> bool:
    try:
        process = subprocess.run(
            [path, "--help"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return process.returncode == 0


def read_properties(path: Path) -> dict[str, str]:
    properties: dict[str, str] = {}
    if not path.exists():
        return properties

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        properties[key.strip()] = value.strip()
    return properties


class NBTReader:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.offset = 0

    def read(self, size: int) -> bytes:
        data = self.payload[self.offset : self.offset + size]
        if len(data) != size:
            raise ValueError("Unexpected end of NBT payload")
        self.offset += size
        return data

    def read_u8(self) -> int:
        return self.read(1)[0]

    def read_i8(self) -> int:
        return struct.unpack("<b", self.read(1))[0]

    def read_i16(self) -> int:
        return struct.unpack("<h", self.read(2))[0]

    def read_u16(self) -> int:
        return struct.unpack("<H", self.read(2))[0]

    def read_i32(self) -> int:
        return struct.unpack("<i", self.read(4))[0]

    def read_i64(self) -> int:
        return struct.unpack("<q", self.read(8))[0]

    def read_f32(self) -> float:
        return struct.unpack("<f", self.read(4))[0]

    def read_f64(self) -> float:
        return struct.unpack("<d", self.read(8))[0]

    def read_string(self) -> str:
        length = self.read_u16()
        return self.read(length).decode("utf-8", errors="replace")

    def read_tag_payload(self, tag_type: int) -> Any:
        if tag_type == 1:
            return self.read_i8()
        if tag_type == 2:
            return self.read_i16()
        if tag_type == 3:
            return self.read_i32()
        if tag_type == 4:
            return self.read_i64()
        if tag_type == 5:
            return self.read_f32()
        if tag_type == 6:
            return self.read_f64()
        if tag_type == 7:
            length = self.read_i32()
            return list(self.read(length))
        if tag_type == 8:
            return self.read_string()
        if tag_type == 9:
            element_type = self.read_u8()
            length = self.read_i32()
            return [self.read_tag_payload(element_type) for _ in range(length)]
        if tag_type == 10:
            compound: dict[str, Any] = {}
            while True:
                child_type = self.read_u8()
                if child_type == 0:
                    return compound
                child_name = self.read_string()
                compound[child_name] = self.read_tag_payload(child_type)
        if tag_type == 11:
            length = self.read_i32()
            return [self.read_i32() for _ in range(length)]
        if tag_type == 12:
            length = self.read_i32()
            return [self.read_i64() for _ in range(length)]
        raise ValueError(f"Unsupported NBT tag type: {tag_type}")


def read_level_dat(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    payload = path.read_bytes()
    if len(payload) >= 9 and payload[8] == 10:
        payload = payload[8:]

    reader = NBTReader(payload)
    tag_type = reader.read_u8()
    if tag_type != 10:
        raise ValueError("Expected root compound tag in level.dat")
    _root_name = reader.read_string()
    data = reader.read_tag_payload(tag_type)
    if not isinstance(data, dict):
        raise ValueError("Expected level.dat root to be a compound")
    return data


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        local_tz = datetime.now().astimezone().tzinfo
        return datetime.strptime(value, TIMESTAMP_FORMAT).replace(tzinfo=local_tz)
    except ValueError:
        return None


@dataclass
class ServerSnapshot:
    server_name: str
    level_name: str
    version: str
    gamemode: str
    difficulty: str
    max_players: int | None
    gameplay_port: str
    lan_port: str | None
    started_at: str | None
    uptime_seconds: int | None
    players_online: list[str]
    player_count: int
    world_ticks: int | None
    days_elapsed: int | None
    time_of_day: str | None
    last_updated: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "serverName": self.server_name,
            "levelName": self.level_name,
            "version": self.version,
            "gamemode": self.gamemode,
            "difficulty": self.difficulty,
            "maxPlayers": self.max_players,
            "gameplayPort": self.gameplay_port,
            "lanPort": self.lan_port,
            "startedAt": self.started_at,
            "uptimeSeconds": self.uptime_seconds,
            "playersOnline": self.players_online,
            "playerCount": self.player_count,
            "worldTicks": self.world_ticks,
            "daysElapsed": self.days_elapsed,
            "timeOfDay": self.time_of_day,
            "lastUpdated": self.last_updated,
        }


class MapDataCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, Any] | None = None
        self._loaded_at = 0.0
        self._refreshing = False

    def _refresh_worker(self, root_dir: Path, server_dir: Path) -> None:
        try:
            data = load_map_data(root_dir, server_dir)
        except Exception:
            with self._lock:
                self._refreshing = False
            raise

        with self._lock:
            self._data = data
            self._loaded_at = time.time()
            self._refreshing = False

    def _start_refresh(self, root_dir: Path, server_dir: Path) -> bool:
        with self._lock:
            if self._refreshing:
                return False
            self._refreshing = True

        threading.Thread(
            target=self._refresh_worker,
            args=(root_dir, server_dir),
            daemon=True,
            name="map-data-refresh",
        ).start()
        return True

    def start_refresh(self, root_dir: Path, server_dir: Path) -> bool:
        return self._start_refresh(root_dir, server_dir)

    def get(self, root_dir: Path, server_dir: Path, refresh: bool = False) -> dict[str, Any]:
        now = time.time()
        with self._lock:
            cached_data = self._data
            loaded_at = self._loaded_at

        if cached_data is None:
            data = load_map_data(root_dir, server_dir)
            with self._lock:
                self._data = data
                self._loaded_at = time.time()
            return data

        if refresh or now - loaded_at >= MAP_CACHE_TTL_SECONDS:
            self._start_refresh(root_dir, server_dir)
        return cached_data

    def get_public(self, root_dir: Path, server_dir: Path, refresh: bool = False) -> dict[str, Any]:
        return public_map_data(self.get(root_dir, server_dir, refresh=refresh))


class BedrockConsoleBridge:
    def __init__(self, server_dir: Path) -> None:
        self.command_fifo_path = server_dir / "bedrock-console.fifo"
        self.console_log_path = server_dir / "bedrock-console.log"
        self._lock = threading.Lock()

    def send_lines(self, commands: list[str]) -> None:
        if not self.command_fifo_path.exists():
            raise RuntimeError("Bedrock command bridge is not available")

        payload = "".join(f"{command.rstrip()}\n" for command in commands if command.strip())
        if not payload:
            return

        with self._lock, self.command_fifo_path.open("w", encoding="utf-8") as fifo:
            fifo.write(payload)
            fifo.flush()

    def query_target(self, selector: str, timeout_seconds: float = 2.0) -> list[dict[str, Any]]:
        if not self.command_fifo_path.exists():
            return []

        with self._lock:
            start_offset = self.console_log_path.stat().st_size if self.console_log_path.exists() else 0
            with self.command_fifo_path.open("w", encoding="utf-8") as fifo:
                fifo.write(f"querytarget {selector}\n")
                fifo.flush()

            offset = start_offset
            deadline = time.time() + timeout_seconds
            while time.time() < deadline:
                collected_payload: list[str] | None = None
                bracket_balance = 0
                for line, offset in self._read_new_lines(offset):
                    if "No targets matched selector" in line:
                        return []
                    if collected_payload is not None:
                        collected_payload.append(line)
                        bracket_balance += line.count("[") - line.count("]")
                        if bracket_balance <= 0:
                            try:
                                payload = json.loads("\n".join(collected_payload))
                            except json.JSONDecodeError:
                                collected_payload = None
                                bracket_balance = 0
                                continue
                            if isinstance(payload, list):
                                return [entry for entry in payload if isinstance(entry, dict)]
                            collected_payload = None
                            bracket_balance = 0
                        continue

                    match = QUERYTARGET_HEADER_RE.search(line)
                    if not match:
                        continue

                    initial = (match.group(1) or "").strip()
                    if not initial:
                        collected_payload = []
                        bracket_balance = 0
                        continue

                    collected_payload = [initial]
                    bracket_balance = initial.count("[") - initial.count("]")
                    if bracket_balance <= 0:
                        try:
                            payload = json.loads(initial)
                        except json.JSONDecodeError:
                            collected_payload = None
                            bracket_balance = 0
                            continue
                        if isinstance(payload, list):
                            return [entry for entry in payload if isinstance(entry, dict)]
                        collected_payload = None
                        bracket_balance = 0
                time.sleep(0.05)
        return []

    def _read_new_lines(self, offset: int) -> list[tuple[str, int]]:
        if not self.console_log_path.exists():
            return []

        file_size = self.console_log_path.stat().st_size
        if file_size <= offset:
            return []

        with self.console_log_path.open("r", encoding="utf-8", errors="ignore") as handle:
            handle.seek(offset)
            chunk = handle.read()
            next_offset = handle.tell()

        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        return [(line, next_offset) for line in lines]


def detect_available_agent_clis() -> list[AvailableAgentCli]:
    detected: list[AvailableAgentCli] = []
    for key, label, candidates in (
        ("claude", "Claude Code", CLAUDE_CLI_PATHS),
        ("copilot", "GitHub Copilot CLI", COPILOT_CLI_PATHS),
        ("codex", "OpenAI Codex CLI", CODEX_CLI_PATHS),
    ):
        for candidate in candidates:
            resolved = shutil.which(candidate)
            if resolved and is_agent_cli_healthy(resolved):
                detected.append(AvailableAgentCli(key=key, label=label, path=resolved))
                break
    return detected


def choose_default_agent_cli() -> AvailableAgentCli | None:
    available = detect_available_agent_clis()
    if not available:
        return None
    preferred_order = {"claude": 0, "copilot": 1, "codex": 2}
    available.sort(key=lambda cli: preferred_order.get(cli.key, 99))
    return available[0]


def build_agent_prompt(
    request_text: str,
    snapshot: ServerSnapshot,
    live_players: list[dict[str, Any]],
    map_data: dict[str, Any],
) -> str:
    seed = map_data.get("seed")
    spawn = map_data.get("spawn")
    context = {
        "serverName": snapshot.server_name,
        "levelName": snapshot.level_name,
        "difficulty": snapshot.difficulty,
        "gamemode": snapshot.gamemode,
        "onlinePlayers": [player["name"] for player in live_players],
        "livePlayers": live_players,
        "mapSeed": str(seed) if seed is not None else None,
        "spawn": spawn,
        "chunkCount": map_data.get("chunkCount"),
        "predictedStructureCount": map_data.get("predictedStructureCount"),
    }
    return "\n".join(
        [
            "You generate Minecraft Bedrock Dedicated Server console command plans.",
            "Return a structured plan that uses only Bedrock console commands, never shell commands.",
            "Assume the operator wants commands that can be pasted directly into the Bedrock server console.",
            "Prefer short, reliable command sequences over clever or fragile ones.",
            "If the request is ambiguous, ask concise clarification questions instead of guessing.",
            "Do not include leading slash prefixes unless required by Bedrock; plain console commands are preferred.",
            "Do not propose commands that stop the server, alter admin permissions, ban/kick users, or manage whitelist state.",
            "When targeting a player, prefer exact quoted name selectors like @a[name=\"Player\"] when needed.",
            "",
            "Respond in the required JSON schema only.",
            "",
            f"Server context: {json.dumps(context, ensure_ascii=False)}",
            f"Operator request: {request_text.strip()}",
        ]
    )


def parse_claude_structured_output(stdout: str) -> dict[str, Any]:
    content = stdout.strip()
    if not content:
        raise ValueError("Claude returned no output")
    json_start = content.find("{")
    if json_start < 0:
        raise ValueError("Claude did not return JSON output")
    payload = json.loads(content[json_start:])
    structured = payload.get("structured_output")
    if not isinstance(structured, dict):
        raise ValueError("Claude response did not include structured output")
    return structured


def normalize_bedrock_commands(commands: list[str]) -> list[str]:
    normalized: list[str] = []
    for raw_command in commands:
        if not isinstance(raw_command, str):
            raise ValueError("Generated command list is invalid")
        command = raw_command.strip()
        if not command:
            continue
        if command.startswith("/"):
            command = command[1:].lstrip()
        if any(token in command for token in ("&&", "||", ";", "`", "$(", "\n", "\r")):
            raise ValueError(f"Unsafe command was generated: {command}")
        root = command.split(maxsplit=1)[0].lower()
        if root in FORBIDDEN_AGENT_COMMANDS:
            raise ValueError(f"Blocked server command was generated: {root}")
        nested_forbidden = re.search(
            r"(?:^|\s)run\s+(%s)\b" % "|".join(re.escape(item) for item in sorted(FORBIDDEN_AGENT_COMMANDS)),
            command,
            re.IGNORECASE,
        )
        if nested_forbidden:
            raise ValueError(f"Blocked nested server command was generated: {nested_forbidden.group(1).lower()}")
        normalized.append(command)
    if len(normalized) > 128:
        raise ValueError("Generated command plan is too large")
    return normalized


def run_claude_agent(cli_path: str, prompt: str, root_dir: Path) -> dict[str, Any]:
    process = subprocess.run(
        [
            cli_path,
            "-p",
            "--model",
            "glm-5-turbo",
            "--effort",
            "low",
            "--tools",
            "",
            "--output-format",
            "json",
            "--json-schema",
            json.dumps(AGENT_PLAN_SCHEMA, separators=(",", ":")),
            prompt,
        ],
        cwd=root_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    return parse_claude_structured_output(process.stdout)


def run_copilot_agent(cli_path: str, prompt: str, root_dir: Path) -> dict[str, Any]:
    process = subprocess.run(
        [
            cli_path,
            "-C",
            str(root_dir),
            "--allow-all-tools",
            "--no-custom-instructions",
            "--available-tools",
            "",
            "--output-format",
            "text",
            "-s",
            "-p",
            (
                prompt
                + "\n\nReturn JSON only with keys status, summary, reasoning, commands, warnings, questions."
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    content = process.stdout.strip()
    json_start = content.find("{")
    json_end = content.rfind("}")
    if json_start < 0 or json_end < json_start:
        raise ValueError("Copilot did not return JSON output")
    payload = json.loads(content[json_start : json_end + 1])
    if not isinstance(payload, dict):
        raise ValueError("Copilot output was not a JSON object")
    return payload


def generate_agent_plan(
    root_dir: Path,
    request_text: str,
    snapshot: ServerSnapshot,
    live_players: list[dict[str, Any]],
    map_data: dict[str, Any],
    selected_backend: str | None = None,
) -> AgentPlan:
    available = detect_available_agent_clis()
    if not available:
        raise RuntimeError("No local AI CLI is available")

    selected: AvailableAgentCli | None = None
    if selected_backend:
        selected = next((entry for entry in available if entry.key == selected_backend), None)
        if selected is None:
            raise ValueError(f"Requested AI backend is not available: {selected_backend}")
    else:
        selected = choose_default_agent_cli()
    if selected is None:
        raise RuntimeError("No local AI CLI is available")

    prompt = build_agent_prompt(request_text, snapshot, live_players, map_data)
    if selected.key == "claude":
        payload = run_claude_agent(selected.path, prompt, root_dir)
    elif selected.key == "copilot":
        payload = run_copilot_agent(selected.path, prompt, root_dir)
    else:
        raise RuntimeError(f"The detected AI backend is not yet supported for automation: {selected.label}")

    commands = normalize_bedrock_commands(list(payload.get("commands", [])))
    status = str(payload.get("status", "unsupported"))
    if status == "ready" and not commands:
        status = "unsupported"
    created_at = datetime.now().astimezone().isoformat()
    return AgentPlan(
        id=f"plan-{uuid4()}",
        backend=selected.key,
        requested_by=request_text.strip(),
        status=status,
        summary=str(payload.get("summary", "")).strip(),
        reasoning=str(payload.get("reasoning", "")).strip(),
        commands=commands,
        warnings=[str(item).strip() for item in payload.get("warnings", []) if str(item).strip()],
        questions=[str(item).strip() for item in payload.get("questions", []) if str(item).strip()],
        created_at=created_at,
    )


def execute_agent_plan(bridge: BedrockConsoleBridge, plan: AgentPlan) -> None:
    if plan.status != "ready" or not plan.commands:
        raise ValueError("That plan is not ready to run")
    bridge.send_lines(plan.commands)


def format_time_of_day(world_ticks: int | None) -> str | None:
    if world_ticks is None:
        return None
    day_ticks = world_ticks % TICKS_PER_DAY
    hours = (day_ticks / 1000 + 6) % 24
    whole_hours = int(hours)
    minutes = int(round((hours - whole_hours) * 60)) % 60
    return f"{whole_hours:02d}:{minutes:02d}"


def summarize_status(root_dir: Path, server_dir: Path) -> ServerSnapshot:
    properties = read_properties(server_dir / "server.properties")
    console_log_path = server_dir / "bedrock-console.log"
    file_log_path = server_dir / "bedrock_server.log"
    log_path = console_log_path if console_log_path.exists() else file_log_path
    level_path = server_dir / "worlds" / properties.get("level-name", "Bedrock level") / "level.dat"

    version = "Unknown"
    level_name = properties.get("level-name", "Bedrock level")
    gamemode = properties.get("gamemode", "unknown").capitalize()
    difficulty = properties.get("difficulty", "unknown").upper()
    gameplay_port = properties.get("server-port", "19132")
    lan_port = "19132" if properties.get("enable-lan-visibility", "true").lower() == "true" else None
    server_name = properties.get("server-name", "Minecraft Bedrock Server")
    max_players = None
    if properties.get("max-players"):
        try:
            max_players = int(properties["max-players"])
        except ValueError:
            max_players = None

    players_online: set[str] = set()
    started_at: datetime | None = None
    if log_path.exists():
        for raw_line in log_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            start_match = START_RE.match(line)
            if start_match:
                players_online.clear()
                started_at = None
                continue
            started_match = STARTED_RE.match(line)
            if started_match:
                started_at = parse_timestamp(started_match.group("ts"))
                continue
            if match := VERSION_RE.match(line):
                version = match.group("value")
                continue
            if match := LEVEL_RE.match(line):
                level_name = match.group("value")
                continue
            if match := GAMEMODE_RE.match(line):
                gamemode = match.group("value")
                continue
            if match := DIFFICULTY_RE.match(line):
                difficulty = match.group("value")
                continue
            if match := GAMEPLAY_PORT_RE.match(line):
                gameplay_port = match.group("value")
                continue
            if match := LAN_PORT_RE.match(line):
                lan_port = match.group("value")
                continue
            if match := CONNECTED_RE.match(line):
                players_online.add(match.group("value"))
                continue
            if match := SPAWNED_RE.match(line):
                players_online.add(match.group("value"))
                continue
            if match := DISCONNECTED_RE.match(line):
                players_online.discard(match.group("value"))

    level_data = read_level_dat(level_path)
    world_ticks = level_data.get("Time")
    if not isinstance(world_ticks, int):
        world_ticks = None

    now = datetime.now().astimezone()
    uptime_seconds = int((now - started_at).total_seconds()) if started_at else None
    days_elapsed = world_ticks // TICKS_PER_DAY if world_ticks is not None else None

    return ServerSnapshot(
        server_name=server_name,
        level_name=level_name,
        version=version,
        gamemode=gamemode,
        difficulty=difficulty,
        max_players=max_players,
        gameplay_port=gameplay_port,
        lan_port=lan_port,
        started_at=started_at.isoformat() if started_at else None,
        uptime_seconds=uptime_seconds,
        players_online=sorted(players_online),
        player_count=len(players_online),
        world_ticks=world_ticks,
        days_elapsed=days_elapsed,
        time_of_day=format_time_of_day(world_ticks),
        last_updated=now.isoformat(),
    )


def build_world_paths(server_dir: Path) -> tuple[dict[str, str], Path, Path]:
    properties = read_properties(server_dir / "server.properties")
    level_name = properties.get("level-name", "Bedrock level")
    world_dir = server_dir / "worlds" / level_name
    level_path = world_dir / "level.dat"
    return properties, world_dir, level_path


def build_map_bounds(map_data: dict[str, Any], spawn: dict[str, int] | None) -> dict[str, int] | None:
    min_x: int | None = None
    max_x: int | None = None
    min_z: int | None = None
    max_z: int | None = None

    def include_point(x: int, z: int) -> None:
        nonlocal min_x, max_x, min_z, max_z
        min_x = x if min_x is None else min(min_x, x)
        max_x = x if max_x is None else max(max_x, x)
        min_z = z if min_z is None else min(min_z, z)
        max_z = z if max_z is None else max(max_z, z)

    for chunk in map_data.get("chunks", []):
        include_point(int(chunk["x"]) * 16, int(chunk["z"]) * 16)
        include_point(int(chunk["x"]) * 16 + 15, int(chunk["z"]) * 16 + 15)
    for village in map_data.get("villages", []):
        bounds = village.get("bounds", {})
        include_point(int(bounds.get("x0", village["x"])), int(bounds.get("z0", village["z"])))
        include_point(int(bounds.get("x1", village["x"])), int(bounds.get("z1", village["z"])))
    for player in map_data.get("savedPlayers", []):
        include_point(int(player["x"]), int(player["z"]))
    for rail in map_data.get("rails", []):
        include_point(int(rail["x"]), int(rail["z"]))
    for structure in map_data.get("predictedStructures", []):
        include_point(int(structure["x"]), int(structure["z"]))
    if spawn:
        include_point(int(spawn["x"]), int(spawn["z"]))

    if min_x is None or max_x is None or min_z is None or max_z is None:
        return None
    return {"minX": min_x, "maxX": max_x, "minZ": min_z, "maxZ": max_z}


def public_map_data(map_data: dict[str, Any]) -> dict[str, Any]:
    public_chunks = []
    for chunk in map_data.get("chunks", []):
        public_chunks.append(
            {
                "x": chunk["x"],
                "z": chunk["z"],
                "biome": chunk["biome"],
                "biomeId": chunk["biomeId"],
                "biomeCells": chunk.get("biomeCells", []),
                "avgHeight": chunk["avgHeight"],
            }
        )

    seed = map_data.get("seed")
    return {
        "generatedAt": map_data.get("generatedAt"),
        "seed": str(seed) if isinstance(seed, int) else seed,
        "spawn": map_data.get("spawn"),
        "levelName": map_data.get("levelName"),
        "serverName": map_data.get("serverName"),
        "chunks": public_chunks,
        "predictedStructures": map_data.get("predictedStructures", []),
        "predictedStructureVersion": map_data.get("predictedStructureVersion"),
        "rails": map_data.get("rails", []),
        "villages": map_data.get("villages", []),
        "savedPlayers": map_data.get("savedPlayers", []),
        "onlinePlayers": map_data.get("onlinePlayers", []),
        "bounds": map_data.get("bounds"),
        "chunkCount": map_data.get("chunkCount", 0),
        "predictedStructureCount": map_data.get("predictedStructureCount", 0),
        "railCount": map_data.get("railCount", 0),
        "villageCount": map_data.get("villageCount", 0),
        "savedPlayerCount": map_data.get("savedPlayerCount", 0),
    }


def build_height_lookup(chunks: list[dict[str, Any]]) -> dict[tuple[int, int], dict[str, Any]]:
    lookup: dict[tuple[int, int], dict[str, Any]] = {}
    for chunk in chunks:
        lookup[(int(chunk["x"]), int(chunk["z"]))] = chunk
    return lookup


def ensure_seed_finder(root_dir: Path) -> Path:
    tools_dir = root_dir / "tools"
    target_dir = tools_dir / SEED_FINDER_DIRNAME
    bedrock_entry = target_dir / "lib" / "cubiomes" / "bedrock.js"
    if bedrock_entry.exists():
        return target_dir

    tools_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "clone", "--depth", "1", SEED_FINDER_REPOSITORY, str(target_dir)],
        cwd=root_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    if not bedrock_entry.exists():
        raise FileNotFoundError(f"Seed finder clone is missing expected entrypoint: {bedrock_entry}")
    return target_dir


def predict_structures(root_dir: Path, seed: Any, bounds: dict[str, int] | None) -> list[dict[str, Any]]:
    if bounds is None or not isinstance(seed, int):
        return []
    ensure_seed_finder(root_dir)

    padding = 4096
    min_x = int(bounds["minX"]) - padding
    max_x = int(bounds["maxX"]) + padding
    min_z = int(bounds["minZ"]) - padding
    max_z = int(bounds["maxZ"]) + padding
    center_x = (min_x + max_x) // 2
    center_z = (min_z + max_z) // 2
    radius = max(max_x - min_x, max_z - min_z) // 2

    process = subprocess.run(
        [
            "node",
            str(root_dir / "predict_structures.js"),
            "--seed",
            str(seed & 0xFFFFFFFFFFFFFFFF),
            "--version",
            PREDICTED_STRUCTURE_VERSION,
            "--center-x",
            str(center_x),
            "--center-z",
            str(center_z),
            "--radius",
            str(radius),
            "--min-x",
            str(min_x),
            "--max-x",
            str(max_x),
            "--min-z",
            str(min_z),
            "--max-z",
            str(max_z),
        ],
        cwd=root_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(process.stdout)
    structures = payload.get("structures", [])
    return [entry for entry in structures if isinstance(entry, dict)]


def resolve_ground_target(map_data: dict[str, Any], x_value: float, z_value: float) -> dict[str, Any]:
    block_x = math.floor(x_value)
    block_z = math.floor(z_value)
    chunk_x = math.floor(block_x / 16)
    chunk_z = math.floor(block_z / 16)
    local_x = block_x - chunk_x * 16
    local_z = block_z - chunk_z * 16

    chunk_lookup = map_data.get("_chunkLookup", {})
    chunk = chunk_lookup.get((chunk_x, chunk_z))
    if not chunk:
        raise ValueError("That spot is outside the explored part of the map")

    biome_name = str(chunk.get("biome", ""))
    if "ocean" in biome_name or biome_name.endswith(":river") or "frozen_river" in biome_name:
        raise ValueError("That target looks like water; choose nearby dry land instead")

    heights = chunk.get("heights")
    if not isinstance(heights, list) or len(heights) < 256:
        raise ValueError("The server does not have enough terrain data for that point yet")

    height_index = local_x * 16 + local_z
    ground_y = int(round(float(heights[height_index])))
    safe_y = max(ground_y + 2, 2)

    return {
        "x": round(block_x + 0.5, 1),
        "y": safe_y,
        "z": round(block_z + 0.5, 1),
        "groundY": ground_y,
        "chunkX": chunk_x,
        "chunkZ": chunk_z,
        "biome": biome_name,
    }


def player_selector(player_name: str) -> str:
    escaped = player_name.replace("\\", "\\\\").replace('"', '\\"')
    return f'@a[name="{escaped}"]'


def live_players_from_query(entries: list[dict[str, Any]], player_name: str | None = None) -> list[dict[str, Any]]:
    players: list[dict[str, Any]] = []
    for entry in entries:
        name = player_name or entry.get("name")
        position = entry.get("position")
        if not isinstance(name, str) or not isinstance(position, dict):
            continue
        if not all(axis in position for axis in ("x", "y", "z")):
            continue

        players.append(
            {
                "name": name,
                "x": float(position["x"]),
                "y": float(position["y"]),
                "z": float(position["z"]),
                "id": str(entry.get("id", "")),
                "yRot": float(entry.get("yRot", 0.0)),
            }
        )

    players.sort(key=lambda player: player["name"].lower())
    return players


def get_live_players(bridge: BedrockConsoleBridge, player_names: list[str]) -> list[dict[str, Any]]:
    players: list[dict[str, Any]] = []
    for player_name in sorted(player_names, key=str.lower):
        players.extend(live_players_from_query(bridge.query_target(player_selector(player_name)), player_name=player_name))
    return players


def perform_safe_teleport(
    bridge: BedrockConsoleBridge,
    map_data: dict[str, Any],
    player_name: str,
    x_value: float,
    z_value: float,
) -> dict[str, Any]:
    selector = player_selector(player_name)
    if not bridge.query_target(selector):
        raise ValueError("That player is not currently online")

    target = resolve_ground_target(map_data, x_value, z_value)
    bridge.send_lines(
        [
            f"effect {selector} slow_falling 15 0 true",
            f"effect {selector} resistance 15 4 true",
            f"execute as {selector} in overworld run tp @s {target['x']} {target['y']} {target['z']}",
        ]
    )
    return target


def load_map_data(root_dir: Path, server_dir: Path) -> dict[str, Any]:
    properties, world_dir, level_path = build_world_paths(server_dir)
    world_db_path = world_dir / "db"
    level_data = read_level_dat(level_path)
    snapshot = summarize_status(root_dir, server_dir)

    process = subprocess.run(
        ["node", str(root_dir / "map_data.js"), "--world-db", str(world_db_path)],
        cwd=root_dir,
        check=True,
        capture_output=True,
        text=True,
    )
    map_data = json.loads(process.stdout)

    spawn = None
    if all(isinstance(level_data.get(key), int) for key in ("SpawnX", "SpawnY", "SpawnZ")):
        spawn = {
            "x": int(level_data["SpawnX"]),
            "y": int(level_data["SpawnY"]),
            "z": int(level_data["SpawnZ"]),
        }

    result = {
        "generatedAt": map_data.get("generatedAt", datetime.now().astimezone().isoformat()),
        "seed": level_data.get("RandomSeed"),
        "spawn": spawn,
        "levelName": properties.get("level-name", "Bedrock level"),
        "serverName": properties.get("server-name", "Minecraft Bedrock Server"),
        "chunks": map_data.get("chunks", []),
        "rails": map_data.get("rails", []),
        "villages": map_data.get("villages", []),
        "savedPlayers": map_data.get("savedPlayers", []),
        "onlinePlayers": snapshot.players_online,
    }
    result["bounds"] = build_map_bounds(result, spawn)
    result["predictedStructures"] = predict_structures(root_dir, result["seed"], result["bounds"])
    result["predictedStructureVersion"] = PREDICTED_STRUCTURE_VERSION
    result["chunkCount"] = len(result["chunks"])
    result["predictedStructureCount"] = len(result["predictedStructures"])
    result["railCount"] = len(result["rails"])
    result["villageCount"] = len(result["villages"])
    result["savedPlayerCount"] = len(result["savedPlayers"])
    result["_chunkLookup"] = build_height_lookup(result["chunks"])
    result["bounds"] = build_map_bounds(result, spawn)
    return result


def format_duration(total_seconds: int | None) -> str:
    if total_seconds is None:
        return "Waiting for server start"
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"
