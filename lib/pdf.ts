import path from "node:path";
import fs from "node:fs/promises";

// Use legacy build for Node.js environment
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Configure PDF.js for Node environment
// Try to use a path-based approach for the worker
const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

// Use path.resolve to ensure we get an absolute path
export const PDF_DIR = path.resolve(process.cwd(), "public", "pdfs");

export async function listBooks(): Promise<string[]> {
  try {
    console.log(`Reading directory: ${PDF_DIR}`);

    // First check if the directory exists
    try {
      await fs.access(PDF_DIR);
    } catch (err) {
      console.error(`Directory ${PDF_DIR} does not exist or is not accessible`);
      // Create the directory if it doesn't exist
      await fs.mkdir(PDF_DIR, { recursive: true });
      return []; // Return empty array since we just created the directory
    }

    // Read all files in the directory
    const files = await fs.readdir(PDF_DIR);

    // Filter for PDF files
    const pdfFiles = [];
    for (const file of files) {
      try {
        const stat = await fs.stat(path.join(PDF_DIR, file));
        if (stat.isFile() && file.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(file);
        }
      } catch (err) {
        console.error(`Error checking file ${file}:`, err);
        // Continue with other files
      }
    }

    console.log(`Found ${pdfFiles.length} PDF files`);
    return pdfFiles;
  } catch (error) {
    console.error(`Error reading directory ${PDF_DIR}:`, error);
    throw error;
  }
}

type Chapter = { id: number; title: string; startPage: number; endPage: number };

const CHAPTER_PATTERNS = [
  /^\s*chapter\s+\d+\s*:/i,
  /^\s*chapter\s+\d+\s*[a-zA-Z]/i,
  /^\s*chapter\s+[ivxlcdm]+\s*:/i,
  /^\s*chapter\s+[ivxlcdm]+\s*[a-zA-Z]/i,
  /^\s*ch\.\s*\d+\s*:/i,
  /^\s*ch\.\s*\d+\s*[a-zA-Z]/i,
  /^\s*book\s+\d+\s*:/i,
  /^\s*book\s+\d+\s*[a-zA-Z]/i,
  /^\s*part\s+\d+\s*:/i,
  /^\s*part\s+\d+\s*[a-zA-Z]/i
];

function looksLikeChapterHeading(line: string): boolean {
  const s = line.trim();
  if (s.length === 0 || s.length > 80) return false;
  
  // Must start with "Chapter" or similar
  if (!/^(chapter|ch\.|book|part)\s+/i.test(s)) return false;
  
  // Must contain a number or roman numeral
  if (!/\d+|[ivxlcdm]+/i.test(s)) return false;
  
  // Must have some descriptive text after the number
  const parts = s.split(/\s+/);
  if (parts.length < 3) return false;
  
  // Check if there's meaningful text after the chapter identifier
  const meaningfulText = parts.slice(2).join(" ");
  if (meaningfulText.length < 3) return false;
  
  // Exclude appendix sections, rubrics, etc.
  if (/rubric|appendix|case study|promise cards/i.test(meaningfulText)) return false;
  
  return true;
}

function looksLikeAllCapsHeading(line: string): boolean {
  const s = line.trim();
  if (s.length === 0 || s.length > 60) return false;
  
  // Must be reasonably long to be a heading
  if (s.length < 10) return false;
  
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 5) return false; // Require more letters
  
  // Must be all caps
  if (s !== s.toUpperCase()) return false;
  
  // Must not be just repeated characters or very short words
  const words = s.split(/\s+/);
  if (words.length < 2) return false;
  
  // Check if it looks like a meaningful heading (not just random caps)
  const hasMeaningfulWords = words.some(word => word.length > 2);
  if (!hasMeaningfulWords) return false;
  
  // Exclude appendix sections, rubrics, etc.
  if (/rubric|appendix|case study|promise cards/i.test(s)) return false;
  
  return true;
}

