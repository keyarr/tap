import { useState } from "react";
import type { Payload, PaginatedResponse } from "../types";
import StatusBadge from "./StatusBadge";

interface Props {
  payloads: Payload[];
  selectedId: number | null;
  onSelect: (p: Payload) => void;
  pagination: PaginatedResponse | null;
  onPage: (page: number) => void;
  hookFilter: string;
  onHookFilter: (v: string) => void;
  methodFilter: string;
  onMethodFilter: (v: string) => void;
  searchText: string;
  onSearchText: (v: string) => void;
  onRefresh: () => void;
}

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export default function PayloadList({
  payloads, selectedId, onSelect, pagination, onPage,
  hookFilter, onHookFilter, methodFilter, onMethodFilter,
  searchText, onSearchText, onRefresh,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {filtersOpen ? "Hide" : "Show"} Filters
        </button>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      {filtersOpen && (
        <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Hook UUID..."
            value={hookFilter}
            onChange={(e) => onHookFilter(e.target.value)}
            className="flex-1 min-w-[120px] text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
          <select
            value={methodFilter}
            onChange={(e) => onMethodFilter(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m || "All Methods"}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search body..."
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
            className="flex-1 min-w-[120px] text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {payloads.length === 0 ? (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
            No payloads yet
          </div>
        ) : (
          payloads.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                selectedId === p.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
                  : "border-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 min-w-[4rem]">
                {p.method}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate flex-1">
                {p.hook_uuid.slice(0, 8)}...
              </span>
              <StatusBadge code={p.status_code} />
              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap font-mono">
                {new Date(p.timestamp).toLocaleTimeString()}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 mt-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {pagination.total} total
          </span>
          <div className="flex gap-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => onPage(pagination.page - 1)}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
              {pagination.page} / {pagination.total_pages}
            </span>
            <button
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => onPage(pagination.page + 1)}
              className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
