
'use server';

import { db, auth } from '@/lib/firebase';
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
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
}

/**
 * Adds a new post document to the 'posts' collection in Firestore.
 * Initializes likeCount and commentCount to 0 and likedBy to an empty array.
 *
 * @param postData - An object containing the post details (uid, text, imageUrl, videoUrl).
 * @returns Promise<string> - The ID of the newly created post document.
 * @throws Error if post data is invalid, db is not initialized, or add operation fails.
 */
export const addPost = async (postData: PostInput): Promise<string> => {
  if (!postData || !postData.uid) {
    console.error("🔴 addPost Error: Invalid post data provided (UID is missing).", postData);
    throw new Error("Invalid post data: Author UID is required.");
  }
  if (!postData.text && !postData.imageUrl && !postData.videoUrl) {
    console.error("🔴 addPost Error: Post must contain text, an image URL, or a video URL.", postData);
    throw new Error("Post must have content (text, image, or video).");
  }
   if (!db) {
      console.error("🔴 addPost Error: Firestore (db) not available.");
      throw new Error("Database service not available.");
   }

  try {
    const postsCollectionRef = collection(db, 'posts');
    const newPostDocRef = await addDoc(postsCollectionRef, {
      ...postData,
      timestamp: firestoreServerTimestamp(), // Firestore handles this on the server
      likeCount: 0, // Initialize like count
      likedBy: [], // Initialize likedBy array
      commentCount: 0, // Initialize comment count
    });
    console.log(`Firestore: Post created with ID: ${newPostDocRef.id}`);
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
 * Checks if the user attempting the deletion is the owner of the post.
 *
 * @param postId - The ID of the post to delete.
 * @param userId - The ID of the user attempting the deletion.
 * @returns Promise<void>
 * @throws Error if user is not authorized, db is not initialized, or deletion fails.
 */
export const deletePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId || !userId) throw new Error("Post ID and User ID are required.");

    const postRef = doc(db, 'posts', postId);
    const commentsRef = collection(db, 'posts', postId, 'comments');

    try {
        // 1. Check ownership
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) {
            throw new Error("Post not found.");
        }
        const postData = postSnap.data();
        if (postData.uid !== userId) {
            console.warn(`Firestore: Unauthorized delete attempt on post ${postId} by user ${userId}. Owner is ${postData.uid}.`);
            throw new Error("You are not authorized to delete this post.");
        }

        // 2. Delete comments using a batch write for atomicity
        const batch = writeBatch(db);
        const commentsQuerySnapshot = await getDocs(commentsRef);
        commentsQuerySnapshot.forEach((commentDoc) => {
            batch.delete(commentDoc.ref);
        });

        // 3. Delete the post document itself
        batch.delete(postRef);

        // 4. Commit the batch
        await batch.commit();

        console.log(`Firestore: Post ${postId} and its ${commentsQuerySnapshot.size} comments deleted by owner ${userId}.`);

    } catch (error: any) {
        const detailedErrorMessage = `Failed to delete post ${postId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        // Re-throw the specific error message from ownership check or Firestore operation
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
