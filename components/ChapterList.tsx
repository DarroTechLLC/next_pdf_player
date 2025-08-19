"use client";

import styled from "styled-components";

const ListWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: .5rem;
  max-height: 60vh;
  overflow: auto;
`;

const Item = styled.button<{ $active?: boolean }>`
  padding: .6rem .8rem;
  text-align: left;
  border: 1px solid var(--border, #ddd);
  border-radius: .5rem;
  background: ${({ $active }) => ($active ? "rgba(0,120,255,.12)" : "transparent")};
  cursor: pointer;
  &:hover { background: rgba(0,0,0,.05); }
`;

export default function ChapterList({
  chapters,
  activeId,
  onPick
}: {
  chapters: { id: number; title: string; startPage: number; endPage: number }[];
  activeId?: number;
  onPick: (id: number) => void;
}) {
  return (
    <ListWrap>
      {chapters.map(c => (
        <Item key={c.id} $active={c.id === activeId} onClick={() => onPick(c.id)}>
          <strong>#{c.id}</strong> — {c.title}{" "}
          <small style={{opacity:.6}}> (p.{c.startPage}–{c.endPage})</small>
        </Item>
      ))}
    </ListWrap>
  );
}