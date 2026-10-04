import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { extractExtensionId } from "@/lib/crx";

export const runtime = "nodejs";

async function handleMetaLookup(rawInput: string) {
  const id = extractExtensionId(rawInput || "");

  if (!id) {
    return NextResponse.json(
      { error: "Couldn't find a valid extension id in that input." },
      { status: 400 }
    );
  }

  const storeUrl = `https://chromewebstore.google.com/detail/${id}`;

  try {
    const res = await fetch(storeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" }
    });

    if (!res.ok) {
      // Try Firefox AMO API
      const amoRes = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/`);
      if (amoRes.ok) {
        const amoData = await amoRes.json();
        const name = typeof amoData.name === "object" ? amoData.name.en || Object.values(amoData.name)[0] : amoData.name;
        const icon = amoData.icon_url || null;
        const description = typeof amoData.summary === "object" ? amoData.summary.en || Object.values(amoData.summary)[0] : amoData.summary;
        return NextResponse.json({ id, name, icon, description, notFound: false });
      }
      return NextResponse.json({ id, name: id, icon: null, description: "Extension package", notFound: false });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const name =
      $('meta[itemprop="name"]').attr("content") ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().split("-")[0]?.trim() ||
      id;

    const icon =
      $('meta[itemprop="image"]').attr("content") ||
      $('meta[property="og:image"]').attr("content") ||
      null;

    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      null;

    return NextResponse.json({ id, name, icon, description, notFound: false });
  } catch {
    return NextResponse.json({ id, name: id, icon: null, description: "Extension package", notFound: false });
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q") || "";
  return handleMetaLookup(raw);
}

export async function POST(req: NextRequest) {
  let raw = "";
  try {
    const body = await req.json();
    raw = body.q || body.id || "";
  } catch {
    raw = "";
  }
  return handleMetaLookup(raw);
}
