export type WeddingAlbum = {
  id: string;
  wedding_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  welcome_message: string;
  event_date: string | null;
  is_active: boolean;
  uploads_enabled: boolean;
  gallery_enabled: boolean;
  live_enabled: boolean;
  moderation_enabled: boolean;
  allow_videos: boolean;
  max_photo_mb: number;
  max_video_mb: number;
  max_video_seconds: number;
  live_interval_seconds: number;
  show_guest_names: boolean;
  missions_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AlbumMedia = {
  id: string;
  album_id: string;
  wedding_id: string;
  media_type: "photo" | "video";
  guest_name: string | null;
  uploader_session_id: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  preview_mime_type: string;
  upload_state: "uploading" | "ready" | "failed";
  moderation_status: "pending" | "approved" | "hidden" | "rejected";
  show_in_gallery: boolean;
  show_in_live: boolean;
  favorite: boolean;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AlbumMission = {
  id: string;
  album_id: string;
  wedding_id: string;
  title: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
