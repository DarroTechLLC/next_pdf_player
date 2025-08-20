"use client";

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

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

// Set the worker source directly to the .mjs file which we know works
pdfjsLib.GlobalWorkerOptions.workerSrc = `/js/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;


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
    const loadPDF = async () => {
      setError(null);
      console.log(`Loading PDF from path: ${pdfPath}`);
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
        // Don't call renderPage here, it will be called by the useEffect below
      } catch (error) {
        console.error('Error loading PDF:', error);
        setError(`Failed to load PDF: ${error.message || 'Unknown error'}. Please try again or check if the file is valid.`);
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

  // Render the PDF when it's loaded or when the current page changes
  useEffect(() => {
    if (pdf && !pageRendering) {
      console.log(`PDF loaded, rendering page ${pageNum}`);
      renderPage(pageNum);
    }
  }, [pdf, pageNum]);

  // Update page when currentPage prop changes
  useEffect(() => {
    if (currentPage !== pageNum && !pageRendering) {
      setPageNum(currentPage);
      // Don't call renderPage here, it will be called by the useEffect above
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
      // Don't call renderPage here, it will be called by the useEffect
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
                // Don't call renderPage here, it will be called by the useEffect
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
