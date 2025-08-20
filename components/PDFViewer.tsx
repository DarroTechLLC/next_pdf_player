"use client";

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

// Import the worker directly - this will be handled by webpack
// This import is only used in the browser
let pdfWorkerSrc = '';
if (typeof window !== 'undefined') {
  try {
    // Try to import the worker directly
    // This will be processed by webpack
    pdfWorkerSrc = require('pdfjs-dist/build/pdf.worker.min.js');
    console.log('Worker imported directly:', pdfWorkerSrc);
  } catch (e) {
    console.warn('Failed to import worker directly:', e);
  }
}

// Polyfill for Path2D if not available
if (typeof Path2D === 'undefined') {
  try {
    // Use the installed path2d package
    // @ts-ignore
    window.Path2D = require('path2d').Path2D;
    console.log('Path2D polyfill loaded successfully');
  } catch (e) {
    console.warn('Cannot polyfill `Path2D`, rendering may be broken.', e);
  }
}

// Polyfill for DOMMatrix if not available
if (typeof DOMMatrix === 'undefined') {
  try {
    // Use the installed dommatrix package
    // @ts-ignore
    const DOMMatrixPolyfill = require('dommatrix');
    // @ts-ignore
    window.DOMMatrix = DOMMatrixPolyfill;
    console.log('DOMMatrix polyfill loaded successfully');
  } catch (e) {
    console.warn('Cannot polyfill `DOMMatrix`, rendering may be broken.', e);
  }
}

// Set the worker source to use a local file with fallbacks
const jsWorkerSrc = `/js/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
const mjsWorkerSrc = `/js/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
// CDN fallback as last resort
const cdnWorkerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

// Use the directly imported worker if available, otherwise fall back to .mjs version
if (pdfWorkerSrc) {
  console.log('Using directly imported worker');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
} else {
  console.log('Using .mjs worker file');
  pdfjsLib.GlobalWorkerOptions.workerSrc = mjsWorkerSrc;
}

