// Seeded demo project so judges see results without typing anything.
// IDs were resolved via /search during the 2026-10-06 spike (spike/out/search_*.json).

import type { CreativePackage, PackageEntity } from "./tasteframe";

export const DEMO_PROJECT = {
  title: "Static Bloom",
  logline: "A low-budget, A24-style horror short about grief spreading through a commune of young artists.",
  goal: "Move closer to the Gen Z streetwear audience without losing the arthouse horror core.",
};

export const PACKAGE_A: CreativePackage = {
  id: "demo-a",
  label: "Package A — Arthouse core",
  entities: [
    { id: "17C8BCEF-2FF2-4A23-8F51-6C8CB9CD8114", name: "Hereditary", type: "movie", slot: "film_ref" },
    { id: "B6D76FFA-A387-4B93-B56A-50575C698643", name: "Midsommar", type: "movie", slot: "film_ref_2" },
    { id: "16B70494-1B07-47E4-A318-D89DA4A50DAE", name: "Florence Pugh", type: "person", slot: "cast" },
    { id: "0795B56A-783E-4F4F-A268-98453C535C72", name: "Mica Levi", type: "artist", slot: "music" },
    { id: "C90E3920-BF05-4537-903F-085BFE2E41AC", name: "Acne Studios", type: "brand", slot: "brand" },
  ],
};

export const DEMO_SWAP: PackageEntity = {
  id: "E303B31F-E9F3-4C48-927F-F7D61728B0E8",
  name: "Jenna Ortega",
  type: "person",
  slot: "cast",
};

export const TARGET_AUDIENCE = {
  label: "Gen Z streetwear",
  seeds: [
    { id: "7161ADA0-8DC8-471E-A4A8-61EE15578400", name: "Supreme", type: "brand" },
    { id: "92384FD1-363D-4423-926C-EAF478CE079B", name: "Stüssy", type: "brand" },
    { id: "7C9617C7-1FA1-4F83-8FDE-2EC2148339C3", name: "PinkPantheress", type: "artist" },
  ],
};
