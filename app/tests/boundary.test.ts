import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

describe("privileged-credential boundary", () => {
  const files = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
  it("keeps src/server and service-role secrets out of client components", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/^\s*["']use client["']/m.test(src)) continue;
      expect(src, f).not.toMatch(/@\/server|\.\.\/server|SERVICE_ROLE|EMPLOYER_PIN/);
    }
  });
  it("never exposes a service-role key through a NEXT_PUBLIC_ variable", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });
  it("only the API route imports the server layer from the app directory", () => {
    const importers = files.filter((f) => f.startsWith(join("src", "app")) && /from ["']@\/server/.test(readFileSync(f, "utf8")));
    expect(importers.map((f) => f.replaceAll("\\", "/"))).toEqual(["src/app/api/v1/[...path]/route.ts"]);
  });
});
