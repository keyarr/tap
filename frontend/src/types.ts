export interface Payload {
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

export interface PaginatedResponse {
  payloads: Payload[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
