import { useMemo } from "react";

interface Props {
  data: unknown;
  raw?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlight(json: string): string {
  return json
    .replace(
      /("(?:[^"\\]|\\.)*")\s*:/g,
      '<span class="json-key">$1</span>:'
    )
    .replace(
      /:\s*("(?:[^"\\]|\\.)*")/g,
      ': <span class="json-string">$1</span>'
    )
    .replace(
      /:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      ': <span class="json-number">$1</span>'
    )
    .replace(
      /:\s*(true|false)/g,
      ': <span class="json-boolean">$1</span>'
    )
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

export default function JsonView({ data, raw }: Props) {
  const html = useMemo(() => {
    let str: string;
    if (data !== null && data !== undefined && typeof data === "object") {
      str = JSON.stringify(data, null, 2);
    } else if (typeof data === "string") {
      try {
        str = JSON.stringify(JSON.parse(data), null, 2);
      } catch {
        str = raw ?? data;
      }
    } else {
      str = raw ?? String(data ?? "");
    }
    return highlight(escapeHtml(str));
  }, [data, raw]);

  return (
    <pre
      className="font-mono text-sm leading-relaxed overflow-auto whitespace-pre-wrap break-all"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
