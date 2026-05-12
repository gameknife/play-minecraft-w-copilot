# Bedrock server workflow for Copilot CLI

This workspace is set up so a new Copilot CLI session can manage the Minecraft Bedrock server from `/home/gameknife/mcsvr`.

## Layout

- `servers/bedrock-1.26.20.5/`: active Linux Bedrock server files, world data, config, logs
- `servers/current`: symlink to the active server version
- `archives/`: downloaded Bedrock server zip files
- `start-bedrock.sh`: stable launcher from the workspace root

## Start the server interactively

From `/home/gameknife/mcsvr`, start the server with the root launcher so Copilot can keep an interactive console session open:

```bash
./start-bedrock.sh
```

In Copilot CLI terms, this should be started as an async shell session from the workspace root. Keep that shell alive and send future console commands into the same shell.

Suggested pattern for a new session:

1. Read this file.
2. Start `./start-bedrock.sh` in an interactive shell session.
3. Wait for `Server started.`
4. Use the same shell session to send admin commands.

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
- Common signals:
  - `Player connected: <name>`
  - `Player Spawned: <name>`
  - `Player disconnected: <name>`

## Upgrading later

1. Download the new Linux Bedrock zip into `archives/`.
2. Extract it into `servers/bedrock-<new-version>/`.
3. Copy forward the needed world/config files from the old version directory.
4. Update `servers/current` to point at the new version directory.
5. Start the server again with `./start-bedrock.sh`.

## Notes

- This workspace is Linux-only now; the Windows executable was removed.
- If a session needs to help in-game, keep the server running in a writable interactive shell instead of `nohup` so console commands can be sent later.
