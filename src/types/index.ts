
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface User extends FirebaseUser {
  // Add any additional custom user properties if needed
  // We might add the isAdmin flag here eventually if needed directly on the auth object via custom claims
}

export interface Message {
  id: string;
  text: string;
  timestamp: Timestamp; // Firestore typically returns Timestamps
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  imageUrl?: string | null; // Optional image URL for chat messages
  audioUrl?: string | null; // Optional audio URL for voice notes
  videoUrl?: string | null; // Optional video URL for chat messages
  fileUrl?: string | null; // Optional URL for generic files
  fileName?: string | null; // Optional original filename
  fileType?: string | null; // Optional MIME type for generic files
  fileSize?: number | null; // Optional file size in bytes
  // Fields for reply functionality
  replyToMessageId?: string | null;
  replyToMessageText?: string | null; // Can be text, 'Image', 'Voice note', 'Video', or 'File'
  replyToMessageAuthor?: string | null;
}

// UserProfile type remains unchanged
export interface UserProfile {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    status?: string | null;
    // Allow Date for input, Firestore converts to Timestamp. Reading will likely be Timestamp.
    lastSeen?: Timestamp | Date;
    createdAt?: Timestamp | Date;
    isAdmin?: boolean; // Flag to identify administrators
    // Flags for custom password change flow
    passwordChangeRequested?: boolean;
    passwordChangeApproved?: boolean;
}


// Original Post type - might still be used internally where Timestamp object is okay
export interface Post {
    id: string;
    uid: string; // User ID of the author
    displayName: string | null; // Author's display name at time of posting
    photoURL: string | null; // Author's photo URL at time of posting
    text?: string | null; // Optional text content
    imageUrl?: string | null; // Optional image URL
    videoUrl?: string | null; // Optional video URL
    musicUrl?: string | null; // Optional background music URL (for stories)
    musicStartTime?: number | null; // Optional start time in seconds for music
    musicEndTime?: number | null; // Optional end time in seconds for music
    type?: 'post' | 'story'; // Added type field
    tags?: string[]; // For hashtags
    mentions?: string[]; // For user UIDs mentioned (advanced)
    timestamp: Timestamp | Date; // Can be Timestamp or Date (e.g., for optimistic updates)
    likeCount?: number; // Number of likes
    likedBy?: string[]; // Array of UIDs who liked the post
    commentCount?: number; // Number of comments
    saveCount?: number; // Number of saves
    savedBy?: string[]; // Array of UIDs who saved the post
}

// New Post type with serializable timestamp for passing to Client Components
export interface PostSerializable {
    id: string;
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    text?: string | null;
    imageUrl?: string | null;
    videoUrl?: string | null;
    musicUrl?: string | null; // Optional background music URL (for stories)
    musicStartTime?: number | null; // Optional start time in seconds for music
    musicEndTime?: number | null; // Optional end time in seconds for music
    type?: 'post' | 'story'; // Make sure this is included
    tags?: string[]; // For hashtags
    mentions?: string[]; // For user UIDs mentioned (advanced) - keep as string for now if not linking
    timestamp: string; // Use ISO string for serialization
    likeCount?: number;
    likedBy?: string[];
    commentCount?: number;
    saveCount?: number; // Number of saves
    savedBy?: string[]; // Array of UIDs who saved the post
}

// Interface representing the structure of the main chat document in Firestore (`chats/{chatId}`)
export interface Chat {
  id: string; // The chat ID (e.g., user1_user2)
  participants: string[]; // Array of user UIDs participating in the chat
  createdAt: Timestamp;
  typing?: {
    [userId: string]: boolean; // Map of userId to typing status (true if typing)
  };
  // Add other chat-level metadata if needed
}

// Interface for comments on a post
export interface Comment {
  id: string;
  postId: string; // ID of the post this comment belongs to
  uid: string; // User ID of the commenter
  displayName: string | null; // Commenter's display name
  photoURL: string | null; // Commenter's photo URL
  text: string; // Comment text
  timestamp: Timestamp | Date; // Timestamp of the comment
}

// Serializable version of Comment
export interface CommentSerializable {
  id: string;
  postId: string;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  text: string;
  timestamp: string; // ISO string
}

// Interface for messages sent to admin
export interface AdminMessage {
    id: string;
    senderUid: string;
    senderName: string | null;
    senderEmail: string | null;
    message: string;
    timestamp: string; // ISO string for serialization
    isRead: boolean;
    // Add reply fields if needed
    reply?: string | null;
    repliedAt?: string | null; // ISO string
    repliedBy?: string | null; // Admin UID
}

// Interface for serializable notification data passed to the client.
export interface NotificationSerializable {
    id: string;
    message: string;
    timestamp: string; // ISO string
    isGlobal: boolean;
    targetUserId?: string | null;
    isRead?: boolean; // Only relevant for targeted
    senderId?: string | null; // Optional sender info
}


// --- WebRTC Signaling Types ---
export interface SignalingOffer {
  senderId: string;
  type: 'offer';
  payload: RTCSessionDescriptionInit;
  timestamp?: object; // Use serverTimestamp() for RTDB
}

export interface SignalingAnswer {
  senderId: string;
  type: 'answer';
  payload: RTCSessionDescriptionInit;
  timestamp?: object;
}

export interface SignalingCandidate {
  senderId: string;
  type: 'candidate';
  payload: RTCIceCandidateInit | null; // Allow null candidate for end-of-candidates signal
  timestamp?: object;
}

export type SignalingMessage = SignalingOffer | SignalingAnswer | SignalingCandidate;
// --- End WebRTC Signaling Types ---


// --- Platform Configuration Types ---
export interface MusicPlaylistItem {
    id: string; // Unique ID for the track (can be Firestore doc ID or hardcoded ID)
    title: string;
    url: string;
    // Add optional duration if you pre-process files, helps with trimming UI
    duration?: number; // Duration in seconds
}

export interface PlatformConfig {
  allowEmoji?: boolean;
  allowFileUploads?: boolean;
  musicPlaylist: MusicPlaylistItem[]; // Playlist is now required and always included
  // Add other config fields here (e.g., theme, logoUrl)
}
// --- End Platform Configuration Types ---

// --- Define the UserProfileUpdateData type ---
// This type should match the definition in user-profile.service.ts
// or be imported from there if possible (though importing server code to client might be tricky).
export type UserProfileUpdateData = {
    displayName?: string | null;
    photoURL?: string | null;
    status?: string | null;
    lastSeen?: 'SERVER_TIMESTAMP';
    // Password change flags can be updated by specific actions, but not generally
    passwordChangeRequested?: boolean;
    passwordChangeApproved?: boolean;
} & {
    uid?: never;
    email?: never;
    createdAt?: never;
    isAdmin?: never; // Explicitly prevent isAdmin updates via this general function
};

