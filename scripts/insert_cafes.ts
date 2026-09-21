import { createRequire } from "node:module";
import path from "node:path";

const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const dotenv = projectRequire("dotenv") as { config: (options?: { path?: string }) => void };
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });
const { createClient } = projectRequire("@supabase/supabase-js") as {
  createClient: (url: string, key: string, options?: unknown) => any;
};

const DATA_URL = "http://linkdata.org/api/1/rdf1s7928i/OpenworksSCS/datapackage.json";
const SITE_ID = 399;

const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const categoryFor = (note: string) => /カフェ|cafe/i.test(note) ? "コミュニティカフェ" : "コミュニティスペース";
const slugFor = (sourceId: string, name: string) => {
  let hash = 5381;
  for (const byte of new TextEncoder().encode(`${sourceId}:${name}`)) hash = ((hash * 33) ^ byte) >>> 0;
  return `yokohama-community-${hash.toString(16).padStart(8, "0")}`;
};

const parseCsv = (text: string) => {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; }
      else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) { cells.push(cell); cell = ""; }
      else cell += c;
    }
    cells.push(cell);
    return cells;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((v, i) => [headers[i], v])));
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and service/anon key are required");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const packageResponse = await fetch(DATA_URL);
  if (!packageResponse.ok) throw new Error(`datapackage fetch failed: ${packageResponse.status}`);
  const dataPackage = await packageResponse.json() as { resources: Array<{ url: string }> };
  const csvResponse = await fetch(new URL(dataPackage.resources[0].url, DATA_URL));
  if (!csvResponse.ok) throw new Error(`CSV fetch failed: ${csvResponse.status}`);
  const rows = parseCsv(await csvResponse.text());

  const { data: existing, error: existingError } = await supabase.from("locapass_shops").select("name,address");
  if (existingError) throw existingError;
  const pairs = new Set((existing ?? []).map((row: any) => `${normalize(row.name)}\u0000${normalize(row.address)}`));
  const records = rows.flatMap((row: any) => {
    const name = normalize(row["名称"]); const address = normalize(row["住所"]);
    if (!name || !address) return [];
    const pair = `${name}\u0000${address}`;
    if (pairs.has(pair)) return [];
    pairs.add(pair);
    const note = normalize(row["備考"]);
    return [{ portal_id: SITE_ID, slug: slugFor(row.OpenworksSCS, name), name, address,
      lat: Number(row.lat), lng: Number(row.long), category: categoryFor(note),
      tel: normalize(row["電話番号"]) || null, url: normalize(row["Webサイト"]) || null,
      description: note || null, status: "active" }];
  });
  if (records.length) {
    const { error } = await supabase.from("locapass_shops").insert(records);
    if (error) throw error;
  }
  const { count, error: verifyError } = await supabase.from("locapass_shops").select("id", { count: "exact", head: true }).eq("portal_id", SITE_ID);
  if (verifyError) throw verifyError;
  console.log(JSON.stringify({ sourceRows: rows.length, inserted: records.length, skipped: rows.length - records.length, siteId: SITE_ID, verifiedSiteCount: count }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
