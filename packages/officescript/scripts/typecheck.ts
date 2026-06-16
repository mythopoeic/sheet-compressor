/**
 * typecheck.ts — type-check the generated `.osts` artifacts with NO node libs.
 *
 * tsc only compiles `.ts`/`.tsx`, and the shippable + conformance scripts are
 * *scripts* (script-scope `main`, a `declare namespace ExcelScript` block) that
 * share a global scope — so they cannot be compiled together (duplicate
 * `main`). This tool copies each `.osts` into its own isolated temp dir as a
 * `.ts` file and runs `tsc` over it against a minimal, node-free config,
 * proving the bundle type-checks as plain ExcelScript. It also type-checks the
 * generator/test tsconfig (which DOES use node) separately.
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, "..");
const SRC = join(PKG_DIR, "src");
const BUILD = join(PKG_DIR, ".build");

const SCRIPT_OSTS = [
  "SheetCompressor.osts",
  "conformance.osts",
  "SheetCompressorInternal.generated.osts",
];

const SCRIPT_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    lib: ["ES2022"],
    types: [] as string[],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: true,
    noEmit: true,
  },
};

function run(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: "inherit" });
}

function main(): void {
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });

  let failed = false;

  // 1. Each .osts script, isolated (script scope — can't share globals).
  for (const osts of SCRIPT_OSTS) {
    const stem = osts.replace(/\.osts$/, "").replace(/\W/g, "_");
    const dir = join(BUILD, stem);
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(SRC, osts), join(dir, "script.ts"));
    // Office Scripts host globals that are neither node nor DOM. Declared here
    // (not in the shipped .osts) so the bundle type-checks with no node libs.
    writeFileSync(
      join(dir, "host-globals.d.ts"),
      "declare const console: { log(...data: unknown[]): void };\n",
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        { ...SCRIPT_TSCONFIG, include: ["script.ts", "host-globals.d.ts"] },
        null,
        2,
      ),
    );
    try {
      console.log(`typecheck: ${osts} (script scope, no node libs)`);
      run(`npx tsc -p tsconfig.json`, dir);
    } catch (e) {
      failed = true;
    }
  }

  // 2. The generator + test sources (these DO use node).
  try {
    console.log("typecheck: scripts/ + test/ (node tooling)");
    run("npx tsc -p tsconfig.json", PKG_DIR);
  } catch (e) {
    failed = true;
  }

  rmSync(BUILD, { recursive: true, force: true });

  if (failed) {
    console.error("typecheck FAILED");
    process.exit(1);
  }
  console.log("typecheck OK");
}

main();
