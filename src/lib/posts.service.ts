
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
  type FirestoreError
} from 'firebase/firestore';
import type { Post } from '@/types';
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
      timestamp: firestoreServerTimestamp(),
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
 * Fetches the most recent posts from the 'posts' collection.
 *
 * @param count - The maximum number of posts to fetch (default: 50).
 * @returns Promise<Post[]> - An array of post objects.
 * @throws Error if db is not initialized or fetch fails.
 */
export const fetchPosts = async (count: number = 50): Promise<Post[]> => {
  if (!db) {
     console.error("🔴 fetchPosts Error: Firestore (db) not available.");
     throw new Error("Database service not available.");
  }

  try {
    const postsQuery = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc'), // Get newest posts first
      limit(count)
    );

    const querySnapshot = await getDocs(postsQuery);

    const posts: Post[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Basic validation
       if (!data.uid || !(data.timestamp instanceof Timestamp)) {
         console.warn("Skipping invalid post document:", doc.id, data);
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
        timestamp: data.timestamp,
      } as Post;
    }).filter((post): post is Post => post !== null); // Filter out invalid documents

    console.log(`Firestore: Fetched ${posts.length} posts.`);
    return posts;

  } catch (error: any) {
      const detailedErrorMessage = `Failed to fetch posts from Firestore. Error: ${error.message || 'Unknown Firestore error'}${error.code ? ` (Code: ${error.code})` : ''}`;
      console.error("🔴 Detailed Firestore Error:", detailedErrorMessage, error);
      throw new Error(detailedErrorMessage);
  }
};
