import type { ReactNode } from "react";

type AiRichTextProps = {
  text: string;
};

type Block =
  | { type: "heading"; content: string }
  | { type: "paragraph"; content: string[] }
  | { type: "list"; content: string[] }
  | { type: "quote"; content: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "divider" };

function parseInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={index} className="report-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function isTableLine(line: string) {
  return /^\|(.+\|)+$/.test(line.trim());
}

function normalizeTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderAiRichText(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (/^---+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      continue;
    }

    if (isTableLine(trimmed)) {
      const row = normalizeTableRow(trimmed);
      const last = blocks[blocks.length - 1];
      const isSeparator =
        row.length > 0 &&
        row.every((cell) => /^:?-{3,}:?$/.test(cell));

      if (isSeparator) continue;

      if (last?.type === "table") {
        last.rows.push(row);
      } else {
        blocks.push({ type: "table", rows: [row] });
      }
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed) || /^[一二三四五六七八九十]+[、.]/.test(trimmed) || /^\d+[.)．]/.test(trimmed)) {
      blocks.push({
        type: "heading",
        content: trimmed.replace(/^#{1,6}\s+/, ""),
      });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const item = trimmed.replace(/^>\s?/, "");
      const last = blocks[blocks.length - 1];
      if (last?.type === "quote") {
        last.content.push(item);
      } else {
        blocks.push({ type: "quote", content: [item] });
      }
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*•]\s+/, "");
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") {
        last.content.push(item);
      } else {
        blocks.push({ type: "list", content: [item] });
      }
      continue;
    }

    const last = blocks[blocks.length - 1];
    if (last?.type === "paragraph") {
      last.content.push(trimmed);
    } else {
      blocks.push({ type: "paragraph", content: [trimmed] });
    }
  }

  return blocks.map((block, index) => {
    if (block.type === "heading") {
      return (
        <h4 key={`${block.type}-${index}`} className="report-heading">
          {parseInline(block.content)}
        </h4>
      );
    }

    if (block.type === "list") {
      return (
        <ul key={`${block.type}-${index}`} className="report-list">
          {block.content.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{parseInline(item)}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "quote") {
      return (
        <blockquote key={`${block.type}-${index}`} className="report-quote">
          {block.content.map((item, itemIndex) => (
            <p key={`${index}-${itemIndex}`} className="report-quote-line">
              {parseInline(item)}
            </p>
          ))}
        </blockquote>
      );
    }

    if (block.type === "table") {
      const [header, ...rows] = block.rows;
      return (
        <div key={`${block.type}-${index}`} className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{parseInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{parseInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (block.type === "divider") {
      return <hr key={`${block.type}-${index}`} className="report-divider" />;
    }

    return (
      <p key={`${block.type}-${index}`} className="report-paragraph">
        {block.content.flatMap((line, lineIndex) => {
          const content = parseInline(line);
          if (lineIndex === 0) return content;
          return [<br key={`br-${lineIndex}`} />, ...content];
        })}
      </p>
    );
  });
}

export function AiRichText({ text }: AiRichTextProps) {
  return <div className="report-text">{renderAiRichText(text)}</div>;
}
