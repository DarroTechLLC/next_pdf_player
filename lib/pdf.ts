import path from "node:path";
import fs from "node:fs/promises";
import natural from 'natural';

// Use legacy build for Node.js environment
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Configure PDF.js for Node environment
// Try to use a path-based approach for the worker
const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

// Use path.resolve to ensure we get an absolute path
export const PDF_DIR = path.resolve(process.cwd(), "public", "pdfs");

// Text cleaning and formatting function
function cleanAndFormatText(rawText: string): string {
  // Split text into lines for processing
  const lines = rawText.split('\n');
  const blocks: { type: string; content: string }[] = [];
  let currentBlock: { type: string; content: string } | null = null;

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and page numbers/headers
    if (!line || isPageNumber(line) || isPageHeader(line)) {
      continue;
    }

    // Detect block type
    if (isChapterHeading(line)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { type: 'heading', content: formatHeading(line) };
      blocks.push(currentBlock);
      currentBlock = null;
    } else if (isBulletPoint(line)) {
      if (currentBlock?.type !== 'list') {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'list', content: formatListItem(line) };
      } else {
        currentBlock.content += '\n' + formatListItem(line);
      }
    } else if (isQuote(line)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { type: 'quote', content: formatQuote(line) };
      blocks.push(currentBlock);
      currentBlock = null;
    } else if (isSidebar(line)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { type: 'sidebar', content: formatSidebar(line, lines, i) };
      // Skip the lines that were included in the sidebar
      i += countSidebarLines(lines, i);
      blocks.push(currentBlock);
      currentBlock = null;
    } else {
      // Regular paragraph text
      if (!currentBlock || currentBlock.type !== 'paragraph') {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'paragraph', content: formatParagraph(line) };
      } else {
        // If this line looks like it continues the paragraph, append it
        if (shouldAppendToParagraph(line, currentBlock.content)) {
          currentBlock.content += ' ' + formatParagraph(line);
        } else {
          blocks.push(currentBlock);
          currentBlock = { type: 'paragraph', content: formatParagraph(line) };
        }
      }
    }
  }

  // Add the last block if there is one
  if (currentBlock) blocks.push(currentBlock);

  // Convert blocks to formatted text
  return blocks.map(block => {
    switch (block.type) {
      case 'heading':
        return block.content;
      case 'list':
        return block.content;
      case 'quote':
        return '> ' + block.content;
      case 'sidebar':
        return '---\n' + block.content + '\n---';
      case 'paragraph':
      default:
        return block.content;
    }
  }).join('\n\n');
}

// Helper functions
function isPageNumber(line: string): boolean {
  return /^\d+$/.test(line.trim());
}

function isPageHeader(line: string): boolean {
  return /^(Entrepreneurship Bootcamp|Defy Ventures)/i.test(line.trim());
}

function isChapterHeading(line: string): boolean {
  return /^Chapter\s+\d+/i.test(line.trim()) || 
         /^[A-Z][A-Z\s]{10,}/.test(line.trim());
}

function isBulletPoint(line: string): boolean {
  return /^[•·▪▫◦‣⁃]\s/.test(line.trim());
}

function isQuote(line: string): boolean {
  return /^[""]/.test(line.trim()) || /^z\s/.test(line.trim());
}

function isSidebar(line: string): boolean {
  return /^(Note:|Tip:|Important:)/.test(line.trim());
}

function formatHeading(line: string): string {
  const level = getHeadingLevel(line);
  const text = line.replace(/^Chapter\s+(\d+):\s*/i, 'Chapter $1: ')
                  .replace(/\s+/g, ' ')
                  .trim();
  return '#'.repeat(level) + ' ' + text;
}

function getHeadingLevel(line: string): number {
  if (/^Chapter\s+\d+/i.test(line)) return 1;
  if (/^Section/i.test(line)) return 2;
  if (/^\d+\./i.test(line)) return 3;
  return 2; // Default for other headings
}

function formatListItem(line: string): string {
  return '• ' + line.replace(/^[•·▪▫◦‣⁃]\s*/, '').trim();
}

function formatQuote(line: string): string {
  return line.replace(/^[""]/, '').replace(/^z\s/, '').trim();
}

function formatSidebar(line: string, lines: string[], currentIndex: number): string {
  // Extract the sidebar content
  let content = line.trim();
  let i = currentIndex + 1;
  while (i < lines.length && !isEmptyOrSeparator(lines[i])) {
    content += '\n' + lines[i].trim();
    i++;
  }
  return content;
}

function countSidebarLines(lines: string[], startIndex: number): number {
  let count = 0;
  let i = startIndex + 1;
  while (i < lines.length && !isEmptyOrSeparator(lines[i])) {
    count++;
    i++;
  }
  return count;
}

function isEmptyOrSeparator(line: string): boolean {
  return !line.trim() || /^-{3,}$/.test(line.trim());
}

function formatParagraph(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function shouldAppendToParagraph(line: string, currentContent: string): boolean {
  // Check if this line looks like it continues the paragraph
  // For example, if it doesn't start with a capital letter, it might be a continuation
  return !isChapterHeading(line) && 
         !isBulletPoint(line) && 
         !isQuote(line) && 
         !isSidebar(line) &&
         !/^[A-Z]/.test(line.trim()) && 
         currentContent.length > 0;
}

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

  // Join parts and do basic cleanup
  const text = parts.join("\n\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Apply advanced text cleaning and formatting
  return cleanAndFormatText(text);
}
