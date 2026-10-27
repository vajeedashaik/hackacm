import { handleApi } from "@/server/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };
const run = async (req: Request, { params }: Ctx) => handleApi(req, (await params).path);

export const GET = run;
export const POST = run;
export const PATCH = run;
