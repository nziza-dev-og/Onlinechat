
import { initializeApp, getApps, getApp, FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import getStorage

// Firebase configuration using environment variables
// Use NEXT_PUBLIC_ variables consistently for client-side accessible config
// These are automatically handled by Next.js and made available client-side
const firebaseConfig = {
  // Use the publicly exposed variable for the API key
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};


// --- Environment Variable Validation ---
// These checks run wherever this module is imported (server/client).
// We primarily check NEXT_PUBLIC_ prefixed variables as they are needed client-side.
let firebaseInitializationError: string | null = null;

if (!firebaseConfig.apiKey) {
    firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined. Please check your environment variables (e.g., .env.local or deployment settings).";
    console.error("🔴 Firebase Init Error:", firebaseInitializationError);
}
if (!firebaseConfig.projectId) {
    // If apiKey was already missing, don't overwrite the error message
    if (!firebaseInitializationError) {
        firebaseInitializationError = "Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined. Please check your environment variables.";
        console.error("🔴 Firebase Init Error:", firebaseInitializationError);
    }
}
// Add checks for other essential config values if necessary (e.g., authDomain)


// Initialize Firebase Services only if config is valid
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
        console.error("🔴 Firebase core initialization failed unexpectedly even after config checks:", error);
        // Create a more informative error message
        let errorMessage = `Firebase core initialization failed unexpectedly: ${error.message}.`;
        if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || error.message.includes('API key not valid'))) {
            errorMessage += ' The provided Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) might be incorrect or invalid for your Firebase project, even though it was detected.';
        } else {
            errorMessage += ' Check Firebase console for project status and ensure configuration is correct.';
        }
        firebaseInitializationError = errorMessage; // Store the error
        console.error("🔴 Firebase Init Error:", firebaseInitializationError);
        // Clear service variables on error
        app = undefined;
        auth = undefined;
        db = undefined;
        storage = undefined;
    }
} else {
     // If config was invalid initially, ensure services are undefined
     app = undefined;
     auth = undefined;
     db = undefined;
     storage = undefined;
}

// Throw error during module evaluation (server-side build/start or client-side load) if critical config is missing
if (firebaseInitializationError) {
    throw new Error(firebaseInitializationError);
}

// Final check to ensure services were actually initialized (should not be needed if error is thrown above, but for safety)
if (!app || !auth || !db || !storage) {
     const serviceError = "Critical Firebase services (App, Auth, Firestore, or Storage) failed to initialize. Check console for specific errors during initialization.";
     console.error("🔴 Firebase Service Error:", serviceError);
     throw new Error(serviceError);
}


export { app, auth, db, storage }; // Export storage
