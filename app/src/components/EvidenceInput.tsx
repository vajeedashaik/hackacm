"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/client";
import { readFileBase64 } from "@/lib/format";
import type { UploadedFile } from "@/lib/store";

const TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX = 1_000_000;

/** Optional evidence picker (PNG, JPEG or PDF, up to 3 files of 1 MB). The server re-validates everything. */
export function EvidenceInput({ files, onChange }: { files: UploadedFile[]; onChange: (f: UploadedFile[]) => void }) {
  const t = useT();
  const id = useId();
  const [err, setErr] = useState("");

  async function pick(list: FileList | null) {
    setErr("");
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 3) { setErr(t("ev_max")); break; }
      if (!TYPES.includes(f.type)) { setErr(t("ev_type")); continue; }
      if (f.size > MAX) { setErr(t("ev_size")); continue; }
      try {
        next.push({ name: f.name, type: f.type, data: await readFileBase64(f) });
      } catch (e) {
        setErr((e as Error).message);
      }
    }
    onChange(next);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-semibold">{t("evidence_opt")}</label>
      <p className="text-sm text-muted" id={`${id}-h`}>{t("evidence_hint")}</p>
      <input id={id} type="file" accept={TYPES.join(",")} multiple aria-describedby={`${id}-h`}
        className="field" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="pill bg-[#efe7d4] text-ink">
              {f.name}{" "}
              <button type="button" aria-label={`${t("remove")} ${f.name}`} className="ml-1 font-bold"
                onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
