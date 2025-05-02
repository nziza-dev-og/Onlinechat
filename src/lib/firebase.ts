
import { initializeApp, getApps, getApp, FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import getStorage

// --- CRITICAL CONFIGURATION ---
// This application requires Firebase configuration variables to be set
// in your environment.
//
// 1. **Local Development:** Create a `.env.local` file in the root of your project.
//    Copy the contents of `.env.local.example` and replace the placeholder
//    values with your ACTUAL Firebase project credentials.
//    >> Ensure `.env.local` is NOT committed to version control (e.g., add it to .gitignore). <<
//
// 2. **Deployment:** Configure the EXACT SAME environment variables in your
//    hosting provider's settings (e.g., Vercel, Netlify, Firebase Hosting).
//    >> Refer to your hosting provider's documentation for setting environment variables. <<
//
// *** MOST IMPORTANT VARIABLE: ***
// `NEXT_PUBLIC_FIREBASE_API_KEY` MUST be defined AND CORRECT. The application will
// fail to start if this variable is missing, incorrect, or still a placeholder.
// Ensure it has the `NEXT_PUBLIC_` prefix.
//
// Required Public Variables (accessible by client & server):
// - NEXT_PUBLIC_FIREBASE_API_KEY
// - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
// - NEXT_PUBLIC_FIREBASE_PROJECT_ID
// - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
// - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
// - NEXT_PUBLIC_FIREBASE_APP_ID
// - NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID (Optional)
//
// Required Server-Only Variable (e.g., for Genkit, DO NOT add NEXT_PUBLIC_ prefix):
// - GOOGLE_GENAI_API_KEY
// ---------------------------------


// Firebase configuration using environment variables
// Ensure these EXACT names are used in your .env.local and deployment environment.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};


// --- Environment Variable Validation ---
// This section checks if the necessary environment variables are present.
// If a critical variable is missing, it throws an error to prevent the app from starting incorrectly.
let firebaseInitializationError: string | null = null;

if (!firebaseConfig.apiKey) {
    // Critical: API Key is required for Firebase to work at all.
    firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined. Please check your environment variables (e.g., .env.local file for local development, or your hosting provider's settings for deployment). Make sure the variable name is exactly 'NEXT_PUBLIC_FIREBASE_API_KEY' and the value is your actual Firebase API key.";
    console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
} else if (firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY') {
    // Check if placeholder value is still present
     firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is still set to the placeholder value 'YOUR_FIREBASE_API_KEY'. Please replace it with your actual Firebase API key in your environment variables (.env.local or deployment settings).";
     console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
}

// Add checks for other essential config values if they are strictly required for your app's core functionality.
// These checks prevent overwriting the primary API key error if it occurred.
if (!firebaseConfig.projectId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined. Check environment variables.";
    console.error("🔴 Firebase Init Warning:", firebaseInitializationError); // Log as warning if not immediately fatal
}
if (!firebaseConfig.authDomain && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is not defined. Check environment variables.";
    console.error("🔴 Firebase Init Warning:", firebaseInitializationError); // Log as warning if not immediately fatal
}
if (!firebaseConfig.storageBucket && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is not defined. Check environment variables.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}
if (!firebaseConfig.messagingSenderId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Messaging Sender ID (NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) is not defined. Check environment variables.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}
if (!firebaseConfig.appId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase App ID (NEXT_PUBLIC_FIREBASE_APP_ID) is not defined. Check environment variables.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}


// Initialize Firebase Services only if the CRITICAL API key is present and not a placeholder.
let app: ReturnType<typeof initializeApp> | undefined;
let auth: ReturnType<typeof getAuth> | undefined;
let db: ReturnType<typeof getFirestore> | undefined;
let storage: ReturnType<typeof getStorage> | undefined;

if (!firebaseInitializationError || (firebaseInitializationError && !firebaseInitializationError.includes('NEXT_PUBLIC_FIREBASE_API_KEY'))) {
    // Proceed only if the critical API key error is NOT present.
    // Other missing vars might cause issues later, but core initialization can attempt.
    try {
        // Initialize app only if it hasn't been initialized yet
        app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

        // Get services - Wrap in individual try/catch if specific services might fail independently
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app); // Initialize Storage

        console.log("Firebase core services initialized (Auth, Firestore, Storage).");

    } catch (error: any) {
        console.error("🔴 Firebase core initialization or service retrieval failed unexpectedly:", error);
        // Create a more informative error message based on the runtime error
        let errorMessage = `Firebase core initialization or service retrieval failed unexpectedly: ${error.message}.`;
        if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || (error.message && error.message.includes('API key not valid')))) {
            // Enhance message specifically for invalid API key runtime errors
            errorMessage = `Firebase initialization failed at runtime: ${error.message}. The API Key (NEXT_PUBLIC_FIREBASE_API_KEY) might be incorrect, invalid for your project, or missing required permissions, even though it was found in the environment. Verify the key in your Firebase project settings and environment variables (.env.local or deployment).`;
        } else {
            errorMessage += ' Check Firebase console for project status and ensure ALL required Firebase configuration values in environment variables are correct for both local development and deployment.';
        }
        firebaseInitializationError = errorMessage; // Store the runtime error
        console.error("🔴 FATAL Firebase Runtime Error:", firebaseInitializationError);
        // Clear service variables on error
        app = undefined;
        auth = undefined;
        db = undefined;
        storage = undefined;
    }
} else {
     // If critical config was invalid initially, ensure services are undefined
     console.warn("Firebase initialization skipped due to missing or placeholder NEXT_PUBLIC_FIREBASE_API_KEY.");
     app = undefined;
     auth = undefined;
     db = undefined;
     storage = undefined;
}

// Throw error during module evaluation (server-side build/start or client-side load) if critical config is missing or invalid.
// This ensures the app fails fast if Firebase cannot be configured correctly.
if (firebaseInitializationError && firebaseInitializationError.includes('NEXT_PUBLIC_FIREBASE_API_KEY')) {
    // This error is intentionally thrown. You MUST fix the environment variables.
    // Consult README.md and .env.local.example for detailed instructions.
    throw new Error(firebaseInitializationError);
}

// Final safety check: Ensure essential services are defined AFTER the main error check.
// This catches unexpected failures during getAuth/getFirestore/getStorage calls IF the initial API key check passed.
if (!app || !auth || !db || !storage) {
     // Only throw if the initial error wasn't the critical API key issue (which already threw)
     if (!firebaseInitializationError || !firebaseInitializationError.includes('NEXT_PUBLIC_FIREBASE_API_KEY')) {
        const serviceError = "Critical Firebase services (App, Auth, Firestore, or Storage) are unexpectedly undefined after initialization attempt, despite API key seeming valid initially. This indicates an unexpected issue during service retrieval (getAuth, getFirestore, getStorage). Check console for specific errors. Ensure Firebase services (Authentication, Firestore, Storage) are enabled in your Firebase project and ALL required environment variables are correctly set.";
        console.error("🔴 Firebase Service Retrieval Error:", serviceError);
        // Throwing here ensures the app doesn't proceed in a broken state.
        throw new Error(serviceError);
     }
}


export { app, auth, db, storage }; // Export storage
