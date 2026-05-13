import { useCallback, useEffect, useRef, useState } from "react";
import type { Payload, PaginatedResponse } from "./types";
import { useSSE } from "./hooks/useSSE";
import ThemeToggle from "./components/ThemeToggle";
import LiveFeed from "./components/LiveFeed";
import PayloadList from "./components/PayloadList";
import PayloadDetail from "./components/PayloadDetail";
import ReplayModal from "./components/ReplayModal";
import EmptyState from "./components/EmptyState";

type Tab = "live" | "history";

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [hookUrl, setHookUrl] = useState<string>("");
  const [hookLoading, setHookLoading] = useState(true);
  const [allPayloads, setAllPayloads] = useState<Payload[]>([]);
  const [recentPayloads, setRecentPayloads] = useState<Payload[]>([]);
  const [selectedPayload, setSelectedPayload] = useState<Payload | null>(null);
  const [replayPayload, setReplayPayload] = useState<Payload | null>(null);
  const [pagination, setPagination] = useState<PaginatedResponse | null>(null);
  const [page, setPage] = useState(1);
  const [hookFilter, setHookFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  // Create webhook endpoint on mount (persist in localStorage)
  useEffect(() => {
    const stored = localStorage.getItem("wh_hook_uuid");
    if (stored) {
      setHookUrl(`${window.location.origin}/hooks/${stored}`);
      setHookLoading(false);
      return;
    }
    fetch("/hooks/new", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        const url = `${window.location.origin}/hooks/${data.hook_uuid}`;
        localStorage.setItem("wh_hook_uuid", data.hook_uuid);
        setHookUrl(url);
        setHookLoading(false);
      })
      .catch(() => {
        setHookUrl("http://localhost:8000/hooks/{your-uuid}");
        setHookLoading(false);
      });
  }, []);

  // SSE: receive new payloads in real time
  const handleNewPayload = useCallback((p: Payload) => {
    setRecentPayloads((prev) => [p, ...prev].slice(0, 50));
    setAllPayloads((prev) => [p, ...prev].slice(0, 500));
  }, []);

  const sseConnected = useSSE(handleNewPayload);

  // Fetch paginated history
  const fetchHistory = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", "20");
    if (hookFilter) params.set("hook_uuid", hookFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (searchText) params.set("search", searchText);

    try {
      const res = await fetch(`/payloads?${params}`);
      const data: PaginatedResponse = await res.json();
      setAllPayloads(data.payloads);
      setPagination(data);
    } catch {
      // ignore
    }
  }, [page, hookFilter, methodFilter, searchText]);

  // Fetch on filter/page change
  useEffect(() => {
    if (tab === "history") {
      fetchHistory();
    }
  }, [tab, page, hookFilter, methodFilter, searchText, fetchHistory]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [hookFilter, methodFilter, searchText]);

  const handleSelectPayload = (p: Payload) => {
    setSelectedPayload(p);
  };

  const handleExport = async () => {
    if (!selectedPayload) return;
    try {
      const res = await fetch(`/export/${selectedPayload.id}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `webhook-${selectedPayload.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  // Keyboard shortcuts — refs avoid re-registering listener on every render
  const shortcutsRef = useRef({ tab, recentPayloads, allPayloads, selectedPayload, replayPayload });
  shortcutsRef.current = { tab, recentPayloads, allPayloads, selectedPayload, replayPayload };
  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutsRef.current;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (s.replayPayload) return;

      const list = s.tab === "live" ? s.recentPayloads : s.allPayloads;
      if (list.length === 0) return;

      const currentIdx = s.selectedPayload
        ? list.findIndex((p) => p.id === s.selectedPayload!.id)
        : -1;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(currentIdx + 1, list.length - 1);
          setSelectedPayload(list[Math.max(0, next)]);
          break;
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault();
          const prevIdx = currentIdx <= 0 ? list.length - 1 : currentIdx - 1;
          setSelectedPayload(list[prevIdx]);
          break;
        }
        case "r": {
          if (s.selectedPayload) {
            e.preventDefault();
            setReplayPayload(s.selectedPayload);
          }
          break;
        }
        case "e": {
          if (s.selectedPayload) {
            e.preventDefault();
            handleExportRef.current();
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">
            tap
          </h1>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setTab("live")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tab === "live"
                  ? "bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                Live
              </button>
              <button
                onClick={() => setTab("history")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  tab === "history"
                    ? "bg-white dark:bg-gray-700 dark:text-gray-100 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              History
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hookLoading ? (
            <code className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
              Creating endpoint...
            </code>
          ) : hookUrl && (
            <code className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
              <span className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-500" : "bg-red-400"}`} />
              {hookUrl}
            </code>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left panel - list or live feed */}
        <aside className="w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900/50 p-3 overflow-hidden">
          {tab === "live" ? (
            recentPayloads.length > 0 ? (
              <LiveFeed payloads={recentPayloads} selectedId={selectedPayload?.id ?? null} onSelect={handleSelectPayload} />
            ) : (
              <EmptyState hookUrl={hookUrl} />
            )
          ) : (
            <PayloadList
              payloads={allPayloads}
              selectedId={selectedPayload?.id ?? null}
              onSelect={handleSelectPayload}
              pagination={pagination}
              onPage={setPage}
              hookFilter={hookFilter}
              onHookFilter={setHookFilter}
              methodFilter={methodFilter}
              onMethodFilter={setMethodFilter}
              searchText={searchText}
              onSearchText={setSearchText}
              onRefresh={fetchHistory}
            />
          )}
        </aside>

        {/* Right panel - detail */}
        <section className="flex-1 p-4 overflow-hidden flex flex-col bg-white dark:bg-gray-950">
          {selectedPayload ? (
            <PayloadDetail
              payload={selectedPayload}
              onReplay={() => setReplayPayload(selectedPayload)}
              onExport={handleExport}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
              <div className="text-center">
                <p className="text-base font-medium mb-1">Choose a request to inspect</p>
                <p className="text-sm">Select a payload from the list or send a webhook</p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Replay modal */}
      {replayPayload && (
        <ReplayModal
          payload={replayPayload}
          onClose={() => setReplayPayload(null)}
        />
      )}
    </div>
  );
}
