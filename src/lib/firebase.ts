
import { initializeApp, getApps, getApp, FirebaseError, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database"; // Import RTDB functions

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
    measurementId: "G-5RCN429FJK",
    // Add the Realtime Database URL
    databaseURL: "https://chating-class-default-rtdb.firebaseio.com",
};

// --- Helper Function for Safe Initialization ---
function safeInitializeService<T>(initializer: () => T, serviceName: string): T | undefined {
    try {
        return initializer();
    } catch (e: any) {
        console.error(`🔴 Error initializing Firebase ${serviceName}:`, e.message, e);
        return undefined;
    }
}

// --- Initialize Firebase App and Services ---
let app: ReturnType<typeof initializeApp> | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let rtdb: Database | undefined; // Realtime Database instance
let firebaseInitializationError: string | null = null;

try {
    // --- Configuration Validation ---
    let configError = null;
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY') {
        configError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined or is set to the placeholder value. Please check your environment variables (e.g., .env.local or deployment settings).";
    } else if (!firebaseConfig.projectId) {
        configError = "Firebase Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is not defined. Check environment variables.";
    } else if (!firebaseConfig.authDomain) {
         configError = "Firebase Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is not defined. Check environment variables.";
    } else if (!firebaseConfig.storageBucket || !firebaseConfig.storageBucket.endsWith('.appspot.com')) {
        // Check if storageBucket exists and has the correct format
        configError = `Firebase Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is missing or has an incorrect format (should be 'your-project-id.appspot.com'). Current value: ${firebaseConfig.storageBucket}`;
    } else if (!firebaseConfig.databaseURL) { // Check for RTDB URL
        configError = "Firebase Realtime Database URL (NEXT_PUBLIC_FIREBASE_DATABASE_URL) is not defined. Check environment variables.";
    }

    if (configError) {
        firebaseInitializationError = configError;
        console.error("🔴 FATAL Firebase Config Error:", firebaseInitializationError);
        // Throw error only if critical keys like apiKey or projectId are missing
        if (configError.includes('API Key') || configError.includes('Project ID')) {
            throw new Error(firebaseInitializationError);
        } else {
            // Log warning for non-critical missing configs but allow initialization
            console.warn("🟡 Firebase Config Warning:", firebaseInitializationError);
        }
    }

    // Initialize Firebase App.
    // This guards against re-initialization in hot-reloading environments.
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

    // Get Firebase services using the helper function.
    auth = safeInitializeService(() => getAuth(app), "Auth");
    db = safeInitializeService(() => getFirestore(app), "Firestore");
    storage = safeInitializeService(() => getStorage(app), "Storage");
    rtdb = safeInitializeService(() => getDatabase(app), "Realtime Database"); // Initialize RTDB

    if (app) {
        console.log("Firebase App initialized successfully.");
    } else {
        // This case should theoretically not be reached due to the check above, but good to have.
        firebaseInitializationError = "Firebase App could not be initialized for an unknown reason.";
        console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
        throw new Error(firebaseInitializationError);
    }

} catch (error: any) {
    // Catch errors during initializeApp() itself or re-thrown config errors
    console.error("🔴 Firebase core initialization failed:", error);
    let errorMessage = `Firebase core initialization failed: ${error.message}. Ensure Firebase config in src/lib/firebase.ts is correct and valid.`;
    if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || (error.message && error.message.includes('API key not valid')))) {
        errorMessage = `Firebase initialization failed at runtime due to an invalid API key: ${error.message}. Verify the hardcoded apiKey in src/lib/firebase.ts.`;
    }
    // Use the caught error message if available, otherwise the previously set config error
    firebaseInitializationError = error.message || firebaseInitializationError || errorMessage;
    console.error("🔴 FATAL Firebase Runtime Error:", firebaseInitializationError);

    // Ensure services are undefined if initialization failed
    app = undefined;
    auth = undefined;
    db = undefined;
    storage = undefined;
    rtdb = undefined; // Ensure RTDB is undefined too

    // Re-throw the error to prevent the app from continuing in a broken state.
    // This will be caught by Next.js error boundaries.
    throw new Error(firebaseInitializationError);
}

// --- Service Availability Check ---
// Optional: Log warnings if essential services are unavailable.
if (!auth) console.warn("🟡 Firebase Warning: Auth service is unavailable. Authentication features will not work.");
if (!db) console.warn("🟡 Firebase Warning: Firestore service is unavailable. Database operations will fail.");
if (!storage) console.warn("🟡 Firebase Warning: Storage service is unavailable. File uploads/downloads will fail.");
if (!rtdb) console.warn("🟡 Firebase Warning: Realtime Database service is unavailable. Signaling/Video calls will fail."); // Add RTDB check

// Export the initialized services (they might be undefined if initialization failed)
export { app, auth, db, storage, rtdb }; // Export rtdb
