import type { Payload } from "../types";
import JsonView from "./JsonView";
import StatusBadge from "./StatusBadge";

interface Props {
  payload: Payload;
  onReplay: () => void;
  onExport: () => void;
}

function HeaderRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-xs font-mono py-0.5">
      <span className="text-gray-500 dark:text-gray-400 min-w-[180px] flex-shrink-0">{k}:</span>
      <span className="text-gray-700 dark:text-gray-300 break-all">{v}</span>
    </div>
  );
}

export default function PayloadDetail({ payload, onReplay, onExport }: Props) {
  const bodyData = payload.body
    ? (() => { try { return JSON.parse(payload.body); } catch { return null; } })()
    : null;

  const displayBody = bodyData ?? payload.raw_body ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
            {payload.method}
          </span>
          <StatusBadge code={payload.status_code} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReplay}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Replay
          </button>
          <button
            onClick={onExport}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mb-4 flex-shrink-0">
        <span>ID: {payload.id}</span>
        <span className="mx-2">|</span>
        <span>{new Date(payload.timestamp).toLocaleString()}</span>
        {payload.source_ip && (
          <>
            <span className="mx-2">|</span>
            <span>IP: {payload.source_ip}</span>
          </>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        {/* Headers */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Headers
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            {Object.entries(payload.headers).map(([k, v]) => (
              <HeaderRow key={k} k={k} v={v} />
            ))}
          </div>
        </div>

        {/* Query Params */}
        {Object.keys(payload.query_params).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Query Parameters
            </h4>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              {Object.entries(payload.query_params).map(([k, v]) => (
                <HeaderRow key={k} k={k} v={v} />
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Body
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-[50vh] overflow-auto">
            {displayBody ? (
              <JsonView data={bodyData} raw={payload.raw_body} />
            ) : (
              <span className="text-gray-400 italic">(empty body)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
