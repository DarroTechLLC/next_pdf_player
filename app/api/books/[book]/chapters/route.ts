import { NextResponse } from "next/server";
import { extractChapters } from "@/lib/pdf";

export async function GET(
  _req: Request,
  { params }: { params: { book: string } }
) {
  console.log(`API: Fetching chapters for book: ${params.book}`);
  try {
    console.log(`API: Calling extractChapters for ${params.book}`);
    const chapters = await extractChapters(params.book);
    console.log(`API: Found ${chapters.length} chapters`);
    return NextResponse.json({ chapters });
  } catch (error) {
    console.error("Error extracting chapters:", error);
    // Include more detailed error information in the response
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      chapters: [], 
      error: "Failed to extract chapters", 
      details: errorMessage 
    }, { status: 500 });
  }
}
