import { NextResponse } from "next/server";
import { extractChapters, extractTextForRange } from "@/lib/pdf";

export async function GET(
  req: Request,
  { params }: { params: { book: string } }
) {
  console.log(`API: Fetching chapter text for book: ${params.book}`);
  try {
    const url = new URL(req.url);
    const indexStr = url.searchParams.get("index");
    console.log(`API: Chapter index parameter: ${indexStr}`);
    if (!indexStr) return NextResponse.json({ error: "index required" }, { status: 400 });

    const idx = parseInt(indexStr, 10);
    console.log(`API: Parsed chapter index: ${idx}`);

    try {
      console.log(`API: Calling extractChapters to find chapter info`);
      const chapters = await extractChapters(params.book);
      console.log(`API: Found ${chapters.length} chapters`);

      const ch = chapters.find((c) => c.id === idx);
      if (!ch) {
        console.log(`API: Chapter with id ${idx} not found`);
        return NextResponse.json({ error: "chapter not found" }, { status: 404 });
      }
      console.log(`API: Found chapter: ${ch.title} (pages ${ch.startPage}-${ch.endPage})`);

      console.log(`API: Calling extractTextForRange for pages ${ch.startPage}-${ch.endPage}`);
      const text = await extractTextForRange(params.book, ch.startPage, ch.endPage);
      console.log(`API: Extracted ${text.length} characters of text`);
      return NextResponse.json({ chapter: ch, text });
    } catch (error) {
      console.error("Error extracting chapter text:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ 
        error: "Failed to extract chapter text", 
        details: errorMessage, 
        text: "" 
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in chapter API route:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: errorMessage, 
      text: "" 
    }, { status: 500 });
  }
}
