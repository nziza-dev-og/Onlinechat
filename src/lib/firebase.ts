
import { initializeApp, getApps, getApp, FirebaseError, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// --- Firebase Configuration ---
// IMPORTANT: Hardcoding credentials directly in source code is generally NOT recommended for security reasons.
// This change was made based on a specific user request. Consider using environment variables for production.
const firebaseConfig: FirebaseOptions = {
    apiKey: "AIzaSyDR5ESnHuv6bsin9jFrEm3gTbMdySVpGZE",
    authDomain: "chating-class.firebaseapp.com",
    projectId: "chating-class",
    // Corrected storageBucket format: projectId.appspot.com
    storageBucket: "chating-class.appspot.com",
    messagingSenderId: "66220288730",
    appId: "1:66220288730:web:abc61ad5a32a5ac2add3e3",
    measurementId: "G-5RCN429FJK"
};

// --- Initialize Firebase App and Services ---
let app: ReturnType<typeof initializeApp> | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let firebaseInitializationError: string | null = null;

try {
    // Basic check if the hardcoded apiKey is present (though it's hardcoded now)
    if (!firebaseConfig.apiKey) {
        firebaseInitializationError = "Hardcoded Firebase API Key is missing in src/lib/firebase.ts. This should not happen.";
        console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
        throw new Error(firebaseInitializationError);
    }

    // Initialize Firebase App.
    // This guards against re-initialization in hot-reloading environments.
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

    // Get Firebase services. Wrap in try/catch in case a specific service fails.
    try {
        auth = getAuth(app);
    } catch (e) {
        console.error("🔴 Error initializing Firebase Auth:", e);
    }
    try {
        db = getFirestore(app);
    } catch (e) {
        console.error("🔴 Error initializing Firestore:", e);
    }
    try {
        storage = getStorage(app);
    } catch (e) {
        console.error("🔴 Error initializing Firebase Storage:", e);
    }

    console.log("Firebase App initialized successfully using hardcoded configuration.");

} catch (error: any) {
    // Catch errors during initializeApp() itself
    console.error("🔴 Firebase core initialization failed:", error);
    let errorMessage = `Firebase core initialization failed: ${error.message}. Ensure hardcoded Firebase config in src/lib/firebase.ts is correct.`;
    if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || (error.message && error.message.includes('API key not valid')))) {
        errorMessage = `Firebase initialization failed at runtime due to an invalid API key: ${error.message}. Verify the hardcoded apiKey in src/lib/firebase.ts.`;
    }
    firebaseInitializationError = errorMessage; // Store the runtime error
    console.error("🔴 FATAL Firebase Runtime Error:", firebaseInitializationError);

    // Ensure services are undefined if initialization failed
    app = undefined;
    auth = undefined;
    db = undefined;
    storage = undefined;

    // Re-throw the error to prevent the app from continuing in a broken state.
    // This will be caught by Next.js error boundaries.
    throw new Error(firebaseInitializationError);
}

// --- Service Availability Check ---
// Optional: Check if essential services are available after potential individual failures.
if (!auth) {
    console.warn("🟡 Firebase Warning: Auth service is unavailable. Authentication features will not work.");
}
if (!db) {
    console.warn("🟡 Firebase Warning: Firestore service is unavailable. Database operations will fail.");
}
if (!storage) {
    console.warn("🟡 Firebase Warning: Storage service is unavailable. File uploads/downloads will fail.");
}

// Export the initialized services (they might be undefined if initialization failed)
export { app, auth, db, storage };
