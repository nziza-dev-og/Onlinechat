
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface User extends FirebaseUser {
  // Add any additional custom user properties if needed
}

export interface Message {
  id: string;
  text: string;
  timestamp: Timestamp; // Firestore typically returns Timestamps
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

// Added UserProfile type
export interface UserProfile {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    status?: string | null; // Added optional status field
    // Allow Date for input, Firestore converts to Timestamp. Reading will likely be Timestamp.
    lastSeen?: Timestamp | Date;
    createdAt?: Timestamp | Date;
}

// Added Post type
export interface Post {
    id: string;
    uid: string; // User ID of the author
    displayName: string | null; // Author's display name at time of posting
    photoURL: string | null; // Author's photo URL at time of posting
    text?: string | null; // Optional text content
    imageUrl?: string | null; // Optional image URL
    videoUrl?: string | null; // Optional video URL
    timestamp: Timestamp; // Firestore Timestamp of creation
}