// Add a function to check if the worker file exists and set fallback if needed
const checkWorkerFileExists = async () => {
  try {
    // First try the .mjs version (preferred for ES modules)
    let response = await fetch(mjsWorkerSrc, { method: 'HEAD' });

    if (response.ok) {
      console.log(`Worker file exists at ${mjsWorkerSrc}`);
      pdfjsLib.GlobalWorkerOptions.workerSrc = mjsWorkerSrc;
      return;
    } 

    console.warn(`Worker file not found at ${mjsWorkerSrc}. Status: ${response.status}`);
    console.log(`Trying fallback worker file at ${jsWorkerSrc}`);

    // Try the .js version as fallback
    response = await fetch(jsWorkerSrc, { method: 'HEAD' });

    if (response.ok) {
      console.log(`Fallback worker file exists at ${jsWorkerSrc}`);
      pdfjsLib.GlobalWorkerOptions.workerSrc = jsWorkerSrc;
      return;
    }

    console.error(`Fallback worker file not found at ${jsWorkerSrc}. Status: ${response.status}`);
    console.log(`Trying CDN fallback worker file at ${cdnWorkerSrc}`);

    // Try the CDN version as a last resort
    try {
      response = await fetch(cdnWorkerSrc, { method: 'HEAD' });

      if (response.ok) {
        console.log(`CDN fallback worker file exists at ${cdnWorkerSrc}`);
        pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;
        return;
      }

      console.error(`CDN fallback worker file not found at ${cdnWorkerSrc}. Status: ${response.status}`);
    } catch (cdnError) {
      console.error(`Error checking CDN worker file: ${cdnError}`);
    }

    console.error('All worker files are missing. PDF rendering may fail.');
  } catch (error) {
    console.error(`Error checking worker files: ${error}`);

    // If there's an error checking local files, try the CDN as a last resort
    console.log(`Falling back to CDN worker file due to error: ${cdnWorkerSrc}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;
  }
};

// Function to preload the worker file
const preloadWorkerFile = (src: string) => {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    console.log(`Preloading worker file: ${src}`);
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = src;
    link.onload = () => {
      console.log(`Successfully preloaded: ${src}`);
      resolve(true);
    };
    link.onerror = () => {
      console.warn(`Failed to preload: ${src}`);
      resolve(false);
    };
    document.head.appendChild(link);
  });
};

// Function to load the worker file as a module
const loadWorkerAsModule = (src: string) => {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    console.log(`Loading worker script as module: ${src}`);
    const script = document.createElement('script');
    script.src = src;
    script.type = 'module';
    script.async = true;

    script.onload = () => {
      console.log(`Successfully loaded worker script as module: ${src}`);
      resolve(true);
    };
    script.onerror = () => {
      console.warn(`Failed to load worker script as module: ${src}`);
      resolve(false);
    };
    document.head.appendChild(script);
  });
};

// Function to load the worker file as a regular script
const loadWorkerAsScript = (src: string) => {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    console.log(`Loading worker script as regular script: ${src}`);
    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    script.onload = () => {
      console.log(`Successfully loaded worker script as regular script: ${src}`);
      resolve(true);
    };
    script.onerror = () => {
      console.warn(`Failed to load worker script as regular script: ${src}`);
      resolve(false);
    };
    document.head.appendChild(script);
  });
};

// Function to try loading the worker file in different ways
const loadWorkerScript = async (src: string) => {
  if (typeof window === 'undefined') {
    return false;
  }

  console.log(`Attempting to load worker script: ${src}`);

  // For .mjs files or local .js files, try loading as module first
  if (src.endsWith('.mjs') || (src.endsWith('.js') && !src.includes('unpkg.com'))) {
    console.log('Trying to load as module first');
    const moduleSuccess = await loadWorkerAsModule(src);
    if (moduleSuccess) {
      return true;
    }
    console.log('Module loading failed, trying as regular script');
  }

  // Try loading as regular script as fallback
  return await loadWorkerAsScript(src);
};

// Check if running in browser environment
if (typeof window !== 'undefined') {
  // Execute the check after component mounts
  setTimeout(async () => {
    // Skip the check if we're using the directly imported worker
    if (!pdfWorkerSrc) {
      await checkWorkerFileExists();
    }

    // Get the worker source that was selected
    let workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;

    // Skip preloading and direct loading if we're using the directly imported worker
    if (!pdfWorkerSrc) {
      // First try to preload the worker file
      await preloadWorkerFile(workerSrc);

      // Then try to directly load the worker script
      let scriptLoaded = await loadWorkerScript(workerSrc);

      if (scriptLoaded) {
        console.log(`Worker script loaded successfully: ${workerSrc}`);
      } else {
        console.warn(`Worker script loading failed, trying CDN fallback`);

        // If local worker files fail, try the CDN version
        workerSrc = cdnWorkerSrc;
        pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;

        await preloadWorkerFile(cdnWorkerSrc);
        scriptLoaded = await loadWorkerScript(cdnWorkerSrc);

        if (scriptLoaded) {
          console.log(`CDN worker script loaded successfully: ${cdnWorkerSrc}`);
        } else {
          console.warn(`All worker script loading attempts failed, falling back to PDF.js built-in loading mechanism`);
        }
      }
    } else {
      console.log(`Using directly imported worker: ${workerSrc}`);
    }

    console.log(`Using worker file: ${workerSrc}`);

    // Add a global error handler to catch worker initialization errors
    window.addEventListener('error', (event) => {
      if (event.filename && event.filename.includes('pdf.worker')) {
        console.error(`Worker error detected: ${event.message}`);

        // If we're not already using the CDN and there's a worker error, try the CDN
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc.includes('unpkg.com')) {
          console.warn('Switching to CDN worker due to error');
          pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;
        }
      }
    });
  }, 1000);
}

const PDFContainer = styled.div`
  border: 1px solid #ddd;
  border-radius: .75rem;
  padding: 1rem;
  max-height: 60vh;
  overflow: auto;
  background-color: #f5f5f5;
  position: relative;
`;

const PageCanvas = styled.canvas`
  display: block;
  margin: 0 auto 1rem auto;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
`;

const PageControls = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.7);
  z-index: 10;
`;

const ZoomControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.5rem;
`;

const PageJump = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.5rem;

  input {
    width: 4rem;
    text-align: center;
  }
`;

interface PDFViewerProps {
  pdfPath: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

export default function PDFViewer({ pdfPath, currentPage = 1, onPageChange }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(currentPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageRendering, setPageRendering] = useState(false);
  const [pageNumPending, setPageNumPending] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // New state variables for enhancements
  const [scale, setScale] = useState(1.5);
  const [pageInput, setPageInput] = useState('');
  const [fitToWidth, setFitToWidth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the PDF
  useEffect(() => {
    const loadPDF = async (retryCount = 0) => {
      setError(null);
      console.log(`Loading PDF from path: ${pdfPath} (attempt ${retryCount + 1})`);
      console.log(`PDF.js version: ${pdfjsLib.version}`);
      console.log(`Worker source: ${pdfjsLib.GlobalWorkerOptions.workerSrc}`);

      try {
        console.log('Creating PDF loading task');
        const loadingTask = pdfjsLib.getDocument(pdfPath);

        // Add onProgress callback to track loading progress
        loadingTask.onProgress = (progressData) => {
          console.log(`PDF loading progress: ${progressData.loaded} / ${progressData.total}`);
        };

        console.log('Waiting for PDF document to load');
        const pdfDoc = await loadingTask.promise;
        console.log(`PDF loaded successfully with ${pdfDoc.numPages} pages`);

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        console.log(`Starting to render page ${currentPage}`);
        renderPage(currentPage);
      } catch (error) {
        console.error('Error loading PDF:', error);
        console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        // Check if the error is related to the worker
        const errorStr = String(error);
        const isWorkerError = errorStr.includes('worker') || 
                             errorStr.includes('module') || 
                             errorStr.includes('export');

        if (isWorkerError && retryCount < 2) {
          console.warn(`Worker-related error detected, retrying with different worker configuration (attempt ${retryCount + 2})`);

          // If not already using CDN, switch to it
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc.includes('unpkg.com')) {
            console.log('Switching to CDN worker for retry');
            pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkerSrc;
          } else {
            // If already using CDN, try without type="module"
            console.log('Already using CDN, trying different loading approach');
          }

          // Wait a bit before retrying
          setTimeout(() => {
            loadPDF(retryCount + 1);
          }, 1000);
        } else {
          setError(`Failed to load PDF: ${error.message || 'Unknown error'}. Please try again or check if the file is valid.`);
        }
      }
    };

    loadPDF();

    return () => {
      // Cleanup
      if (pdf) {
        console.log('Cleaning up PDF document');
        pdf.destroy();
      }
    };
  }, [pdfPath]);

  // Update page when currentPage prop changes
  useEffect(() => {
    if (currentPage !== pageNum && !pageRendering) {
      setPageNum(currentPage);
      renderPage(currentPage);
    } else if (pageRendering) {
      setPageNumPending(currentPage);
    }
  }, [currentPage]);

  const renderPage = async (num: number) => {
    if (!pdf) {
      console.error('PDF document not loaded');
      setError('PDF document not loaded. Please try again.');
      return;
    }

    setPageRendering(true);
    setError(null);
    console.log(`Rendering page ${num} of PDF`);

    try {
      console.log(`Getting page ${num} from PDF document`);
      const page = await pdf.getPage(num);
      console.log(`Successfully got page ${num}`);

      const canvas = canvasRef.current;
      if (!canvas) {
        console.error('Canvas reference not available');
        setError('Canvas not available. Please try again.');
        setPageRendering(false);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Canvas 2D context not available');
        setError('Canvas context not available. Please try again.');
        setPageRendering(false);
        return;
      }

      // Create initial viewport with current scale
      console.log(`Creating viewport with scale ${scale}`);
      let viewport = page.getViewport({ scale });

      // If fit-to-width is enabled, calculate scale to fit container width
      if (fitToWidth && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 40; // Subtract padding
        const scaleFactor = containerWidth / viewport.width;
        console.log(`Fit to width enabled, adjusting scale to ${scaleFactor}`);
        viewport = page.getViewport({ scale: scaleFactor });
      }

      console.log(`Setting canvas dimensions: ${viewport.width}x${viewport.height}`);
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      console.log('Starting page rendering');
      await page.render(renderContext).promise;
      console.log('Page rendering completed successfully');
      setPageRendering(false);

      if (pageNumPending !== null) {
        console.log(`Processing pending page request: ${pageNumPending}`);
        renderPage(pageNumPending);
        setPageNumPending(null);
      }
    } catch (error) {
      console.error('Error rendering page:', error);
      setError(`Failed to render page: ${error.message || 'Unknown error'}. Please try again.`);
      setPageRendering(false);
    }
  };

  const changePage = (offset: number) => {
    const newPageNum = pageNum + offset;
    if (newPageNum >= 1 && newPageNum <= totalPages && !pageRendering) {
      setPageNum(newPageNum);
      renderPage(newPageNum);
      if (onPageChange) {
        onPageChange(newPageNum);
      }
    }
  };

  return (
    <PDFContainer ref={containerRef}>
      {pageRendering && (
        <LoadingOverlay>
          <div>Loading page {pageNum}...</div>
        </LoadingOverlay>
      )}

      <PageControls>
        <button onClick={() => changePage(-1)} disabled={pageNum <= 1 || pageRendering}>
          Previous
        </button>
        <span>
          Page {pageNum} of {totalPages}
        </span>
        <button onClick={() => changePage(1)} disabled={pageNum >= totalPages || pageRendering}>
          Next
        </button>

        <PageJump>
          <input 
            type="text" 
            value={pageInput} 
            onChange={(e) => setPageInput(e.target.value)}
            placeholder={pageNum.toString()}
            size={4}
          />
          <button 
            onClick={() => {
              const num = parseInt(pageInput);
              if (!isNaN(num) && num >= 1 && num <= totalPages) {
                setPageNum(num);
                renderPage(num);
                if (onPageChange) onPageChange(num);
              }
              setPageInput('');
            }}
            disabled={pageRendering}
          >
            Go
          </button>
        </PageJump>

        <ZoomControls>
          <button onClick={() => setScale(prev => Math.max(0.5, prev - 0.25))} disabled={pageRendering}>
            Zoom Out
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(prev => Math.min(3, prev + 0.25))} disabled={pageRendering}>
            Zoom In
          </button>
          <button onClick={() => setScale(1.5)} disabled={pageRendering}>
            Reset
          </button>
        </ZoomControls>

        <button 
          onClick={() => setFitToWidth(!fitToWidth)}
          style={{ fontWeight: fitToWidth ? 'bold' : 'normal' }}
          disabled={pageRendering}
        >
          Fit to Width
        </button>
      </PageControls>

      {error && (
        <div style={{ 
          color: 'red', 
          padding: '1rem', 
          textAlign: 'center',
          backgroundColor: '#ffeeee',
          border: '1px solid #ffcccc',
          borderRadius: '0.5rem',
          margin: '1rem 0'
        }}>
          <h3>Error Loading PDF</h3>
          <p>{error}</p>
          <details>
            <summary>Troubleshooting Information</summary>
            <p>PDF.js Version: {pdfjsLib.version}</p>
            <p>Worker Source: {pdfjsLib.GlobalWorkerOptions.workerSrc}</p>
            <p>Path2D Available: {typeof Path2D !== 'undefined' ? 'Yes' : 'No'}</p>
            <p>DOMMatrix Available: {typeof DOMMatrix !== 'undefined' ? 'Yes' : 'No'}</p>
            <p>Try refreshing the page or check browser console for more details.</p>
          </details>
        </div>
      )}

      <PageCanvas ref={canvasRef} />
    </PDFContainer>
  );
}
