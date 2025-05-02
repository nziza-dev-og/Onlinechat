
import { initializeApp, getApps, getApp, FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import getStorage

// Firebase configuration using environment variables
// Use process.env.FIREBASE_API_KEY directly for server-side initialization
// Use process.env.NEXT_PUBLIC_ variables for values needed client-side AFTER initialization
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY, // Direct read for server-side
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Check if critical environment variables are defined for server-side initialization
if (!firebaseConfig.apiKey) {
    const errorMsg = "Firebase API Key (FIREBASE_API_KEY) is not defined in the server environment. Please check your environment variables (e.g., .env.local or deployment settings).";
    console.error(errorMsg);
    // Throw error during build/server start if key is missing
    throw new Error(errorMsg);
}
if (!firebaseConfig.projectId) {
    const errorMsg = "Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined. Please check your environment variables.";
     console.error(errorMsg);
    throw new Error(errorMsg);
}
// Add checks for other essential config values if necessary


// Initialize Firebase
let app;
let auth;
let db;
let storage;

try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    // Initialize services. These might throw if the API key is invalid.
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app); // Initialize Storage
} catch (error: any) {
    console.error("Firebase core initialization failed:", error);
    // Create a more informative error message, especially for invalid API key issues.
    let errorMessage = `Firebase core initialization failed: ${error.message}.`;
    if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || error.message.includes('API key not valid'))) {
        errorMessage += ' The Firebase API Key (FIREBASE_API_KEY) in your server environment variables might be incorrect or invalid for your Firebase project.';
    } else {
        errorMessage += ' Ensure Firebase config in src/lib/firebase.ts and necessary environment variables are correct.';
    }
     console.error(errorMessage); // Log the detailed error message
     // Throw the specific error to halt execution, as Firebase is essential
    throw new Error(errorMessage);
}

// This check might be redundant if the try/catch handles initialization failures,
// but kept for clarity.
if (!auth || !db || !storage) {
     const serviceError = "Failed to initialize Firebase services (Auth, Firestore, or Storage) even after attempting initialization. Check console for specific errors.";
     console.error(serviceError);
     // Throw an error if essential services failed to initialize
     throw new Error(serviceError);
}

export { app, auth, db, storage }; // Export storage
