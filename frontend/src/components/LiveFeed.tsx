import { useEffect, useRef } from "react";
import type { Payload } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  payloads: Payload[];
  selectedId: number | null;
  onSelect: (p: Payload) => void;
}

export default function LiveFeed({ payloads, selectedId, onSelect }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [payloads.length]);

  if (payloads.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Live Feed
      </h3>
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {payloads.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`w-full text-left flex items-center gap-3 rounded-lg px-4 py-2.5 border transition-colors ${
              selectedId === p.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 min-w-[4rem]">
              {p.method}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate flex-1">
              /hooks/{p.hook_uuid.slice(0, 8)}...
            </span>
            <StatusBadge code={p.status_code} />
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap font-mono">
              {new Date(p.timestamp).toLocaleTimeString()}
            </span>
          </button>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
