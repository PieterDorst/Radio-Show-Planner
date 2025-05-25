
export interface Song {
  id: string;
  title: string;
  artist: string;
  uploadedAt: number; // Timestamp
  lastUsedInShowDetails: {
    showId: string;
    showCreatedAt: number; // Timestamp of the show it was used in
  } | null;
  fileName?: string; // Optional: store original filename
  durationSeconds: number; // Duration of the song in seconds
}

export interface Show {
  id: string;
  name: string;
  createdAt: number; // Timestamp
  songIds: string[];
  totalDurationSeconds?: number; // Optional: store total duration of the show
  intendedHours?: number; // Stores the original intended hours for the show
}

export enum View {
  SONGS = 'SONGS',
  SHOWS = 'SHOWS',
}

export interface StagedSong {
  tempId: string; // For React key and local manipulation
  file: File;
  title: string;
  artist: string;
  fileName: string;
  durationSeconds?: number;
  isLoading: boolean; // True if either tags or duration are being fetched
  error?: string; // Combined error message for tags/duration
}

export interface AppSettings {
  targetSongMinutesPerHour: number; // Range: 10 to 60
  showCreationMode: 'duration' | 'count'; // Method to create shows
  targetSongsPerHour: number; // Target songs per hour if mode is 'count' (e.g., 1-20)
}