export async function extractChapters(bookFileName: string): Promise<Chapter[]> {
  console.log(`Extracting chapters from ${bookFileName}`);
  const filePath = path.resolve(PDF_DIR, bookFileName);
  console.log(`Full path: ${filePath}`);

  try {
    // Check if file exists
    await fs.access(filePath);
    console.log(`File exists: ${filePath}`);
  } catch (err) {
    console.error(`File does not exist: ${filePath}`);
    throw new Error(`PDF file not found: ${bookFileName}`);
  }

  console.log(`Reading file: ${filePath}`);
  const buffer = await fs.readFile(filePath);
  console.log(`File size: ${buffer.length} bytes`);

  const data = new Uint8Array(buffer);
  console.log(`Creating PDF.js document`);
  const loadingTask = pdfjsLib.getDocument({ 
    data, 
    disableWorker: true
  });

  console.log(`Waiting for PDF to load`);
  const pdf = await loadingTask.promise;
  const numPages: number = pdf.numPages;
  console.log(`PDF loaded with ${numPages} pages`);

  type Hit = { page: number; title: string };
  const hits: Hit[] = [];

  // Scan first ~50 lines per page for heading candidates
  console.log(`Starting to scan ${numPages} pages for chapter headings`);
  for (let i = 1; i <= numPages; i++) {
    try {
      console.log(`Processing page ${i}/${numPages}`);
      const page = await pdf.getPage(i);
      console.log(`Getting text content for page ${i}`);
      const tc = await page.getTextContent();
      // Join into lines
      const items = tc.items as Array<{ str: string }>;
      const raw = items.map((it) => it.str).join("\n");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
      console.log(`Found ${lines.length} lines of text on page ${i}`);

      const found = lines.find((ln) => 
        CHAPTER_PATTERNS.some((re) => re.test(ln)) || 
        looksLikeChapterHeading(ln) || 
        looksLikeAllCapsHeading(ln)
      );
      if (found) {
        console.log(`Found chapter heading on page ${i}: "${found}"`);
        hits.push({ page: i, title: found.replace(/\s+/g, " ").trim() });
      }
    } catch (err) {
      console.error(`Error processing page ${i}:`, err);
      // Continue with next page
    }
  }
  console.log(`Finished scanning pages, found ${hits.length} potential chapter headings`);

  let chapters: Chapter[] = [];
  if (hits.length === 0) {
    chapters = [{ id: 1, title: "Full Document", startPage: 1, endPage: numPages }];
  } else {
    // Dedup similar headings and build ranges
    const uniq: Hit[] = [];
    for (let i = 0; i < hits.length; i++) {
      const current = hits[i];
      const prev = uniq[uniq.length - 1];
      
      // Skip if this is the same heading on a different page
      if (prev && current.title.toLowerCase() === prev.title.toLowerCase()) {
        continue;
      }
      
      // Skip if this is just a continuation of the same chapter
      if (prev && current.page - prev.page < 3) {
        continue;
      }
      
      uniq.push(current);
    }
    
    console.log(`After deduplication, found ${uniq.length} unique chapter headings`);
    
    // Build chapter ranges
    for (let i = 0; i < uniq.length; i++) {
      const start = uniq[i].page;
      const end = i + 1 < uniq.length ? uniq[i + 1].page - 1 : numPages;
      let title = uniq[i].title;
      
      // Normalize chapter titles
      if (/^\s*chapter\b/i.test(title)) {
        title = title.replace(/^\s*chapter\s*/i, "").replace(/\s+/g, " ").trim();
        title = `Chapter ${title}`;
      }
      
      chapters.push({ id: i + 1, title, startPage: start, endPage: end });
    }
    
    // Post-process: filter to only main numbered chapters (1-22) and merge duplicates
    const chapterMap = new Map<number, Chapter>();
    
    chapters.forEach(ch => {
      const chapterMatch = ch.title.match(/^Chapter\s+(\d+)/i);
      if (!chapterMatch) return;
      
      const chapterNum = parseInt(chapterMatch[1]);
      if (chapterNum < 1 || chapterNum > 22) return;
      
      // If we already have this chapter number, merge them
      if (chapterMap.has(chapterNum)) {
        const existing = chapterMap.get(chapterNum)!;
        // Use the longer title and merge the page ranges
        if (ch.title.length > existing.title.length) {
          existing.title = ch.title;
        }
        existing.endPage = Math.max(existing.endPage, ch.endPage);
      } else {
        chapterMap.set(chapterNum, { ...ch, id: chapterNum });
      }
    });
    
    if (chapterMap.size > 0) {
      console.log(`Filtered to ${chapterMap.size} main chapters (1-22)`);
      chapters = Array.from(chapterMap.values()).sort((a, b) => a.id - b.id);
      
      // Refine chapter boundaries to exclude appendix content
      for (let i = 0; i < chapters.length; i++) {
        const current = chapters[i];
        const next = chapters[i + 1];
        
        // If this chapter spans too many pages, it might include appendix content
        if (current.endPage - current.startPage > 100) {
          // Look for the next chapter start to get a better boundary
          if (next) {
            current.endPage = next.startPage - 1;
          } else {
            // For the last chapter, limit it to a reasonable size
            current.endPage = Math.min(current.endPage, current.startPage + 50);
          }
        }
      }
    }
  }

  return chapters;
}

export async function extractTextForRange(bookFileName: string, startPage: number, endPage: number): Promise<string> {
  console.log(`Extracting text from ${bookFileName} pages ${startPage}-${endPage}`);
  const filePath = path.resolve(PDF_DIR, bookFileName);
  console.log(`Full path: ${filePath}`);

  try {
    // Check if file exists
    await fs.access(filePath);
    console.log(`File exists: ${filePath}`);
  } catch (err) {
    console.error(`File does not exist: ${filePath}`);
    throw new Error(`PDF file not found: ${bookFileName}`);
  }

  console.log(`Reading file: ${filePath}`);
  const buffer = await fs.readFile(filePath);
  console.log(`File size: ${buffer.length} bytes`);

  const data = new Uint8Array(buffer);
  console.log(`Creating PDF.js document`);
  const loadingTask = pdfjsLib.getDocument({ 
    data, 
    disableWorker: true
  });

  console.log(`Waiting for PDF to load`);
  const pdf = await loadingTask.promise;
  console.log(`PDF loaded with ${pdf.numPages} pages`);

  const parts: string[] = [];
  const s = Math.max(1, startPage);
  const e = Math.min(endPage, pdf.numPages);
  console.log(`Extracting text from pages ${s} to ${e}`);

  for (let i = s; i <= e; i++) {
    try {
      console.log(`Processing page ${i}/${e}`);
      const page = await pdf.getPage(i);
      console.log(`Getting text content for page ${i}`);
      const tc = await page.getTextContent();
      const items = tc.items as Array<{ str: string }>;
      const pageText = items.map((it) => it.str).join("\n");
      console.log(`Extracted ${pageText.length} characters from page ${i}`);
      parts.push(pageText);
    } catch (err) {
      console.error(`Error processing page ${i}:`, err);
      // Continue with next page
      parts.push(`[Error extracting text from page ${i}]`);
    }
  }
  console.log(`Finished extracting text from ${e-s+1} pages`);

  // Basic cleanups
  const text = parts.join("\n\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
