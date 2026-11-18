// Fills the service worker in the static export with the list of files that
// build actually produced, plus a build id derived from their contents.
// Runs after `next build` (see the "build" script in package.json).
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const outDir = resolve(process.cwd(), process.env.TODOAY_STATIC_DIR ?? "out");
const swPath = join(outDir, "sw.js");
const BUILD_ID_MARKER = '"__BUILD_ID__"';
const PRECACHE_MARKER = "/*__PRECACHE_PATHS__*/ []";
const EXCLUDED = new Set(["sw.js", ".nojekyll", "CNAME"]);

const listFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
};

// "tasks/index.html" is served (and requested) as "tasks/".
const toUrlPath = (filePath) => {
  const segments = filePath.split("/");
  if (segments[segments.length - 1] === "index.html") {
    segments[segments.length - 1] = "";
  }
  return segments.map(encodeURIComponent).join("/");
};

const files = (await listFiles(outDir))
  .map((fullPath) => relative(outDir, fullPath).split(sep).join("/"))
  .filter((filePath) => !EXCLUDED.has(filePath))
  .sort();

const hash = createHash("sha256");
for (const filePath of files) {
  hash.update(filePath);
  hash.update(await readFile(join(outDir, filePath)));
}

const template = await readFile(swPath, "utf8");
if (!template.includes(BUILD_ID_MARKER) || !template.includes(PRECACHE_MARKER)) {
  throw new Error(`${swPath} is missing its build placeholders; was it already generated?`);
}

hash.update(template);
const buildId = hash.digest("hex").slice(0, 16);
const precachePaths = files.map(toUrlPath);

await writeFile(
  swPath,
  template
    .replace(BUILD_ID_MARKER, JSON.stringify(buildId))
    .replace(PRECACHE_MARKER, JSON.stringify(precachePaths, null, 2)),
);

console.log(`Service worker ${buildId}: precaching ${precachePaths.length} files.`);
