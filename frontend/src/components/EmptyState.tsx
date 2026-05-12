interface Props {
  hookUrl?: string;
}

export default function EmptyState({ hookUrl }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 mb-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-300">
        Waiting for webhooks...
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
        Point your webhook sender to the URL below and payloads will appear here in real time.
      </p>
      {hookUrl && (
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 w-full max-w-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Your webhook endpoint:</p>
          <code className="text-sm font-mono text-blue-600 dark:text-blue-400 break-all select-all">
            {hookUrl}
          </code>
        </div>
      )}
      <div className="mt-8 text-sm text-gray-400 dark:text-gray-500">
        <p>Try sending a test payload with curl:</p>
        <pre className="mt-2 bg-gray-100 dark:bg-gray-800 rounded p-3 text-xs font-mono text-left">
          {`curl -X POST ${hookUrl || "http://localhost:8000/hooks/{your-uuid}"} \\\n  -H "Content-Type: application/json" \\\n  -d '{"event": "checkout.session.completed", "data": {"id": "cs_test_123"}}'`}
        </pre>
      </div>
    </div>
  );
}
