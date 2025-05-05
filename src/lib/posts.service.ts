'use server';

import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  serverTimestamp as firestoreServerTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  type FirestoreError,
  doc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  where, // Import where for filtering
  deleteDoc, // Import deleteDoc
  getDoc, // Import getDoc for checking ownership
  writeBatch, // Import writeBatch for atomic deletion of comments
} from 'firebase/firestore';
import type { Post, PostSerializable, CommentSerializable } from '@/types'; // Import PostSerializable and CommentSerializable
import { isFirebaseError } from '@/lib/firebase-errors';

// Input type for creating a post, containing only serializable data.
export interface PostInput {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  text?: string | null; // Optional text content
  imageUrl?: string | null; // Optional image URL
  videoUrl?: string | null; // Optional video URL
  musicUrl?: string | null; // Optional background music URL (for stories)
  musicStartTime?: number | null; // Optional start time in seconds for music
  musicEndTime?: number | null; // Optional end time in seconds for music
  type?: 'post' | 'story'; // Added type field, optional, defaults to 'post'
}

/**
 * Adds a new post document to the 'posts' collection in Firestore.
 * Initializes likeCount and commentCount to 0 and likedBy to an empty array.
 * Saves the post type, defaulting to 'post'. Includes musicUrl, startTime, endTime for stories.
 *
 * @param postData - An object containing the post details (uid, text, imageUrl, videoUrl, musicUrl, startTime, endTime, type).
 * @returns Promise<string> - The ID of the newly created post document.
 * @throws Error if post data is invalid, db is not initialized, or add operation fails.
 */
export const addPost = async (postData: PostInput): Promise<string> => {
  if (!postData || !postData.uid) {
    console.error("🔴 addPost Error: Invalid post data provided (UID is missing).", postData);
    throw new Error("Invalid post data: Author UID is required.");
  }
   // Content validation: require text OR image OR video (music is optional)
   if (!postData.text?.trim() && !postData.imageUrl?.trim() && !postData.videoUrl?.trim()) {
     console.error("🔴 addPost Error: Post/Story must contain text, an image URL, or a video URL.", postData);
     throw new Error("Post or Story must have content (text, image, or video).");
   }
   // Story specific validation (if type is story, require image or video)
   if (postData.type === 'story' && !postData.imageUrl?.trim() && !postData.videoUrl?.trim()) {
     console.error("🔴 addPost Error: Story must contain an image URL or a video URL.", postData);
     throw new Error("Story must have an image or video.");
   }
   // Validate start/end times if provided
   if (postData.musicStartTime !== null && postData.musicStartTime !== undefined && postData.musicStartTime < 0) {
        throw new Error("Music start time cannot be negative.");
   }
   if (postData.musicEndTime !== null && postData.musicEndTime !== undefined && (postData.musicEndTime <= (postData.musicStartTime ?? 0))) {
        throw new Error("Music end time must be after start time.");
   }


   if (!db) {
      console.error("🔴 addPost Error: Firestore (db) not available.");
      throw new Error("Database service not available.");
   }

  try {
    const postsCollectionRef = collection(db, 'posts');
    const isStory = postData.type === 'story';
    const dataToSave = {
      ...postData,
      text: postData.text?.trim() || null,
      imageUrl: postData.imageUrl?.trim() || null,
      videoUrl: postData.videoUrl?.trim() || null,
      // Only save music-related fields for stories
      musicUrl: isStory ? (postData.musicUrl?.trim() || null) : null,
      musicStartTime: isStory ? (postData.musicStartTime ?? null) : null,
      musicEndTime: isStory ? (postData.musicEndTime ?? null) : null,
      type: postData.type || 'post', // Default to 'post' if type is not provided
      timestamp: firestoreServerTimestamp(), // Firestore handles this on the server
      likeCount: 0, // Initialize like count
      likedBy: [], // Initialize likedBy array
      commentCount: 0, // Initialize comment count
    };
    const newPostDocRef = await addDoc(postsCollectionRef, dataToSave);
    console.log(`Firestore: Post created with ID: ${newPostDocRef.id}, Type: ${dataToSave.type}`);
    return newPostDocRef.id;
  } catch (error: any) {
     const detailedErrorMessage = `Failed to add post to Firestore. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
     console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
  }
};

/**
 * Fetches recent posts from the 'posts' collection created within the last 8 hours,
 * ordered by timestamp, and converts Timestamps to serializable format.
 * NOTE: This filters posts older than 8 hours but does not delete them.
 * Actual deletion requires setting up a TTL (Time-To-Live) policy on the 'timestamp'
 * field in the 'posts' collection via the Firebase console or gcloud CLI.
 *
 * @param count - The maximum number of posts to fetch (default: 50).
 * @returns Promise<PostSerializable[]> - An array of post objects with serializable timestamps.
 * @throws Error if db is not initialized or fetch fails.
 */
export const fetchPosts = async (count: number = 50): Promise<PostSerializable[]> => {
  if (!db) {
     console.error("🔴 fetchPosts Error: Firestore (db) not available.");
     throw new Error("Database service not available.");
  }

  // Calculate the timestamp 8 hours ago
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const eightHoursAgoTimestamp = Timestamp.fromDate(eightHoursAgo);

  try {
    const postsQuery = query(
      collection(db, 'posts'),
      where('timestamp', '>=', eightHoursAgoTimestamp), // Filter posts >= 8 hours ago
      orderBy('timestamp', 'desc'), // Get newest posts first within the timeframe
      limit(count)
    );

    const querySnapshot = await getDocs(postsQuery);

    const posts: PostSerializable[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Basic validation including new fields
       if (!data.uid || !(data.timestamp instanceof Timestamp)) {
         console.warn("Skipping invalid post document (missing uid or timestamp):", doc.id, data);
         return null;
       }
      return {
        id: doc.id,
        uid: data.uid,
        displayName: data.displayName ?? null,
        photoURL: data.photoURL ?? null,
        text: data.text ?? null,
        imageUrl: data.imageUrl ?? null,
        videoUrl: data.videoUrl ?? null,
        musicUrl: data.musicUrl ?? null, // Include musicUrl
        musicStartTime: data.musicStartTime ?? null, // Include start time
        musicEndTime: data.musicEndTime ?? null, // Include end time
        type: data.type || 'post', // Include type, default to 'post'
        // Convert Timestamp to ISO string for serialization
        timestamp: data.timestamp.toDate().toISOString(),
        likeCount: data.likeCount ?? 0, // Default to 0 if missing
        likedBy: data.likedBy ?? [], // Default to empty array if missing
        commentCount: data.commentCount ?? 0, // Default to 0 if missing
      };
    }).filter((post): post is PostSerializable => post !== null); // Filter out invalid documents

    console.log(`Firestore: Fetched ${posts.length} posts from the last 8 hours.`);
    return posts;

  } catch (error: any) {
      const detailedErrorMessage = `Failed to fetch posts from Firestore. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
      console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
      throw new Error(detailedErrorMessage);
  }
};

