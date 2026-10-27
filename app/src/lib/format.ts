const TZ = "Asia/Kolkata";

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const fmtDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" });

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const hrs = (n: number) => `${Math.round(n * 100) / 100} h`;

export const readFileBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
