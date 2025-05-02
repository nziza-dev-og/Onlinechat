
import { initializeApp, getApps, getApp, FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import getStorage

// --- CRITICAL CONFIGURATION ---
// Firebase configuration is now hardcoded based on user request.
// In a real application, using environment variables (.env.local) is strongly recommended
// for security and flexibility. See previous versions or README for .env setup.
//
// If you encounter errors like "auth/invalid-api-key", double-check these values
// against your Firebase project settings.
// ---------------------------------

// Firebase configuration using hardcoded values (as requested)
const firebaseConfig = {
    apiKey: "AIzaSyDR5ESnHuv6bsin9jFrEm3gTbMdySVpGZE",
    authDomain: "chating-class.firebaseapp.com",
    projectId: "chating-class",
    storageBucket: "chating-class.appspot.com", // Corrected storageBucket format
    messagingSenderId: "66220288730",
    appId: "1:66220288730:web:abc61ad5a32a5ac2add3e3",
    measurementId: "G-5RCN429FJK" // Optional
};


// --- Validation for Hardcoded Values ---
// This section checks if the necessary hardcoded values are present.
// If a critical value is missing or seems incorrect, it throws an error.
let firebaseInitializationError: string | null = null;

if (!firebaseConfig.apiKey) {
    // Critical: API Key is required.
    firebaseInitializationError = "Firebase API Key is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts. Please ensure it has a valid value.";
    console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
} else if (firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY' || firebaseConfig.apiKey.includes('AIzaSy') === false) {
    // Check if placeholder or potentially invalid key format
     firebaseInitializationError = `Firebase API Key in src/lib/firebase.ts ("${firebaseConfig.apiKey.substring(0, 10)}...") seems invalid or is a placeholder. Please replace it with your actual Firebase API key.`;
     console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
}

// Add checks for other essential config values
if (!firebaseConfig.projectId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Project ID is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts.";
    console.error("🔴 Firebase Init Warning:", firebaseInitializationError); // Log as warning if not immediately fatal
}
if (!firebaseConfig.authDomain && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Auth Domain is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts.";
    console.error("🔴 Firebase Init Warning:", firebaseInitializationError); // Log as warning if not immediately fatal
}
if (!firebaseConfig.storageBucket && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Storage Bucket is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}
// Validate storageBucket format - common mistake
if (firebaseConfig.storageBucket && !firebaseConfig.storageBucket.endsWith('.appspot.com') && !firebaseInitializationError) {
    firebaseInitializationError = `Invalid Firebase Storage Bucket format ("${firebaseConfig.storageBucket}"). It should typically end with '.appspot.com'. Please check the value in src/lib/firebase.ts.`;
    console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}
if (!firebaseConfig.messagingSenderId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase Messaging Sender ID is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}
if (!firebaseConfig.appId && !firebaseInitializationError) {
    firebaseInitializationError = "Firebase App ID is missing in the hardcoded firebaseConfig object in src/lib/firebase.ts.";
     console.error("🔴 Firebase Init Warning:", firebaseInitializationError);
}


// Initialize Firebase Services only if the CRITICAL API key seems valid.
let app: ReturnType<typeof initializeApp> | undefined;
let auth: ReturnType<typeof getAuth> | undefined;
let db: ReturnType<typeof getFirestore> | undefined;
let storage: ReturnType<typeof getStorage> | undefined;

// Proceed only if the critical API key error is NOT present.
if (!firebaseInitializationError || !firebaseInitializationError.includes('API Key')) {
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
            errorMessage = `Firebase initialization failed at runtime: ${error.message}. The hardcoded API Key in src/lib/firebase.ts might be incorrect or invalid for your project. Verify the key in your Firebase project settings.`;
        } else {
            errorMessage += ' Check Firebase console for project status and ensure ALL required Firebase configuration values in src/lib/firebase.ts are correct.';
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
     console.warn("Firebase initialization skipped due to missing or invalid API Key in src/lib/firebase.ts.");
     app = undefined;
     auth = undefined;
     db = undefined;
     storage = undefined;
}

// Throw error during module evaluation (server-side build/start or client-side load) if critical config is missing or invalid.
// This ensures the app fails fast if Firebase cannot be configured correctly.
if (firebaseInitializationError && firebaseInitializationError.includes('API Key')) {
    // This error is intentionally thrown. You MUST fix the hardcoded configuration in src/lib/firebase.ts.
    // Consult your Firebase project settings for the correct values.
    throw new Error(firebaseInitializationError);
}

// Final safety check: Ensure essential services are defined AFTER the main error check.
// This catches unexpected failures during getAuth/getFirestore/getStorage calls IF the initial API key check passed.
if (!app || !auth || !db || !storage) {
     // Only throw if the initial error wasn't the critical API key issue (which already threw)
     if (!firebaseInitializationError || !firebaseInitializationError.includes('API Key')) {
        const serviceError = "Critical Firebase services (App, Auth, Firestore, or Storage) are unexpectedly undefined after initialization attempt, despite API key seeming valid initially. This indicates an unexpected issue during service retrieval (getAuth, getFirestore, getStorage). Check console for specific errors. Ensure Firebase services (Authentication, Firestore, Storage) are enabled in your Firebase project and ALL required hardcoded configuration values in src/lib/firebase.ts are correct.";
        console.error("🔴 Firebase Service Retrieval Error:", serviceError);
        // Throwing here ensures the app doesn't proceed in a broken state.
        throw new Error(serviceError);
     }
}


export { app, auth, db, storage }; // Export storage
