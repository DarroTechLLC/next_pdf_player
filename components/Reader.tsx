"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import FormattedText from './FormattedText';
import PDFViewer from './PDFViewer';

// View mode types
type ViewMode = 'text-only' | 'pdf-only' | 'split';

const Wrap = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: .6rem;
  align-items: center;

  & > * { flex: 0 0 auto; }
  select, input[type="range"] {
    min-width: 160px;
  }
`;

const ViewControls = styled.div`
  display: flex;
  gap: .6rem;
  margin-bottom: 1rem;
`;

const ViewButton = styled.button<{ $active?: boolean }>`
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  background-color: ${props => props.$active ? '#f0f0f0' : 'white'};
  font-weight: ${props => props.$active ? 'bold' : 'normal'};
  cursor: pointer;

  &:hover {
    background-color: #f5f5f5;
  }
`;

const TextBox = styled.div`
  border: 1px solid #ddd;
  border-radius: .75rem;
  padding: 1rem;
  max-height: 60vh;
  overflow: auto;
  line-height: 1.75;
  font-size: 1.1rem;
`;

const SplitView = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

function chunkSentences(text: string, maxLen = 1200): string[] {
  // Split by sentence-ish delimiters, then glue into chunks up to ~maxLen chars
  const bits = text.split(/(?<=[\.\!\?])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const b of bits) {
    if ((cur + " " + b).trim().length > maxLen) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = b;
    } else {
      cur = (cur + " " + b).trim();
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

type VoiceInfo = SpeechSynthesisVoice;

export default function Reader({
  text,
  book,
  activeChapter,
  autoScroll = true
}: {
  text: string;
  book: string;
  activeChapter?: number;
  autoScroll?: boolean;
}) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(-1);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('viewMode') as ViewMode | null;
      return saved || 'text-only';
    }
    return 'text-only';
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [chapterInfo, setChapterInfo] = useState<{ startPage: number; endPage: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<boolean>(false);
  const queueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const charBaseRef = useRef<number>(0);
  const pausePositionRef = useRef<{ charBase: number; currentWord: number } | null>(null);
  const remainingChunksRef = useRef<string[]>([]);

  // Build word list & index mapping
  const { words, wordOffsets, plainText } = useMemo(() => {
    // First, extract plain text without markdown formatting
    const plainText = text
      .replace(/^#+\s+/gm, '') // Remove heading markers
      .replace(/^>\s+/gm, '')  // Remove quote markers
      .replace(/^•\s+/gm, '')  // Remove bullet points
      .replace(/^---\n|\n---$/g, '') // Remove sidebar markers
      .replace(/\n\n/g, ' ')   // Replace double newlines with space
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();

    // Now split into words and calculate offsets based on plain text
    const arr = plainText.split(" ");
    const offsets: number[] = [];
    let pos = 0;
    for (const w of arr) {
      offsets.push(pos);
      pos += w.length + 1; // + space
    }
    return { words: arr, wordOffsets: offsets, plainText };
  }, [text]);

  // Calculate recent words for highlighting
  const recentWordIdxs = useMemo(() => {
    if (currentWordIdx < 0) return [];
    return Array.from({ length: 5 }, (_, i) => currentWordIdx - i - 1)
      .filter(idx => idx >= 0);
  }, [currentWordIdx]);

  // Voices
  useEffect(() => {
    function loadVoices() {
      const v = speechSynthesis.getVoices();
      setVoices(v);
      if (!voiceName && v.length) {
        const pref = v.find(x => /US English|en-US|Samantha|Allison|Zira|Google US/i.test(x.name + " " + x.lang));
        setVoiceName((pref || v[0]).name);
      }
    }
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, [voiceName]);

  // Fetch chapter info when activeChapter changes
  useEffect(() => {
    if (activeChapter && book) {
      fetch(`/api/books/${encodeURIComponent(book)}/chapters`)
        .then(res => res.json())
        .then(data => {
          const info = data.chapters?.find((c: any) => c.id === activeChapter);
          if (info) {
            setChapterInfo({
              startPage: info.startPage,
              endPage: info.endPage
            });

            // Initialize PDF to the first page of the chapter
            setCurrentPage(info.startPage);
          }
        })
        .catch(err => {
          console.error('Error fetching chapter info:', err);
          setChapterInfo(null);
        });
    } else {
      setChapterInfo(null);
    }
  }, [activeChapter, book]);

  // Scroll current word into view and sync PDF page
  useEffect(() => {
    if (currentWordIdx < 0) return;

    // Scroll text into view if autoScroll is enabled
    if (autoScroll) {
      const el = containerRef.current?.querySelector(`[data-w="${currentWordIdx}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }

    // Estimate PDF page based on word position
    // This is a simple estimation - for a more accurate mapping, we would need
    // to get page information from the server for each word
    if ((viewMode === 'pdf-only' || viewMode === 'split') && chapterInfo) {
      const wordPosition = currentWordIdx / words.length;
      const { startPage, endPage } = chapterInfo;
      const totalPages = endPage - startPage + 1;
      const estimatedPage = Math.max(startPage, Math.floor(startPage + wordPosition * totalPages));

      if (estimatedPage !== currentPage) {
        setCurrentPage(estimatedPage);
      }
    }
  }, [currentWordIdx, autoScroll, viewMode, words.length, chapterInfo, currentPage]);

  const findWordIndexFromChar = useCallback((globalCharIdx: number) => {
    // binary search
    let lo = 0, hi = wordOffsets.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wordOffsets[mid] <= globalCharIdx) {
        ans = mid; lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }, [wordOffsets]);

  const stopAll = useCallback(() => {
    abortRef.current = true;
    setPlaying(false);
    setPaused(false);
    speechSynthesis.cancel();
    queueRef.current = [];
    charBaseRef.current = 0;
    setCurrentWordIdx(-1);
    pausePositionRef.current = null;
    remainingChunksRef.current = [];
  }, []);

  const pause = useCallback(() => {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
      pausePositionRef.current = {
        charBase: charBaseRef.current,
        currentWord: currentWordIdx
      };

      const allChunks = chunkSentences(plainText);
      let charCount = 0;
      let remainingChunks: string[] = [];

      for (let i = 0; i < allChunks.length; i++) {
        if (charCount <= charBaseRef.current && charCount + allChunks[i].length > charBaseRef.current) {
          remainingChunks = allChunks.slice(i);
          break;
        }
        charCount += allChunks[i].length + 1;
      }

      remainingChunksRef.current = remainingChunks;
      speechSynthesis.pause();
      setPaused(true);
    }
  }, [currentWordIdx, words, plainText]);

  const resume = useCallback(() => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setPaused(false);
    }
  }, []);

  const play = useCallback(() => {
    if (!text.trim()) return;

    if (paused && pausePositionRef.current && remainingChunksRef.current.length > 0) {
      speechSynthesis.cancel();

      const { charBase, currentWord } = pausePositionRef.current;
      charBaseRef.current = charBase;
      setCurrentWordIdx(currentWord);

      const chosen = voices.find(v => v.name === voiceName) || voices[0];
      const queue: SpeechSynthesisUtterance[] = [];

      for (const chunk of remainingChunksRef.current) {
        const u = new SpeechSynthesisUtterance(chunk);
        if (chosen) u.voice = chosen;
        u.rate = rate;
        u.pitch = pitch;

        u.onboundary = (ev: SpeechSynthesisEvent) => {
          if (abortRef.current) return;
          if (ev.name === "word" || ev.charIndex >= 0) {
            const globalChar = charBaseRef.current + ev.charIndex;
            const idx = findWordIndexFromChar(globalChar);
            setCurrentWordIdx(idx);
          }
        };

        u.onend = () => {
          if (abortRef.current) return;
          charBaseRef.current += chunk.length + 1;
          if (u === queue[queue.length - 1]) {
            setPlaying(false);
            setPaused(false);
            pausePositionRef.current = null;
            remainingChunksRef.current = [];
          }
        };

        queue.push(u);
      }

      queueRef.current = queue;
      setPlaying(true);
      setPaused(false);

      for (const u of queue) {
        speechSynthesis.speak(u);
      }
      return;
    }

    stopAll();
    abortRef.current = false;

    const chunks = chunkSentences(plainText);
    const chosen = voices.find(v => v.name === voiceName) || voices[0];

    let globalBase = 0;
    const queue: SpeechSynthesisUtterance[] = [];
    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      if (chosen) u.voice = chosen;
      u.rate = rate;
      u.pitch = pitch;

      u.onboundary = (ev: SpeechSynthesisEvent) => {
        if (abortRef.current) return;
        if (ev.name === "word" || ev.charIndex >= 0) {
          const globalChar = globalBase + ev.charIndex;
          const idx = findWordIndexFromChar(globalChar);
          setCurrentWordIdx(idx);
        }
      };

      u.onend = () => {
        if (abortRef.current) return;
        globalBase += chunk.length + 1;
        charBaseRef.current = globalBase;

        if (u === queue[queue.length - 1]) {
          setPlaying(false);
          setPaused(false);
          pausePositionRef.current = null;
          remainingChunksRef.current = [];
        }
      };

      queue.push(u);
    }

    queueRef.current = queue;
    setPlaying(true);
    setPaused(false);

    for (const u of queue) {
      speechSynthesis.speak(u);
    }
  }, [findWordIndexFromChar, pause, resume, stopAll, rate, pitch, text, voiceName, voices, words, paused, plainText]);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  // Construct the PDF path
  const pdfPath = book ? `/pdfs/${book}` : '';

  // Handle page change in PDF viewer
  const updateViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('viewMode', mode);
    }
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);

    // Synchronize text position when PDF page changes
    if (chapterInfo && words.length > 0) {
      const { startPage, endPage } = chapterInfo;
      const totalPages = endPage - startPage + 1;

      // Calculate relative position in the chapter
      const relativePosition = Math.max(0, Math.min(1, (page - startPage) / totalPages));

      // Estimate word index based on relative position
      const estimatedWordIdx = Math.floor(relativePosition * words.length);

      // Only update if not currently playing
      if (!playing && !paused) {
        setCurrentWordIdx(Math.max(0, Math.min(estimatedWordIdx, words.length - 1)));
      }
    }
  }, [chapterInfo, words.length, playing, paused]);

  return (
    <Wrap>
      <ViewControls>
        <ViewButton 
          onClick={() => updateViewMode('text-only')} 
          $active={viewMode === 'text-only'}
        >
          Text Only
        </ViewButton>
        <ViewButton 
          onClick={() => updateViewMode('pdf-only')} 
          $active={viewMode === 'pdf-only'}
        >
          PDF Only
        </ViewButton>
        <ViewButton 
          onClick={() => updateViewMode('split')} 
          $active={viewMode === 'split'}
        >
          Side by Side
        </ViewButton>
      </ViewControls>

      {(viewMode === 'text-only' || viewMode === 'split') && (
        <Controls>
          <button onClick={play} disabled={false}>▶ {paused ? 'Restart' : 'Play'}</button>
          <button onClick={pause} disabled={!playing || paused}>⏸ Pause</button>
          <button onClick={resume} disabled={!paused}>⏯ Resume</button>
          <button onClick={stopAll} disabled={!playing && !paused}>⏹ Stop</button>

          <label>
            Voice:
            <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
              {voices.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </label>

          <label>
            Speed: {rate.toFixed(2)}
            <input type="range" min={0.5} max={1.5} step={0.05}
                  value={rate} onChange={e => setRate(parseFloat(e.target.value))}/>
          </label>

          <label>
            Pitch: {pitch.toFixed(2)}
            <input type="range" min={0.75} max={1.5} step={0.05}
                  value={pitch} onChange={e => setPitch(parseFloat(e.target.value))}/>
          </label>
        </Controls>
      )}

      {viewMode === 'text-only' && (
        <TextBox ref={containerRef}>
          <FormattedText
            text={text}
            currentWordIdx={currentWordIdx}
            recentWordIdxs={recentWordIdxs}
          />
        </TextBox>
      )}

      {viewMode === 'pdf-only' && (
        <PDFViewer 
          pdfPath={pdfPath} 
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      )}

      {viewMode === 'split' && (
        <SplitView>
          <TextBox ref={containerRef}>
            <FormattedText
              text={text}
              currentWordIdx={currentWordIdx}
              recentWordIdxs={recentWordIdxs}
            />
          </TextBox>
          <PDFViewer 
            pdfPath={pdfPath} 
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        </SplitView>
      )}
    </Wrap>
  );
}
