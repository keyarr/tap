import { useEffect, useRef, useState } from "react";
import type { Payload } from "../types";

interface Props {
  payload: Payload;
  onClose: () => void;
}

interface ReplayResult {
  success: boolean;
  status_code?: number;
  error?: string;
  response_headers?: Record<string, string>;
  response_body?: string;
}

function generateHmacSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ReplayModal({ payload, onClose }: Props) {
  const [targetUrl, setTargetUrl] = useState("");
  const [addHmac, setAddHmac] = useState(false);
  const [hmacSecret, setHmacSecret] = useState(() => generateHmacSecret());
  const [customHeaders, setCustomHeaders] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount: cancel in-flight request
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const parseHeaders = (raw: string): Record<string, string> => {
    const h: Record<string, string> = {};
    if (!raw.trim()) return h;
    raw.split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        h[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });
    return h;
  };

  const sendReplay = async () => {
    if (!targetUrl) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResult(null);
    try {
      const headers = parseHeaders(customHeaders);
      const res = await fetch(`/replay/${payload.id}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_url: targetUrl,
          headers,
          add_hmac: addHmac,
          hmac_secret: addHmac ? hmacSecret : undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setResult({ success: false, error: "Cancelled" });
      } else {
        setResult({ success: false, error: String(err) });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Replay Webhook #{payload.id}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg leading-none">&times;</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
          {payload.method} → {payload.hook_uuid}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Target URL *</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Custom Headers <span className="text-gray-400">(one per line: Key: Value)</span>
            </label>
            <textarea
              value={customHeaders}
              onChange={(e) => setCustomHeaders(e.target.value)}
              placeholder="X-Custom-Header: value"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addHmac"
              checked={addHmac}
              onChange={(e) => setAddHmac(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="addHmac" className="text-sm text-gray-700 dark:text-gray-300">
              Add Stripe-style HMAC signature
            </label>
          </div>

          {addHmac && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">HMAC Secret</label>
              <input
                type="text"
                value={hmacSecret}
                onChange={(e) => setHmacSecret(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono"
              />
            </div>
          )}

          {/* Action row: Send + Cancel */}
          <div className="flex gap-2">
            <button
              onClick={sendReplay}
              disabled={loading || !targetUrl}
               className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending..." : "Send Replay Request"}
            </button>
            {loading && (
              <button
                onClick={handleCancel}
                className="py-2 px-4 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`mt-4 p-4 rounded-lg border ${
            result.success
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          }`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">
                {result.success ? `Response: ${result.status_code}` : "Failed"}
              </p>
              {!result.success && !loading && (
                <button
                  onClick={sendReplay}
                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
            {result.error && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono mb-2">{result.error}</p>
            )}
            {result.response_body && (
              <pre className="text-xs font-mono bg-white dark:bg-gray-800 rounded p-2 max-h-40 overflow-auto">
                {result.response_body.slice(0, 2000)}
              </pre>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
