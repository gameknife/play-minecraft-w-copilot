#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { LevelDB } from "@8crafter/leveldb-zlib";
import {
  chunkBlockIndexToOffset,
  entryContentTypeToFormatMap,
  getBiomeTypeFromID,
  getChunkKeyIndices,
  getKeysOfTypes,
  readData3dValue,
} from "mcbe-leveldb";
import * as nbt from "prismarine-nbt";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    args.set(token.slice(2), argv[index + 1]);
    index += 1;
  }
  return args;
}

function copyDbSnapshot(sourceDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcsvr-db-"));
  for (const name of fs.readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, name);
    if (fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, path.join(tempDir, name));
    }
  }
  return tempDir;
}

function averageHeight(heightMap) {
  let total = 0;
  let count = 0;
  for (const row of heightMap) {
    for (const value of row) {
      total += value;
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function dominantBiomeId(biomes) {
  const counts = new Map();
  const preferredLayer = getPreferredBiomeLayer(biomes);
  if (!preferredLayer) {
    return 1;
  }

  const palette = Array.isArray(preferredLayer.palette) ? preferredLayer.palette : [];
  const values = Array.isArray(preferredLayer.values) ? preferredLayer.values : [];
  for (const paletteIndex of values) {
    const biomeId = palette[paletteIndex];
    if (typeof biomeId !== "number") {
      continue;
    }
    counts.set(biomeId, (counts.get(biomeId) ?? 0) + 1);
  }

  let selectedId = 1;
  let selectedCount = -1;
  for (const [biomeId, count] of counts.entries()) {
    if (count > selectedCount) {
      selectedId = biomeId;
      selectedCount = count;
    }
  }
  return selectedId;
}

function getPreferredBiomeLayer(biomes) {
  return biomes.find((biomeLayer) => Array.isArray(biomeLayer.palette) && biomeLayer.palette.length > 0) ?? biomes[0];
}

function biomeTypeFromIdSafe(biomeId) {
  try {
    return getBiomeTypeFromID(biomeId);
  } catch {
    return "minecraft:plains";
  }
}

function buildBiomeCells(biomes) {
  const preferredLayer = getPreferredBiomeLayer(biomes);
  if (!preferredLayer) {
    return [];
  }

  const palette = Array.isArray(preferredLayer.palette) ? preferredLayer.palette : [];
  const values = Array.isArray(preferredLayer.values) ? preferredLayer.values : [];
  if (!palette.length || !values.length) {
    return [];
  }

  const quadrants = [
    { offsetX: 0, offsetZ: 0, minX: 0, maxX: 7, minZ: 0, maxZ: 7 },
    { offsetX: 8, offsetZ: 0, minX: 8, maxX: 15, minZ: 0, maxZ: 7 },
    { offsetX: 0, offsetZ: 8, minX: 0, maxX: 7, minZ: 8, maxZ: 15 },
    { offsetX: 8, offsetZ: 8, minX: 8, maxX: 15, minZ: 8, maxZ: 15 },
  ];

  return quadrants.map((quadrant) => {
    const counts = new Map();
    for (let x = quadrant.minX; x <= quadrant.maxX; x += 1) {
      for (let z = quadrant.minZ; z <= quadrant.maxZ; z += 1) {
        for (let y = 0; y < 16; y += 1) {
          const paletteIndex = values[(x << 8) | (y << 4) | z];
          const biomeId = palette[paletteIndex];
          if (typeof biomeId !== "number") continue;
          counts.set(biomeId, (counts.get(biomeId) ?? 0) + 1);
        }
      }
    }

    let selectedId = 1;
    let selectedCount = -1;
    for (const [biomeId, count] of counts.entries()) {
      if (count > selectedCount) {
        selectedId = biomeId;
        selectedCount = count;
      }
    }

    return {
      offsetX: quadrant.offsetX,
      offsetZ: quadrant.offsetZ,
      biomeId: selectedId,
      biome: biomeTypeFromIdSafe(selectedId),
    };
  });
}

async function simplifyNbt(buffer) {
  return nbt.simplify((await nbt.parse(buffer)).parsed);
}

function dimensionFromNumericId(value) {
  if (value === 1) {
    return "nether";
  }
  if (value === 2) {
    return "the_end";
  }
  return "overworld";
}

function isRailBlockName(name) {
  const normalized = String(name || "").toLowerCase();
  return normalized === "minecraft:rail" || normalized.endsWith("_rail");
}

async function loadMapData(worldDbPath) {
  const snapshotPath = copyDbSnapshot(worldDbPath);
  const db = new LevelDB(snapshotPath, { createIfMissing: false });

  try {
    await db.open();
    const groups = await getKeysOfTypes(db, ["Data3D", "VillageInfo", "Player", "SubChunkPrefix"]);

    const chunks = [];
    for (const key of groups.Data3D) {
      const indices = getChunkKeyIndices(key);
      if (indices.dimension !== "overworld") {
        continue;
      }

      const raw = await db.get(key);
      if (!raw) {
        continue;
      }
      let parsed = null;
      try {
        parsed = readData3dValue(raw);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        continue;
      }

      const biomeId = dominantBiomeId(parsed.biomes);
      const biome = biomeTypeFromIdSafe(biomeId);
      const biomeCells = buildBiomeCells(parsed.biomes);

      chunks.push({
        x: indices.x,
        z: indices.z,
        biome,
        biomeId,
        biomeCells,
        avgHeight: Number(averageHeight(parsed.heightMap).toFixed(2)),
        heights: parsed.heightMap.flat(),
      });
    }

    const villages = [];
    for (const key of groups.VillageInfo) {
      const raw = await db.get(key);
      if (!raw) {
        continue;
      }

      const parsed = await simplifyNbt(raw);
      const x0 = Number(parsed.X0 ?? 0);
      const x1 = Number(parsed.X1 ?? x0);
      const y0 = Number(parsed.Y0 ?? 0);
      const y1 = Number(parsed.Y1 ?? y0);
      const z0 = Number(parsed.Z0 ?? 0);
      const z1 = Number(parsed.Z1 ?? z0);
      villages.push({
        id: key.toString().replace(/^VILLAGE_Overworld_/, "").replace(/_INFO$/, ""),
        x: Math.round((x0 + x1) / 2),
        y: Math.round((y0 + y1) / 2),
        z: Math.round((z0 + z1) / 2),
        bounds: { x0, x1, y0, y1, z0, z1 },
      });
    }

    const railColumns = new Map();
    for (const key of groups.SubChunkPrefix) {
      const indices = getChunkKeyIndices(key);
      if (indices.dimension !== "overworld") {
        continue;
      }

      const raw = await db.get(key);
      if (!raw) {
        continue;
      }

      let parsed = null;
      try {
        parsed = await entryContentTypeToFormatMap.SubChunkPrefix.parse(raw);
      } catch {
        parsed = null;
      }
      if (!parsed) {
        continue;
      }

      const layers = parsed?.value?.layers?.value?.value;
      if (!Array.isArray(layers) || !layers.length) {
        continue;
      }

      const subChunkIndex = Number(parsed?.value?.subChunkIndex?.value ?? indices.subChunkIndex ?? 0);
      for (const layer of layers) {
        const paletteEntries = Object.values(layer?.palette?.value ?? {});
        if (!paletteEntries.length) {
          continue;
        }

        const railPaletteIndices = new Set();
        for (const [paletteIndex, paletteEntry] of paletteEntries.entries()) {
          const blockName = paletteEntry?.value?.name?.value;
          if (isRailBlockName(blockName)) {
            railPaletteIndices.add(paletteIndex);
          }
        }
        if (!railPaletteIndices.size) {
          continue;
        }

        const blockIndices = layer?.block_indices?.value?.value;
        if (!Array.isArray(blockIndices) || !blockIndices.length) {
          continue;
        }

        for (let blockIndex = 0; blockIndex < blockIndices.length; blockIndex += 1) {
          if (!railPaletteIndices.has(blockIndices[blockIndex])) {
            continue;
          }

          const offset = chunkBlockIndexToOffset(blockIndex);
          const worldX = indices.x * 16 + offset.x;
          const worldZ = indices.z * 16 + offset.z;
          const worldY = subChunkIndex * 16 + offset.y;
          const columnKey = `${worldX},${worldZ}`;
          const existing = railColumns.get(columnKey);
          if (!existing || worldY > existing.y) {
            railColumns.set(columnKey, { x: worldX, y: worldY, z: worldZ });
          }
        }
      }
    }

    const savedPlayers = [];
    for (const [index, key] of groups.Player.entries()) {
      const raw = await db.get(key);
      if (!raw) {
        continue;
      }

      const parsed = await simplifyNbt(raw);
      const pos = Array.isArray(parsed.Pos) ? parsed.Pos : null;
      if (!pos || pos.length < 3) {
        continue;
      }

      const id = key.toString().replace(/^player_server_/, "");
      savedPlayers.push({
        id,
        label: `Saved player ${index + 1}`,
        key: key.toString(),
        x: Number(pos[0].toFixed(2)),
        y: Number(pos[1].toFixed(2)),
        z: Number(pos[2].toFixed(2)),
        dimension: dimensionFromNumericId(Number(parsed.DimensionId ?? 0)),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      chunks,
      rails: Array.from(railColumns.values())
        .sort((left, right) => left.z - right.z || left.x - right.x)
        .map(({ x, y, z }) => ({ x, y, z })),
      villages,
      savedPlayers,
    };
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(snapshotPath, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const worldDbPath = args.get("world-db");
  if (!worldDbPath) {
    console.error("Missing --world-db");
    process.exit(1);
  }

  const data = await loadMapData(path.resolve(worldDbPath));
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
