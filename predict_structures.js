#!/usr/bin/env node
import process from "node:process";

import { BedrockBiomeGenerator } from "./tools/minecraft-seed-finder/lib/cubiomes/bedrock.js";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args.set(token.slice(2), argv[index + 1]);
    index += 1;
  }
  return args;
}

const TYPE_MAP = new Map([
  ["village", { type: "village", label: "村庄" }],
  ["desert_pyramid", { type: "desert_temple", label: "沙漠神殿" }],
  ["jungle_temple", { type: "jungle_temple", label: "丛林神殿" }],
  ["witch_hut", { type: "witch_hut", label: "女巫小屋" }],
  ["igloo", { type: "igloo", label: "雪屋" }],
  ["monument", { type: "ocean_monument", label: "海底神殿" }],
  ["mansion", { type: "woodland_mansion", label: "林地府邸" }],
  ["outpost", { type: "pillager_outpost", label: "掠夺者前哨站" }],
]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = args.get("seed");
  const version = args.get("version") ?? "26.0";
  const centerX = Number(args.get("center-x") ?? "0");
  const centerZ = Number(args.get("center-z") ?? "0");
  const radius = Number(args.get("radius") ?? "0");
  const minX = Number(args.get("min-x") ?? "0");
  const maxX = Number(args.get("max-x") ?? "0");
  const minZ = Number(args.get("min-z") ?? "0");
  const maxZ = Number(args.get("max-z") ?? "0");

  if (!seed || !Number.isFinite(centerX) || !Number.isFinite(centerZ) || !Number.isFinite(radius)) {
    throw new Error("Missing or invalid predictor arguments");
  }

  const generator = new BedrockBiomeGenerator(seed, version);
  const structureKeys = [...TYPE_MAP.keys()];
  const structures = generator.getStructures({
    centerX,
    centerZ,
    range: radius,
    structureKeys,
  });

  const filtered = structures
    .map((entry) => {
      const mapped = TYPE_MAP.get(entry.key);
      if (!mapped) return null;
      return {
        type: mapped.type,
        label: mapped.label,
        x: entry.x,
        z: entry.z,
        biome: entry.biome ?? null,
        biomeConfirmed: Boolean(entry.biomeConfirmed),
        placementSource: entry.placementSource ?? null,
        status: entry.status ?? null,
      };
    })
    .filter(
      (entry) =>
        entry &&
        entry.x >= minX &&
        entry.x <= maxX &&
        entry.z >= minZ &&
        entry.z <= maxZ,
    );

  process.stdout.write(`${JSON.stringify({ version, structures: filtered })}\n`);
}

main();
