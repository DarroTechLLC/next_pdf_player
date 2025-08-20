"use client";

import React from 'react';
import styled, { css } from 'styled-components';

const Word = styled.span<{ $active?: boolean; $recent?: boolean }>`
  padding: .1rem .2rem;
  border-radius: .35rem;
  ${p => p.$active && css`background: #ffd54f;`}
  ${p => p.$recent && css`background: rgba(255, 213, 79, .35);`}
`;

const Heading = styled.h1<{ $level: number }>`
  font-size: ${p => {
    switch (p.$level) {
      case 1: return '2em';
      case 2: return '1.5em';
      case 3: return '1.25em';
      default: return '1.1em';
    }
  }};
  font-weight: bold;
  margin: 1.5em 0 0.5em;
`;

const Paragraph = styled.p`
  margin: 1em 0;
  line-height: 1.75;
`;

const List = styled.ul`
  margin: 1em 0;
  padding-left: 2em;
`;

const Quote = styled.blockquote`
  margin: 1em 0;
  padding-left: 1em;
  border-left: 3px solid #ddd;
  font-style: italic;
`;

const Sidebar = styled.div`
  margin: 1em 0;
  padding: 1em;
  background: #f5f5f5;
  border-radius: 0.5rem;
`;

interface FormattedTextProps {
  text: string;
  currentWordIdx: number;
  recentWordIdxs: number[];
}

export default function FormattedText({ text, currentWordIdx, recentWordIdxs }: FormattedTextProps) {
  // Split text into blocks based on markdown-like formatting
  const blocks = text.split('\n\n');
  let globalWordIdx = 0;

  return (
    <>
      {blocks.map((block, blockIdx) => {
        if (block.startsWith('#')) {
          // Heading
          const level = block.match(/^#+/)?.[0].length || 1;
          const content = block.replace(/^#+\s+/, '');
          const words = content.split(/\s+/);
          const wordElements = words.map((word, i) => {
            const idx = globalWordIdx++;
            return (
              <Word
                key={idx}
                data-w={idx}
                $active={idx === currentWordIdx}
                $recent={recentWordIdxs.includes(idx)}
              >
                {word}{' '}
              </Word>
            );
          });
          return <Heading key={blockIdx} $level={level}>{wordElements}</Heading>;
        } else if (block.startsWith('• ')) {
          // List
          const items = block.split('\n');
          return (
            <List key={blockIdx}>
              {items.map((item, itemIdx) => {
                const words = item.replace(/^•\s+/, '').split(/\s+/);
                const wordElements = words.map((word, i) => {
                  const idx = globalWordIdx++;
                  return (
                    <Word
                      key={idx}
                      data-w={idx}
                      $active={idx === currentWordIdx}
                      $recent={recentWordIdxs.includes(idx)}
                    >
                      {word}{' '}
                    </Word>
                  );
                });
                return <li key={itemIdx}>{wordElements}</li>;
              })}
            </List>
          );
        } else if (block.startsWith('>')) {
          // Quote
          const content = block.replace(/^>\s+/, '');
          const words = content.split(/\s+/);
          const wordElements = words.map((word, i) => {
            const idx = globalWordIdx++;
            return (
              <Word
                key={idx}
                data-w={idx}
                $active={idx === currentWordIdx}
                $recent={recentWordIdxs.includes(idx)}
              >
                {word}{' '}
              </Word>
            );
          });
          return <Quote key={blockIdx}>{wordElements}</Quote>;
        } else if (block.startsWith('---')) {
          // Sidebar
          const content = block.replace(/^---\n|\n---$/g, '');
          const words = content.split(/\s+/);
          const wordElements = words.map((word, i) => {
            const idx = globalWordIdx++;
            return (
              <Word
                key={idx}
                data-w={idx}
                $active={idx === currentWordIdx}
                $recent={recentWordIdxs.includes(idx)}
              >
                {word}{' '}
              </Word>
            );
          });
          return <Sidebar key={blockIdx}>{wordElements}</Sidebar>;
        } else {
          // Regular paragraph
          const words = block.split(/\s+/);
          const wordElements = words.map((word, i) => {
            const idx = globalWordIdx++;
            return (
              <Word
                key={idx}
                data-w={idx}
                $active={idx === currentWordIdx}
                $recent={recentWordIdxs.includes(idx)}
              >
                {word}{' '}
              </Word>
            );
          });
          return <Paragraph key={blockIdx}>{wordElements}</Paragraph>;
        }
      })}
    </>
  );
}
