import { describe, expect, it } from "vitest";
import { GET } from "./route";

const get = (q: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://x/api/state?${q}`, { headers }));

describe("GET /api/state conditional requests", () => {
  it("returns an ETag, then a body-less 304 for the same viewer while data is unchanged", async () => {
    const first = await get("industry=construction");
    const tag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(tag).toBeTruthy();
    const again = await get("industry=construction", { "if-none-match": tag! });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(Number(again.headers.get("x-server-now"))).toBeGreaterThan(0);
  });

  it("does not let a worker view's tag validate a different industry or viewer", async () => {
    const tag = (await get("industry=construction")).headers.get("etag")!;
    const other = await get("industry=college", { "if-none-match": tag });
    expect(other.status).toBe(200);
    expect(other.headers.get("etag")).not.toBe(tag);
  });
});
