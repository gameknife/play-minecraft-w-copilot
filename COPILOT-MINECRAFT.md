# Bedrock server workflow for Copilot CLI

This workspace is set up so a new Copilot CLI session can manage the Minecraft Bedrock server from `/home/gameknife/mcsvr`.

## Layout

- `servers/bedrock-1.26.20.5/`: active Linux Bedrock server files, world data, config, logs
- `servers/current`: symlink to the active server version
- `archives/`: downloaded Bedrock server zip files
- `start-bedrock.sh`: stable launcher from the workspace root
- `status_server.py`: FastAPI launcher for the dashboard on port `60120`
- `bedrock_dashboard/`: backend package for dashboard services and HTTP API handling
- `webapp/`: dedicated frontend app that is built and served by the FastAPI backend
- `map_data.js`: local Bedrock world scanner used by the map page
- `package.json`: Node dependency manifest for the map scanner
- `requirements.txt`: backend Python dependencies for the dashboard virtual environment

## Start the server interactively

From `/home/gameknife/mcsvr`, start the server with the root launcher so Copilot can keep an interactive console session open:

```bash
./start-bedrock.sh
```

This launcher now starts **both**:

- the Bedrock dedicated server in the interactive foreground
- a FastAPI backend that serves the local dashboard and APIs on `http://<host>:60120`
- a built frontend app at `http://<host>:60120`
- a local world map page at `http://<host>:60120/map`

The launcher bootstraps missing dependencies automatically:

- creates `.venv/` and installs `requirements.txt` when needed
- installs root Node dependencies for the world scanner when needed
- installs `webapp/` frontend dependencies when needed
- rebuilds the frontend before starting the backend

In Copilot CLI terms, this should be started as an async shell session from the workspace root. Keep that shell alive and send future console commands into the same shell.

Suggested pattern for a new session:

1. Read this file.
2. Start `./start-bedrock.sh` in an interactive shell session.
3. Wait for `Server started.`
4. Open `http://<host>:60120` for the live status page.
5. Open `http://<host>:60120/map` for the live world map.
6. Use the same shell session to send admin commands.

## Commands already used successfully

Player XP:

```text
xp -100000L GameKnife
xp 30L GameKnife
```

Give and enchant a diamond sword:

```text
replaceitem entity GameKnife slot.weapon.mainhand 0 diamond_sword 1 0
enchant GameKnife sharpness 5
enchant GameKnife unbreaking 3
enchant GameKnife fire_aspect 2
enchant GameKnife looting 3
```

Stop the server cleanly:

```text
stop
```

## Checking activity

- Main log: `servers/current/bedrock_server.log`
- Live console log used by the dashboard: `servers/current/bedrock-console.log`
- Dashboard log: `servers/current/web-dashboard.log`
- Common signals:
  - `Player connected: <name>`
  - `Player Spawned: <name>`
  - `Player disconnected: <name>`

## Dashboard contents

The dashboard is designed in a Minecraft-site-inspired style and currently shows:

- server name and world name
- version, game mode, difficulty, and gameplay port
- live player count and player name list from the Bedrock log
- elapsed in-world days and current in-world time from `level.dat`
- current server uptime

## Map page contents

The map page is served from `/map` on the same port and currently shows:

- a zoomable and pannable explored-world view built from local Bedrock chunk data
- village positions read from `VILLAGE_Overworld_*_INFO` entries in the Bedrock world database
- saved player positions read from player records in the Bedrock world database
- selectable online-player capsules with unique colors
- live online-player markers from the Bedrock `querytarget` console command
- click-to-teleport flow with a preview step and confirmation dialog
- world seed, chunk count, and spawn position

Notes about map accuracy:

- village markers are authoritative for the current world because they come from the world database
- saved player positions are not guaranteed to be live tick-by-tick positions; they reflect the latest positions persisted by Bedrock
- live player markers come from console polling and only appear for players currently online
- teleport preview only allows destinations inside explored overworld chunks and rejects obvious water targets
- the map colors are original local rendering based on chunk biome and height data, not Chunkbase code or assets
- predicted unexplored structures now use a version-aware Bedrock generator profile pinned to `26.0`, instead of the older fixed `1.18` logic
- the structure predictor bootstraps its external `minecraft-seed-finder` source on demand into `tools/minecraft-seed-finder/`, so that repo code does not need to vendor that upstream tree

## Upgrading later

1. Download the new Linux Bedrock zip into `archives/`.
2. Extract it into `servers/bedrock-<new-version>/`.
3. Copy forward the needed world/config files from the old version directory.
4. Update `servers/current` to point at the new version directory.
5. Start the server again with `./start-bedrock.sh`.

## Notes

- This workspace is Linux-only now; the Windows executable was removed.
- If a session needs to help in-game, keep the server running in a writable interactive shell instead of `nohup` so console commands can be sent later.
- If a fresh clone is missing dependencies, `./start-bedrock.sh` now bootstraps them automatically.
