
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
    return url; // It's absolute, use it as is
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
 * Basic check if a URL likely points directly to an audio file based on extension.
 * Allows localhost for testing.
 * @param url - The URL string to check.
 * @returns True if the URL likely points to a direct audio file, false otherwise.
 */
export const isDirectAudioUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    try {
        const parsedUrl = new URL(url);
        // Allow localhost for testing
        if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
             return true;
        }
        // Simple check based on file extension in the pathname
        const hasAudioExtension = /\.(mp3|wav|ogg|aac|m4a|opus)$/i.test(parsedUrl.pathname);
         // Allow URLs from specific trusted CDNs or services if necessary
         // const isTrustedSource = ['some-cdn.com'].includes(parsedUrl.hostname);
         // return hasAudioExtension || isTrustedSource;
         return hasAudioExtension;
    } catch (e) {
        // Invalid URL format
        return false;
    }
};
