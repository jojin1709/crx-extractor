import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { extractExtensionId, stripCrxHeader } from "@/lib/crx";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHROME_VERSIONS = [
  "131.0.6778.86",
  "128.0.6613.120",
  "120.0.6099.109",
  "114.0.5735.199",
  "99.0.4844.84",
  "32.0.1700.107"
];

async function downloadCrxBuffer(id: string): Promise<Buffer | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

  for (const version of CHROME_VERSIONS) {
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${version}&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": userAgent } });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 500) {
          return buf;
        }
      }
    } catch {
      // try next version
    }
  }

  // Edge store fallback
  const edgeUrl = `https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&prod=chromiumcrx&prodchannel=&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  try {
    const edgeRes = await fetch(edgeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0"
      }
    });
    if (edgeRes.ok) {
      const arrayBuf = await edgeRes.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > 500) {
        return buf;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

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
      { error: "Couldn't find a valid 32-character extension ID in that input." },
      { status: 400 }
    );
  }

  const crxBuffer = await downloadCrxBuffer(id);
  if (!crxBuffer) {
    return NextResponse.json(
      {
        error:
          "Google's update service returned 204/404 for this ID. Make sure the 32-character ID is correct and the extension is currently published on the Chrome Web Store."
      },
      { status: 404 }
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
      { error: "The downloaded package was not a valid archive. Double check the extension ID." },
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
