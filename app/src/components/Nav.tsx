"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFair, useT } from "@/lib/client";
import { INDUSTRIES, industryIds } from "@/lib/industries";

export function Nav() {
  const path = usePathname();
  const { industry, setIndustry, lang, setLang } = useFair();
  const t = useT();
  const links = [
    { href: "/employer", label: t("employer") },
    { href: "/worker", label: t("worker") },
    { href: "/simulation", label: t("sim") },
  ];
  return (
    <header className="border-b-2 border-line bg-surface sticky top-0 z-10">
      <nav aria-label="Primary" className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="pixel text-lg font-bold text-brand">FairShift</Link>
        <ul className="flex flex-wrap gap-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={path.startsWith(l.href) ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 font-semibold ${
                  path.startsWith(l.href) ? "bg-brand text-white" : "hover:bg-[#efe7d4]"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="industry">Industry</label>
          <select id="industry" className="field !w-auto" value={industry}
            onChange={(e) => setIndustry(e.target.value as typeof industry)}>
            {industryIds.map((i) => (
              <option key={i} value={i}>{INDUSTRIES[i].label[lang]}</option>
            ))}
          </select>
          <button className="btn" onClick={() => setLang(lang === "en" ? "ta" : "en")} aria-label={`${lang === "en" ? "தமிழ்" : "English"} - Switch language`}>
            <span lang={lang === "en" ? "ta" : "en"}>{lang === "en" ? "தமிழ்" : "English"}</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
