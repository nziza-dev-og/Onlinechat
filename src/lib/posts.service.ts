
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
  where,
  deleteDoc,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Post, PostSerializable, CommentSerializable } from '@/types';
import { isFirebaseError } from '@/lib/firebase-errors';

export interface PostInput {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  musicUrl?: string | null;
  musicStartTime?: number | null;
  musicEndTime?: number | null;
  type?: 'post' | 'story';
  tags?: string[];
}

const extractHashtags = (text: string | null | undefined): string[] => {
  if (!text) return [];
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
  const matches = text.match(hashtagRegex);
  if (!matches) return [];
  return Array.from(new Set(matches.map(tag => tag.substring(1))));
};

export const addPost = async (postData: PostInput): Promise<string> => {
  if (!postData || !postData.uid) {
    console.error("🔴 addPost Error: Invalid post data provided (UID is missing).", postData);
    throw new Error("Invalid post data: Author UID is required.");
  }
   if (!postData.text?.trim() && !postData.imageUrl?.trim() && !postData.videoUrl?.trim()) {
     console.error("🔴 addPost Error: Post/Story must contain text, an image URL, or a video URL.", postData);
     throw new Error("Post or Story must have content (text, image, or video).");
   }
   if (postData.type === 'story' && !postData.imageUrl?.trim() && !postData.videoUrl?.trim()) {
     console.error("🔴 addPost Error: Story must contain an image URL or a video URL.", postData);
     throw new Error("Story must have an image or video.");
   }
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
    const extractedTags = extractHashtags(postData.text);

    const dataToSave: Omit<Post, 'id' | 'timestamp'> & { timestamp: any, saveCount?: number, savedBy?: string[] } = { // Ensure Post type is used for consistency before serverTimestamp
      uid: postData.uid,
      displayName: postData.displayName,
      photoURL: postData.photoURL,
      text: postData.text?.trim() || null,
      imageUrl: postData.imageUrl?.trim() || null,
      videoUrl: postData.videoUrl?.trim() || null,
      musicUrl: isStory ? (postData.musicUrl?.trim() || null) : null,
      musicStartTime: isStory ? (postData.musicStartTime ?? null) : null,
      musicEndTime: isStory ? (postData.musicEndTime ?? null) : null,
      type: postData.type || 'post',
      tags: extractedTags.length > 0 ? extractedTags : [],
      timestamp: firestoreServerTimestamp(),
      likeCount: 0,
      likedBy: [],
      commentCount: 0,
      saveCount: 0, // Initialize saveCount
      savedBy: [],  // Initialize savedBy
    };
    const newPostDocRef = await addDoc(postsCollectionRef, dataToSave);
    console.log(`Firestore: Post created with ID: ${newPostDocRef.id}, Type: ${dataToSave.type}, Tags: ${dataToSave.tags.join(', ')}`);
    return newPostDocRef.id;
  } catch (error: any) {
     const detailedErrorMessage = `Failed to add post to Firestore. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
     console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
     throw new Error(detailedErrorMessage);
  }
};

export const fetchPosts = async (count: number = 50): Promise<PostSerializable[]> => {
  if (!db) {
     console.error("🔴 fetchPosts Error: Firestore (db) not available.");
     throw new Error("Database service not available.");
  }

  try {
    const twentyFourHoursAgo = new Timestamp(Math.floor(Date.now() / 1000) - (24 * 60 * 60), 0);

    const postsQuery = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc'),
      limit(count)
    );

    const querySnapshot = await getDocs(postsQuery);

    const posts: PostSerializable[] = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
         if (!data.uid || !(data.timestamp instanceof Timestamp)) {
           console.warn("Skipping invalid post document (missing uid or timestamp):", doc.id, data);
           return null;
         }
         // For stories, filter out those older than 24 hours
         if (data.type === 'story' && data.timestamp.toMillis() < twentyFourHoursAgo.toMillis()) {
           console.log(`Filtering out old story: ${doc.id}`);
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
          musicUrl: data.musicUrl ?? null,
          musicStartTime: data.musicStartTime ?? null,
          musicEndTime: data.musicEndTime ?? null,
          type: data.type || 'post',
          tags: data.tags ?? [],
          timestamp: data.timestamp.toDate().toISOString(),
          likeCount: data.likeCount ?? 0,
          likedBy: data.likedBy ?? [],
          commentCount: data.commentCount ?? 0,
          saveCount: data.saveCount ?? 0,
          savedBy: data.savedBy ?? [],
        };
      })
      .filter((post): post is PostSerializable => post !== null);

    console.log(`Firestore: Fetched ${posts.length} posts/stories.`);
    return posts;

  } catch (error: any) {
      const detailedErrorMessage = `Failed to fetch posts from Firestore. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
      console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
      throw new Error(detailedErrorMessage);
  }
};

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
            likedBy: arrayUnion(userId)
        });
        console.log(`Firestore: Post ${postId} liked by user ${userId}`);
    } catch (error: any) {
        const detailedErrorMessage = `Failed to like post ${postId} for user ${userId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

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
        await updateDoc(postRef, {
            likeCount: increment(-1),
            likedBy: arrayRemove(userId)
        });
        console.log(`Firestore: Post ${postId} unliked by user ${userId}`);
    } catch (error: any) {
        const detailedErrorMessage = `Failed to unlike post ${postId} for user ${userId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(detailedErrorMessage);
    }
};

