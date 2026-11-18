/** Shared domain types for the NexusScope control plane. */

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: string;
  created_at: string;
}

/**
 * A stored inspection.
 *
 * The full report lives in `report` (jsonb) so the shape can evolve without a
 * migration; the flat columns are the cheap filters the history view needs.
 */
export interface InspectionRecord {
  id: string;
  owner_id: string;
  input_url: string;
  final_url: string;
  host: string;
  status_code: number | null;
  title: string | null;
  description: string | null;
  report: unknown;
  duration_ms: number | null;
  payload_count: number;
  note: string | null;
  created_at: string;
}
