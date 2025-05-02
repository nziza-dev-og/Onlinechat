
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
    // Allow Date for input, Firestore converts to Timestamp. Reading will likely be Timestamp.
    lastSeen?: Timestamp | Date;
    createdAt?: Timestamp | Date;
}
