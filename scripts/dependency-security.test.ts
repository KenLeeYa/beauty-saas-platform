import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Linter, type ESLint } from "eslint";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js") as {
  getRootDirs(context: { cwd: string; settings: { next?: { rootDir?: string | unknown[] } } }): string[];
};
const fixture = mkdtempSync(join(tmpdir(), "beauty glob QA "));
for (const directory of ["app-one", "app-two", "other"]) mkdirSync(join(fixture, directory));
writeFileSync(join(fixture, "app-file.ts"), "// not a directory\n");
afterAll(() => {
  if (dirname(resolve(fixture)) !== resolve(tmpdir())) throw Error("Unexpected test cleanup path");
  rmSync(fixture, { recursive: true, force: true });
});
// Both relative and absolute glob results resolve to the same Next project roots.
const normalize = (values: string[]) => values.map(value => resolve(value).replaceAll("\\", "/").replace(/\/$/, "")).sort();
const expected = normalize([join(fixture, "app-one"), join(fixture, "app-two")]);

describe("braces-free development dependency graph", () => {
  it("has no braces, micromatch, shadcn CLI or patch-package in the root lockfile", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as { packages: Record<string, unknown> };
    expect(Object.keys(lock.packages).filter(path => /(?:^|\/)node_modules\/(braces|micromatch|shadcn|patch-package)$/.test(path))).toEqual([]);
    const replacement = pluginRequire("fast-glob/package.json") as { name: string; version: string };
    expect(replacement).toMatchObject({ name: "tinyglobby", version: "0.2.17" });
  });

  it("keeps the Next ESLint default root unchanged", () => {
    expect(getRootDirs({ cwd: fixture, settings: {} })).toEqual([fixture]);
  });

  it("resolves wildcard directories with spaces and excludes matching files", () => {
    expect(normalize(getRootDirs({ cwd: fixture, settings: { next: { rootDir: join(fixture, "app-*") } } }))).toEqual(expected);
  });

  it("supports brace alternatives and Windows separators in Next ESLint", () => {
    const rootDir = join(fixture, "{app-one,app-two}").replaceAll("/", "\\");
    expect(normalize(getRootDirs({ cwd: fixture, settings: { next: { rootDir } } }))).toEqual(expected);
  });

  it("supports root arrays, missing matches and non-string entries", () => {
    const rootDir = [join(fixture, "app-one"), join(fixture, "app-two"), join(fixture, "missing-*"), null];
    expect(normalize(getRootDirs({ cwd: fixture, settings: { next: { rootDir } } }))).toEqual(expected);
  });

  it("handles the former deep-pattern attack without recursion exhaustion", () => {
    const entry = pluginRequire.resolve("fast-glob");
    // A child timeout bounds failures even if a future glob engine blocks synchronously.
    const script = `const {globSync}=require(${JSON.stringify(entry)});
      for (const [a,b] of [['{','}'],['(',')']]) {
        try { globSync(a.repeat(4000)+'x,y'+b.repeat(4000), {cwd:${JSON.stringify(fixture)},onlyDirectories:true}); }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      }`;
    expect(() => execFileSync(process.execPath, ["--stack-size=512", "-e", script], { timeout: 5000, stdio: "pipe" })).not.toThrow();
  });

  it("still reports real Next lint violations when the replacement returns relative roots", () => {
    const pages = join(fixture, "app-one", "pages");
    mkdirSync(pages);
    writeFileSync(join(pages, "account.tsx"), "export default function Account() { return null; }\n");
    const nextPlugin = require("@next/eslint-plugin-next") as ESLint.Plugin;
    const config: Linter.Config = {
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { "@next/next": nextPlugin },
      settings: { next: { rootDir: join(fixture, "app-*") } },
      rules: { "@next/next/no-html-link-for-pages": "error" },
    };
    const linter = new Linter();
    expect(linter.verify('const link = <a href="/account/">Account</a>', config)).toEqual([
      expect.objectContaining({ ruleId: "@next/next/no-html-link-for-pages", severity: 2 }),
    ]);
    expect(linter.verify('const link = <a href="https://example.com">External</a>', config)).toEqual([]);
  });

  it("keeps the two dialog state variants without importing generator CSS", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).not.toContain('"shadcn/tailwind.css"');
    expect(css).toContain('@custom-variant data-open (&:where([data-state="open"], [data-open]:not([data-open="false"])));');
    expect(css).toContain('@custom-variant data-closed (&:where([data-state="closed"], [data-closed]:not([data-closed="false"])));');
  });
});
