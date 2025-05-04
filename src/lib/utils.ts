
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
 *
 * @param url - The URL string to resolve (can be relative starting with '/' or absolute).
 * @returns The absolute URL or undefined if the input was null/undefined.
 */
export const resolveMediaUrl = (url: string | null | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    // Check if it's already an absolute URL
    new URL(url);
    // Check if it's a URL for the specific media server before trying to resolve
    if (url.startsWith(MEDIA_BASE_URL)) {
        return url;
    }
    // Check if it's a firebase storage url
    if (url.startsWith('https://firebasestorage.googleapis.com')) {
        return url;
    }
    // If it's any other absolute URL, return it as is.
    return url;
  } catch (_) {
    // It's likely a relative path (or invalid, but we'll prepend anyway)
    // Only prepend if it starts with '/' to avoid modifying potential filenames or other relative paths
    if (url.startsWith('/')) {
      return `${MEDIA_BASE_URL}${url}`;
    }
    // If it's not absolute and not starting with '/', return it as is.
    // It might be a relative path not intended for the media server or an invalid input.
    return url;
  }
};

/**
 * Checks if a URL belongs to files.fm.
 * @param url - The URL string to check.
 * @returns True if the hostname is files.fm, false otherwise.
 */
export const isFilesFmUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === 'files.fm';
    } catch (e) {
        // Invalid URL format
        return false;
    }
};

/**
 * Checks if a URL belongs to mdundo.com.
 * @param url - The URL string to check.
 * @returns True if the hostname is mdundo.com, false otherwise.
 */
export const isMdundoUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === 'mdundo.com';
    } catch (e) {
        // Invalid URL format
        return false;
    }
};


/**
 * Basic check if a URL likely points directly to an audio file based on extension.
 * Allows localhost for testing. Excludes known non-direct sources like files.fm and mdundo.com.
 * @param url - The URL string to check.
 * @returns True if the URL likely points to a direct audio file, false otherwise.
 */
export const isDirectAudioUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    // Exclude known non-direct sources first
    if (isFilesFmUrl(url) || isMdundoUrl(url)) {
        return false;
    }
    try {
        const parsedUrl = new URL(url);
        // Allow localhost for testing
        if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
             return true;
        }
        // Simple check based on file extension in the pathname
        const hasAudioExtension = /\.(mp3|wav|ogg|aac|m4a|opus)$/i.test(parsedUrl.pathname);
         // Allow URLs from specific trusted CDNs or services if necessary
         // Example: Allow soundcloud direct streams (though these URLs might be complex/temporary)
         const isSoundCloudStream = parsedUrl.hostname.endsWith('soundcloud.com') && parsedUrl.pathname.includes('/stream');

         // Allow URLs from the media server
         const isMediaServer = parsedUrl.hostname === 'movies-server-plia.onrender.com';

         return hasAudioExtension || isSoundCloudStream || isMediaServer;
    } catch (e) {
        // Invalid URL format
        return false;
    }
};

