import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface User extends FirebaseUser {
  // Add any additional custom user properties if needed
}

export interface Message {
  id: string;
  text: string;
  timestamp: Timestamp;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}
