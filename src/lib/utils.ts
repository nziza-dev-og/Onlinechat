
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates initials from a name string.
 *
 * @param name - The name string (e.g., "John Doe", "Jane", null, undefined).
 * @returns The initials (e.g., "JD", "J") or "?" if the name is invalid.
 */
export const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      // Use first letter of the first and last parts
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      // Use the first letter of the single part
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback for empty or invalid names
};

// Base URL for the media server (if used, currently only picsum placeholders)
// const MEDIA_BASE_URL = 'https://movies-server-plia.onrender.com'; // Example, adjust if needed

/**
 * Resolves a potentially relative media URL. Currently configured for picsum placeholders
 * and Firebase Storage URLs.
 *
 * @param url - The URL string to resolve (can be relative starting with '/', absolute, or other valid URL).
 * @returns The absolute URL or undefined if the input was null/undefined.
 */
export const resolveMediaUrl = (url: string | null | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    // Check if it's already an absolute URL (this will throw if it's not a valid URL structure)
    new URL(url);
    // If it's a valid URL (absolute or protocol-relative), return it directly.
    // This covers cases like https://..., http://..., //..., etc.
    // Firebase storage URLs are absolute and will pass this.
    return url;
  } catch (_) {
    // If it's not a standard absolute URL, it might be a relative path or invalid.
    // Since we aren't currently using a relative media server path, we assume
    // anything not passing the new URL() check is either invalid or a special scheme
    // like 'blob:' or 'data:'. We return it as is.
    // If you were using a media server with relative paths starting with '/', you'd handle it here:
    // if (url.startsWith('/')) {
    //   return `${MEDIA_BASE_URL}${url}`;
    // }
    return url;
  }
};

/**
 * Stricter check if a URL likely points directly to an audio file based on extension
 * or comes from a known direct-serving host.
 * It avoids common web player/streaming site URLs that won't work with <audio>.
 * @param url - The URL string to check.
 * @returns True if the URL likely points to a direct audio file or playable stream, false otherwise.
 */
export const isDirectAudioUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;

    try {
        // 1. Handle special schemes immediately
        if (url.startsWith('blob:') || url.startsWith('data:')) {
            return true;
        }

        // 2. Parse the URL
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const pathname = parsedUrl.pathname;

        // 3. Check hostname for known DIRECT-playable sources
        const knownDirectHosts = [
            'firebasestorage.googleapis.com',
            'storage.googleapis.com', // Google Cloud Storage
            // Add specific CDN hostnames known to serve direct audio files
            // Example: 'cdn.example-audio.com'
        ];
        if (hostname === 'localhost' || hostname === '127.0.0.1' || knownDirectHosts.some(host => hostname.endsWith(host))) {
             // console.log("URL identified as known direct host or localhost:", hostname);
            return true;
        }

        // 4. Simple check based on file extension in the pathname
        // This is less reliable but a good indicator for direct files.
        const hasAudioExtension = /\.(mp3|wav|ogg|aac|m4a|opus|webm)$/i.test(pathname);
        if (hasAudioExtension) {
            // console.log("URL has direct audio file extension:", pathname);
            return true;
        }

        // 5. If none of the above, assume it's likely not a direct audio link
        // This will exclude SoundCloud, Files.fm, Mdundo, Audiomack, YouTube page URLs etc.
        // console.log("URL did not match known direct patterns:", url);
        return false;

    } catch (e) {
        // Invalid URL format
        // console.warn(`Could not parse URL for direct audio check: ${url}`, e);
        return false;
    }
};
