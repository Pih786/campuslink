import { Fragment } from "react";

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Minimal, injection-safe formatter for model answers: paragraphs, headings,
// "- " and "1. " lists, fenced code blocks, **bold** and `code`.
// Text is always rendered as React text; no HTML is ever injected.
function FormattedText({ text, className = "copilot-answer" }) {
  const blocks = [];
  let list = null;
  let code = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l-${blocks.length}`}>
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  for (const rawLine of String(text ?? "").split("\n")) {
    if (code) {
      if (rawLine.trim().startsWith("```")) {
        blocks.push(
          <pre key={`c-${blocks.length}`} className="code-block">
            <code>{code.lines.join("\n")}</code>
          </pre>
        );
        code = null;
      } else {
        code.lines.push(rawLine);
      }
      continue;
    }

    const line = rawLine.trim();
    if (line.startsWith("```")) {
      flushList();
      code = { lines: [] };
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }
    flushList();
    if (heading) blocks.push(<p key={`h-${blocks.length}`} className="answer-heading">{renderInline(heading[1])}</p>);
    else if (line) blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line)}</p>);
  }
  flushList();
  if (code) {
    blocks.push(
      <pre key={`c-${blocks.length}`} className="code-block">
        <code>{code.lines.join("\n")}</code>
      </pre>
    );
  }

  return <div className={className}>{blocks}</div>;
}

export default FormattedText;
