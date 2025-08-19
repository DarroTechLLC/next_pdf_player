"use client";

import styled from "styled-components";
import { useEffect, useState, useRef, useCallback } from "react";
import ChapterList from "@/components/ChapterList";
import Reader from "@/components/Reader";

const Page = styled.div`
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1rem;
  padding: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  border: 1px solid #ddd;
  border-radius: .75rem;
  padding: 1rem;
`;

const H = styled.h2`
  margin: 0 0 .75rem;
`;

const Row = styled.div`
  display: flex;
  gap: .5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: .75rem;

  select {
    min-width: 220px;
  }
`;

type Chapter = { id: number; title: string; startPage: number; endPage: number };

export default function Home() {
  const [books, setBooks] = useState<string[]>([]);
  const [book, setBook] = useState<string>("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBooks = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    console.log("Client: Fetching book list");
    try {
      const response = await fetch("/api/books", {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`Failed to fetch books: ${response.status} ${response.statusText}${data.details ? ` - ${data.details}` : ''}`);
      }
      
      const data = await response.json();
      console.log(`Client: Received ${data.books?.length || 0} books`);
      setBooks(data.books || []);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error("Error fetching books:", error);
      setBooks([]);
    }
  }, []);

  const fetchChapters = useCallback(async (bookName: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setChapters([]);
    setActiveId(undefined);
    setText("");
    setLoading(true);
    
    console.log(`Client: Fetching chapters for book: ${bookName}`);
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookName)}/chapters`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`Failed to fetch chapters: ${response.status} ${response.statusText}${data.details ? ` - ${data.details}` : ''}`);
      }
      
      const data = await response.json();
      console.log(`Client: Received ${data.chapters?.length || 0} chapters`);
      setChapters(data.chapters || []);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error("Error fetching chapters:", error);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchBooks]);

  useEffect(() => {
    if (!book) return;
    fetchChapters(book);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [book, fetchChapters]);

  const pickChapter = async (id: number) => {
    setActiveId(id);
    setText("");
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(book)}/chapter?index=${id}`);
      if (!res.ok) {
        try {
          const errorData = await res.json();
          throw new Error(`Failed to fetch chapter text: ${res.status} ${res.statusText}${errorData.details ? ` - ${errorData.details}` : ''}`);
        } catch (e) {
          // If we can't parse the JSON, just throw the original error
          throw new Error(`Failed to fetch chapter text: ${res.status} ${res.statusText}`);
        }
      }
      const data = await res.json();
      console.log(`Client: Received chapter text with ${data.text?.length || 0} characters`);
      setText(data.text || "");
    } catch (error) {
      console.error("Error fetching chapter text:", error);
      setText("");
    }
  };

  return (
    <Page>
      <Card>
        <H>📚 Book & Chapters</H>
        <Row>
          <label>Book:
            <select value={book} onChange={(e) => setBook(e.target.value)}>
              <option value="" disabled>Choose a PDF from /public/pdfs</option>
              {books.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </Row>

        {chapters.length > 0 ? (
          <>
            <p style={{opacity:.7, marginTop:0}}>Detected {chapters.length} chapters.</p>
            <ChapterList chapters={chapters} activeId={activeId} onPick={pickChapter} />
          </>
        ) : book ? (
          <p>{loading ? "Scanning chapters… (first run may take a moment)" : "No chapters found"}</p>
        ) : (
          <p>Put your PDF(s) in <code>public/pdfs/</code> and select one.</p>
        )}
      </Card>

      <Card>
        <H>🎧 Reader</H>
        {text ? (
          <Reader text={text} />
        ) : (
          <p>Select a chapter to read.</p>
        )}
      </Card>
    </Page>
  );
}
