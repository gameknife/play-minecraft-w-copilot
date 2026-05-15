# AGENTS instructions for this repository

This repository is operated as a **live Minecraft Bedrock server workspace**.

## Session startup trigger

Do **not** auto-start the Bedrock server or web dashboard when a new session begins.

Use the simple trigger phrase `启动mcsvr` as the default startup command.

When the user says `启动mcsvr`, immediately execute the full startup workflow below. Treat equivalent requests such as "start mcsvr", "start the Bedrock server", or "start the dashboard" the same way.

When startup is explicitly triggered, use this workflow:

1. Read `COPILOT-MINECRAFT.md` for the current server/dashboard details.
2. From the repository root `/home/gameknife/mcsvr`, start `./start-bedrock.sh`.
3. Start it in an **interactive async shell session**, not with `nohup`, not as a detached daemon, and not as a one-off blocking command.
4. Keep that same shell session alive for the rest of the conversation so future Minecraft admin commands can be sent into the Bedrock console.
5. Wait until the Bedrock server reports `Server started.` before treating the server as ready.

## Required runtime behavior

`./start-bedrock.sh` is the standard entrypoint and should be treated as the source of truth.

Starting it should bring up both:

- the interactive Bedrock dedicated server console
- the local web status server on port `60120`
- the main dashboard at `http://<host>:60120`
- the map page at `http://<host>:60120/map`

Do not replace this flow with custom launch commands unless the standard launcher is broken and you have first inspected why.

## How to operate during the session

After startup, the agent should assume the user may want help **operating the live server**:

- accept natural-language requests about Minecraft server administration or in-game actions
- translate those requests into safe Bedrock console commands when appropriate
- send those commands into the **same interactive shell session** that is running the server
- keep the web server available so the user can inspect status and map pages while the session is active

Unless the user explicitly asks to stop the server, keep it running for the whole session.

## Safety and handling notes

- Prefer Bedrock console commands and existing project tooling over ad-hoc scripts.
- Do not start the server in a detached background process if the session is expected to continue operating it.
- If the launcher or dashboard fails, inspect logs and fix the issue instead of silently skipping startup.
- When the user asks for game-affecting actions, explain the intended action briefly and then execute through the live server console.

## Spec workflow trigger

When the user says `启动交互式工作流`, follow this loop:

1. Re-read `TODO.md`.
2. Execute the next actionable task only.
3. When a task is done, update only its completion state in `TODO.md`.
4. If no actionable task remains, run a single 600-second wait command and then re-read `TODO.md`.

Constraints:

- `TODO.md` can change at any time, so always re-read it before each step.
- Do not execute confirmation or pending-review items.
- During the 600-second wait command, do not think or plan.
- Exit this workflow only when the milestone state in `TODO.md` becomes `已完成`.
- Do not edit `TODO.md` except for task completion state.
- Do not create automation or scheduled jobs for this workflow.
