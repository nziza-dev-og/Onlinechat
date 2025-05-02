
import { initializeApp, getApps, getApp, FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import getStorage

// --- IMPORTANT ---
// This configuration uses environment variables.
// You MUST set these variables in your environment (e.g., .env.local file for development)
// AND in your deployment environment (e.g., Vercel, Netlify, Firebase Hosting environment settings).
// See .env.local.example for the required variables.
// -----------------

// Firebase configuration using environment variables
// Use NEXT_PUBLIC_ variables consistently for client-side accessible config
// These are automatically handled by Next.js and made available client-side
const firebaseConfig = {
  // Use the publicly exposed variable for the API key. This MUST be defined.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};


// --- Environment Variable Validation ---
// These checks run wherever this module is imported (server/client).
// It's crucial these are set BOTH locally AND in your deployment environment.
let firebaseInitializationError: string | null = null;

if (!firebaseConfig.apiKey) {
    // Critical: API Key is required for Firebase to work at all.
    firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined. Please check your environment variables (e.g., .env.local or deployment settings).";
    console.error("🔴 Firebase Init Error:", firebaseInitializationError);
}
if (!firebaseConfig.projectId) {
    // Also critical for most services.
    if (!firebaseInitializationError) { // Don't overwrite the API key error if it already exists
        firebaseInitializationError = "Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined. Please check your environment variables.";
        console.error("🔴 Firebase Init Error:", firebaseInitializationError);
    }
}
// Add checks for other essential config values if needed (e.g., authDomain, storageBucket)
if (!firebaseConfig.authDomain && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is not defined.";
    console.error("🔴 Firebase Init Error:", firebaseInitializationError);
}
if (!firebaseConfig.storageBucket && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not defined.";
    console.error("🔴 Firebase Init Error:", firebaseInitializationError);
}


// Initialize Firebase Services only if config seems valid
let app: ReturnType<typeof initializeApp> | undefined;
let auth: ReturnType<typeof getAuth> | undefined;
let db: ReturnType<typeof getFirestore> | undefined;
let storage: ReturnType<typeof getStorage> | undefined;

if (!firebaseInitializationError) {
    try {
        // Initialize app only if it hasn't been initialized yet
        app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

        // Get services
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app); // Initialize Storage

        console.log("Firebase initialized successfully.");

    } catch (error: any) {
        console.error("🔴 Firebase core initialization failed unexpectedly:", error);
        // Create a more informative error message
        let errorMessage = `Firebase core initialization failed unexpectedly: ${error.message}.`;
        if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || error.message.includes('API key not valid'))) {
            errorMessage += ' The provided Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) might be incorrect or invalid for your Firebase project, even though it was detected in the environment.';
        } else {
            errorMessage += ' Check Firebase console for project status and ensure configuration in environment variables is correct for both local development and deployment.';
        }
        firebaseInitializationError = errorMessage; // Store the error
        console.error("🔴 Firebase Init Error Details:", firebaseInitializationError);
        // Clear service variables on error
        app = undefined;
        auth = undefined;
        db = undefined;
        storage = undefined;
    }
} else {
     // If config was invalid initially, ensure services are undefined
     console.warn("Firebase initialization skipped due to missing configuration.");
     app = undefined;
     auth = undefined;
     db = undefined;
     storage = undefined;
}

// Throw error during module evaluation (server-side build/start or client-side load) if critical config is missing
// This ensures the app fails fast if Firebase cannot be configured.
if (firebaseInitializationError) {
    throw new Error(firebaseInitializationError);
}

// Final check to ensure services were actually initialized (should not be needed if error is thrown above, but for safety)
// If any service is undefined here AFTER the initial check passed, it indicates an unexpected issue during getAuth/getFirestore/getStorage.
if (!app || !auth || !db || !storage) {
     // This specific error might occur if the initial config *looked* okay, but getAuth/getFirestore/getStorage failed.
     // This is less likely than the config error but possible.
     const serviceError = "Critical Firebase services (App, Auth, Firestore, or Storage) failed to initialize even after initial config checks passed. This is unexpected. Check console for specific errors during service retrieval (getAuth, getFirestore, getStorage). Ensure Firebase services are enabled in your Firebase project.";
     console.error("🔴 Firebase Service Retrieval Error:", serviceError);
     throw new Error(serviceError);
}


export { app, auth, db, storage }; // Export storage
