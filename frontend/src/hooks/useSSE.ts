import { useEffect, useRef, useState } from "react";

interface Payload {
  id: number;
  hook_uuid: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  raw_body: string | null;
  query_params: Record<string, string>;
  source_ip: string | null;
  timestamp: string;
  status_code: number;
}

export function useSSE(onPayload: (p: Payload) => void) {
  const cbRef = useRef(onPayload);
  cbRef.current = onPayload;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const evtSource = new EventSource("/stream");

    evtSource.addEventListener("new_payload", (e) => {
      try {
        const data = JSON.parse(e.data) as Payload;
        cbRef.current(data);
      } catch {
        // ignore parse errors
      }
    });

    evtSource.onopen = () => setConnected(true);
    evtSource.onerror = () => setConnected(false);

    return () => evtSource.close();
  }, []);

  return connected;
}
