import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { buildCrxDownloadUrl, extractExtensionId, stripCrxHeader } from "@/lib/crx";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { q?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = extractExtensionId(body.q ?? "");
  if (!id) {
    return NextResponse.json(
      { error: "Couldn't find a valid extension id in that input." },
      { status: 400 }
    );
  }

  const crxUrl = buildCrxDownloadUrl(id);

  let crxBuffer: Buffer;
  try {
    const res = await fetch(crxUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UnpackedBot/1.0)" }
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Google's update service returned ${res.status}. The extension id may be wrong, or the extension may no longer be published.` },
        { status: 502 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    crxBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Google's extension update service. Try again in a moment." },
      { status: 502 }
    );
  }

  if (crxBuffer.length < 16) {
    return NextResponse.json(
      { error: "Received an unexpectedly small file — this id likely doesn't correspond to a published extension." },
      { status: 502 }
    );
  }

  let zipBuffer: Buffer;
  try {
    zipBuffer = stripCrxHeader(crxBuffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse the .crx file." },
      { status: 500 }
    );
  }

  let outZip: Buffer;
  try {
    const zip = new AdmZip(zipBuffer);
    outZip = zip.toBuffer();
  } catch {
    return NextResponse.json(
      { error: "The downloaded package wasn't a valid archive. Double check the extension id." },
      { status: 500 }
    );
  }

  return new NextResponse(new Uint8Array(outZip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${id}-source.zip"`,
      "Content-Length": String(outZip.length)
    }
  });
}