export interface CommentInput {
  postId: string;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  text: string;
}

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

export const deletePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId) throw new Error("Post ID is required.");
    if (!userId) throw new Error("User ID is required for authorization.");

    const postRef = doc(db, 'posts', postId);
    const commentsRef = collection(db, 'posts', postId, 'comments');

    try {
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) {
             console.warn(`Attempted to delete non-existent post: ${postId}`);
             throw new Error("Post not found.");
        }
        const postData = postSnap.data();
        // User can delete their own post OR an admin can delete any post
        if (postData?.uid !== userId) {
            const adminUserRef = doc(db, 'users', userId);
            const adminSnap = await getDoc(adminUserRef);
            if (!adminSnap.exists() || !adminSnap.data()?.isAdmin) {
                console.warn(`Unauthorized delete attempt on post ${postId} by user ${userId}. Author: ${postData?.uid}`);
                throw new Error("Unauthorized: You can only delete your own posts or you must be an admin.");
            }
            console.log(`Admin user ${userId} deleting post ${postId} authored by ${postData?.uid}`);
        }

        const batch = writeBatch(db);
        const commentsQuerySnapshot = await getDocs(commentsRef);
        commentsQuerySnapshot.forEach((commentDoc) => {
            batch.delete(commentDoc.ref);
        });
        console.log(`Firestore: Queued deletion of ${commentsQuerySnapshot.size} comments for post ${postId}.`);
        batch.delete(postRef);
        await batch.commit();
        console.log(`Firestore: Post ${postId} and its comments deleted successfully by user ${userId}.`);

    } catch (error: any) {
        if (error.message.includes("Unauthorized") || error.message.includes("Post not found")) {
             throw error;
        }
        const detailedErrorMessage = `Failed to delete post ${postId}. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
        console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
        throw new Error(error.message || detailedErrorMessage);
    }
};

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
};

/**
 * Saves a post for a user.
 */
export const savePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId || !userId) throw new Error("Post ID and User ID are required.");

    const postRef = doc(db, 'posts', postId);
    try {
        await updateDoc(postRef, {
            saveCount: increment(1),
            savedBy: arrayUnion(userId)
        });
        console.log(`Firestore: Post ${postId} saved by user ${userId}`);
    } catch (error: any) {
        const msg = `Failed to save post ${postId}. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};

/**
 * Unsaves a post for a user.
 */
export const unsavePost = async (postId: string, userId: string): Promise<void> => {
    if (!db) throw new Error("Database service not available.");
    if (!postId || !userId) throw new Error("Post ID and User ID are required.");

    const postRef = doc(db, 'posts', postId);
    try {
        await updateDoc(postRef, {
            saveCount: increment(-1),
            savedBy: arrayRemove(userId)
        });
        console.log(`Firestore: Post ${postId} unsaved by user ${userId}`);
    } catch (error: any) {
        const msg = `Failed to unsave post ${postId}. Error: ${error.message || 'Unknown Firestore error'}`;
        console.error("🔴 Firestore Error:", msg, error);
        throw new Error(msg);
    }
};

