export interface Settings {
  neu_dir: string;
  dj_root: string;
  dry_run: boolean;
  known_genres: string[];
}

export interface ScanTrack {
  track_name: string;
  track_path: string;
  found_in_rekordbox: boolean;
  detected_genre: string | null;
  date_added: string;
}

export interface ScanResult {
  tracks: ScanTrack[];
  neu_dir_missing: boolean;
}

export type PlanSource = "mytag" | "user" | "skip";

export interface PlanItem {
  track_name: string;
  track_path: string;
  genre: string | null;
  source: PlanSource;
  write_mytag: boolean;
  previous_genre: string | null;
  target_path: string | null;
  warnings: string[];
}

export type ExecuteStatus = "moved" | "skipped" | "dry_run";

export interface ExecuteResult {
  track_name: string;
  status: ExecuteStatus;
}

export type GenreChoices = Record<string, string>;

export interface PlanParams {
  genreChoices: GenreChoices;
  selectedTracks: string[];
}

export interface DjApi {
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<{ saved: boolean }>;
  scan(): Promise<ScanResult>;
  plan(params: PlanParams): Promise<{ plan: PlanItem[] }>;
  execute(params: PlanParams): Promise<{ results: ExecuteResult[] }>;
  syncGenres(): Promise<{ known_genres: string[] }>;
  pickFolder(): Promise<string | null>;
  onSidecarCrash(callback: (code: number) => void): void;
}

declare global {
  interface Window {
    djApi: DjApi;
  }
}
