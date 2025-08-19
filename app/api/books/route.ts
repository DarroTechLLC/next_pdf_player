import { NextResponse } from "next/server";
import { listBooks } from "@/lib/pdf";

export async function GET() {
  try {
    console.log("API: Fetching book list");
    const books = await listBooks();
    console.log(`API: Found ${books.length} books`);
    return NextResponse.json({ books });
  } catch (error) {
    console.error("Error listing books:", error);
    // Include more detailed error information in the response
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      books: [], 
      error: "Failed to list books", 
      details: errorMessage 
    }, { status: 500 });
  }
}
