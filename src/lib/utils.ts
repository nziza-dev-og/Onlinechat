
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

// Base URL for the media server
const MEDIA_BASE_URL = 'https://movies-server-plia.onrender.com';

/**
 * Resolves a potentially relative media URL by prepending the base media server URL.
 * If the input URL is already absolute, it's returned as is.
 * If the input URL is not absolute and does not start with '/', it's assumed to be a valid URL and returned directly.
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
    // It's not a standard absolute URL. Check if it's a relative path meant for the media server.
    if (url.startsWith('/')) {
      return `${MEDIA_BASE_URL}${url}`;
    }
    // If it's not absolute and not starting with '/', return it as is.
    // It might be a relative path not intended for the media server, an invalid input,
    // or a special scheme like 'blob:' or 'data:'.
    return url;
  }
};

/**
 * Basic check if a URL likely points directly to an audio file based on extension
 * or comes from a known streaming/storage source that might work with the <audio> tag.
 * This is a heuristic and might not cover all cases perfectly.
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

        // 3. Check hostname for known direct-playable sources (add more as needed)
        const knownDirectHosts = [
            'firebasestorage.googleapis.com',
            // Add specific CDN hostnames known to serve direct audio files
            'storage.googleapis.com', // Google Cloud Storage
             // Example: 'cdn.example-audio.com'
        ];
        if (knownDirectHosts.some(host => parsedUrl.hostname.endsWith(host))) {
            return true;
        }

        // 4. Allow localhost and specific media server
        if (parsedUrl.hostname === 'localhost' ||
            parsedUrl.hostname === '127.0.0.1' ||
            parsedUrl.hostname === 'movies-server-plia.onrender.com') {
             return true;
        }

        // 5. Simple check based on file extension in the pathname
        // This is less reliable as URLs might not have extensions.
        const hasAudioExtension = /\.(mp3|wav|ogg|aac|m4a|opus)$/i.test(parsedUrl.pathname);
        if (hasAudioExtension) {
            return true;
        }

        // 6. Check for known streaming service patterns that might work (example: SoundCloud)
        // Note: These are fragile and might break if the services change their URL structures.
        // const isSoundCloudStream = parsedUrl.hostname.endsWith('soundcloud.com') && parsedUrl.pathname.includes('/stream');
        // if (isSoundCloudStream) return true;

        // 7. If none of the above, assume it's likely not a direct audio link
        // This will include pages like files.fm, mdundo.com, audiomack.com etc.
        return false;

    } catch (e) {
        // Invalid URL format
        console.warn(`Could not parse URL for direct audio check: ${url}`, e);
        return false;
    }
};