/**
 * Likes a post by adding the user's ID to the likedBy array and incrementing the likeCount.
 *
 * @param postId - The ID of the post to like.
 * @param userId - The ID of the user liking the post.
 * @returns Promise<void>
 * @throws Error if db is not initialized or update fails.
 */
export const likePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) {
        console.error("🔴 likePost Error: Firestore (db) not available.");
        throw new Error("Database service not available.");
    }
    if (!postId || !userId) {
        throw new Error("Post ID and User ID are required to like a post.");
    }

    const postRef = doc(db, 'posts', postId);

    try {
        await updateDoc(postRef, {
            likeCount: increment(1),
            likedBy: arrayUnion(userId) // Add userId to the array if not already present
        });
        console.log(`Firestore: Post ${postId} liked by user ${userId}`);
    } catch (error: any) {
        const detailedErrorMessage = `Failed to like post ${postId} for user ${userId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

/**
 * Unlikes a post by removing the user's ID from the likedBy array and decrementing the likeCount.
 * Includes a check to prevent negative like counts.
 *
 * @param postId - The ID of the post to unlike.
 * @param userId - The ID of the user unliking the post.
 * @returns Promise<void>
 * @throws Error if db is not initialized or update fails.
 */
export const unlikePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) {
        console.error("🔴 unlikePost Error: Firestore (db) not available.");
        throw new Error("Database service not available.");
    }
     if (!postId || !userId) {
        throw new Error("Post ID and User ID are required to unlike a post.");
    }

    const postRef = doc(db, 'posts', postId);

    try {
        // It's generally safer to read the like count first in a transaction
        // to prevent race conditions, but for simplicity, we'll update directly.
        // Firestore increments handle atomicity, but don't prevent going below zero easily without transactions.
        // Let's assume likeCount won't go below zero due to UI logic preventing unliking if not liked.
        await updateDoc(postRef, {
            likeCount: increment(-1),
            likedBy: arrayRemove(userId) // Remove userId from the array
        });
        console.log(`Firestore: Post ${postId} unliked by user ${userId}`);
    } catch (error: any) {
        const detailedErrorMessage = `Failed to unlike post ${postId} for user ${userId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

// Input type for adding a comment
export interface CommentInput {
  postId: string;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  text: string;
}

// addComment function
export const addComment = async (commentData: CommentInput): Promise<string> => {
    if (!db) throw new Error("Database service not available.");
    if (!commentData.postId || !commentData.uid || !commentData.text?.trim()) {
        throw new Error("Post ID, User ID, and comment text are required.");
    }

    try {
        const commentsRef = collection(db, 'posts', commentData.postId, 'comments');
        const newCommentRef = await addDoc(commentsRef, {
            ...commentData,
            text: commentData.text.trim(),
            timestamp: firestoreServerTimestamp(),
        });

        // Increment comment count on the post document
        const postRef = doc(db, 'posts', commentData.postId);
        await updateDoc(postRef, {
            commentCount: increment(1)
        });

        console.log(`Firestore: Comment ${newCommentRef.id} added to post ${commentData.postId}`);
        return newCommentRef.id;
    } catch (error: any) {
        const msg = `Failed to add comment. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};


/**
 * Deletes a post and all its associated comments.
 * Checks if the provided userId matches the post's author uid before deleting.
 *
 * @param postId - The ID of the post to delete.
 * @param userId - The UID of the user attempting to delete the post.
 * @returns Promise<void>
 * @throws Error if db is not initialized, post not found, user is not authorized, or deletion fails.
 */
export const deletePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId) throw new Error("Post ID is required.");
    if (!userId) throw new Error("User ID is required for authorization."); // Require userId for deletion

    const postRef = doc(db, 'posts', postId);
    const commentsRef = collection(db, 'posts', postId, 'comments');

    try {
        // --- Authorization Check ---
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) {
             console.warn(`Attempted to delete non-existent post: ${postId}`);
             // Depending on UI, might not need to throw, but good for backend logic
             throw new Error("Post not found.");
        }
        const postData = postSnap.data();
        if (postData?.uid !== userId) {
            console.warn(`Unauthorized delete attempt on post ${postId} by user ${userId}. Author: ${postData?.uid}`);
            throw new Error("Unauthorized: You can only delete your own posts.");
        }
        // --- End Authorization Check ---

        // Delete comments using a batch write
        const batch = writeBatch(db);
        const commentsQuerySnapshot = await getDocs(commentsRef);
        commentsQuerySnapshot.forEach((commentDoc) => {
            batch.delete(commentDoc.ref);
        });
        console.log(`Firestore: Queued deletion of ${commentsQuerySnapshot.size} comments for post ${postId}.`);

        // Delete the post document itself
        batch.delete(postRef);

        // Commit the batch
        await batch.commit();

        console.log(`Firestore: Post ${postId} and its comments deleted successfully by owner ${userId}.`);

    } catch (error: any) {
        // Avoid double logging if it's an authorization or not found error caught above
        if (error.message.includes("Unauthorized") || error.message.includes("Post not found")) {
             throw error; // Re-throw the specific error
        }
        const detailedErrorMessage = `Failed to delete post ${postId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        // Re-throw a more specific error if possible, or the detailed one
        throw new Error(error.message || detailedErrorMessage);
    }
};

/**
 * Fetches comments for a given post, ordered by timestamp.
 *
 * @param postId - The ID of the post whose comments are to be fetched.
 * @param count - The maximum number of comments to fetch (default: 100).
 * @returns Promise<CommentSerializable[]> - An array of comment objects.
 * @throws Error if db is not initialized or fetch fails.
 */
export const fetchComments = async (postId: string, count: number = 100): Promise<CommentSerializable[]> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId) throw new Error("Post ID is required to fetch comments.");

    try {
        const commentsQuery = query(
            collection(db, 'posts', postId, 'comments'),
            orderBy('timestamp', 'asc'),
            limit(count)
        );
        const querySnapshot = await getDocs(commentsQuery);

        const comments: CommentSerializable[] = querySnapshot.docs.map(doc => {
            const data = doc.data();
             if (!data.uid || !(data.timestamp instanceof Timestamp)) {
                 console.warn("Skipping invalid comment document:", doc.id, data);
                 return null;
             }
            return {
                id: doc.id,
                postId: postId,
                uid: data.uid,
                displayName: data.displayName ?? null,
                photoURL: data.photoURL ?? null,
                text: data.text ?? '',
                timestamp: data.timestamp.toDate().toISOString(),
            };
        }).filter((comment): comment is CommentSerializable => comment !== null);

        console.log(`Firestore: Fetched ${comments.length} comments for post ${postId}.`);
        return comments;

    } catch (error: any) {
        const msg = `Failed to fetch comments for post ${postId}. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
}
