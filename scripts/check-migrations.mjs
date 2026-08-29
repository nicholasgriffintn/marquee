import { readdirSync } from "node:fs";

const GRANDFATHERED = new Map([["0033", 3]]);

const byPrefix = new Map();

for (const file of readdirSync("migrations").filter((name) => name.endsWith(".sql"))) {
  const prefix = file.slice(0, file.indexOf("_"));

  byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
}

const problems = [];

const ordered = [...byPrefix].toSorted(([left], [right]) => left.localeCompare(right));

for (const [prefix, files] of ordered) {
  const allowed = GRANDFATHERED.get(prefix) ?? 1;

  if (files.length > allowed) {
    problems.push(
      `${prefix}: ${files.length} files share this prefix (at most ${allowed} allowed) — ${[...files].toSorted((left, right) => left.localeCompare(right)).join(", ")}`,
    );
  }
}

for (const [prefix, expected] of GRANDFATHERED) {
  const files = byPrefix.get(prefix) ?? [];

  if (files.length < expected) {
    problems.push(
      `${prefix}: expected ${expected} grandfathered files but found ${files.length}. Applied migrations are tracked by filename in d1_migrations, so renaming one makes wrangler re-run it. Remove the entry from GRANDFATHERED only if the migration was never applied anywhere.`,
    );
  }
}

if (problems.length > 0) {
  console.error("Migration filename check failed:\n");

  for (const problem of problems) {
    console.error(`  ${problem}`);
  }

  console.error(
    "\nEach migration needs its own prefix. wrangler applies them in filename order and records the filename, so a reused prefix makes ordering depend on the rest of the name.",
  );
  process.exit(1);
}

console.log(`Migration filenames OK (${byPrefix.size} prefixes).`);
