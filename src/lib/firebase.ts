
import { initializeApp, getApps, getApp, FirebaseError, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database"; // Import RTDB functions

// --- Firebase Configuration ---
// IMPORTANT: Hardcoding credentials directly in source code is generally NOT recommended for security reasons.
// This change was made based on a specific user request. Consider using environment variables for production.
const firebaseConfig: FirebaseOptions = {
    apiKey: "AIzaSyDR5ESnHuv6bsin9jFrEm3gTbMdySVpGZE", // This is a public key, but sensitive in some contexts
    authDomain: "chating-class.firebaseapp.com",
    projectId: "chating-class",
    // Corrected storageBucket format: projectId.appspot.com
    storageBucket: "chating-class.appspot.com",
    messagingSenderId: "66220288730",
    appId: "1:66220288730:web:abc61ad5a32a5ac2add3e3",
    measurementId: "G-5RCN429FJK",
    // Add the Realtime Database URL - IMPORTANT for WebRTC signaling
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
    const checkConfigValue = (key: keyof FirebaseOptions, name: string, required: boolean = true, formatCheck?: (value: string) => boolean, formatDesc?: string) => {
        const value = firebaseConfig[key];
        if (required && !value) {
            return `${name} (${key}) is not defined. Please check the hardcoded firebaseConfig in src/lib/firebase.ts.`;
        }
        if (value && formatCheck && !formatCheck(value as string)) {
             return `${name} (${key}) has an incorrect format. Expected format: ${formatDesc}. Current value: ${value}`;
        }
        return null;
    }

    configError = checkConfigValue('apiKey', 'Firebase API Key', true);
    if (configError) {
        console.error("🔴 FATAL Firebase Config Error:", configError);
        throw new Error(configError);
    }

    configError = checkConfigValue('authDomain', 'Firebase Auth Domain', true);
     if (configError) {
         console.error("🔴 FATAL Firebase Config Error:", configError);
         throw new Error(configError);
     }

     configError = checkConfigValue('projectId', 'Firebase Project ID', true);
     if (configError) {
         console.error("🔴 FATAL Firebase Config Error:", configError);
         throw new Error(configError);
     }

    // Check non-critical but important values
    configError = checkConfigValue('storageBucket', 'Firebase Storage Bucket', false, (v) => v.endsWith('.appspot.com'), "'your-project-id.appspot.com'");
     if (configError) {
         console.warn("🟡 Firebase Config Warning:", configError); // Warn but don't throw
     }

    configError = checkConfigValue('databaseURL', 'Firebase Realtime Database URL', false, (v) => v.startsWith('https://') && v.endsWith('.firebaseio.com'), "'https://your-project-id-default-rtdb.firebaseio.com'");
     if (configError) {
         console.warn("🟡 Firebase Config Warning:", configError); // Warn but don't throw for RTDB URL
     }


    // Initialize Firebase App.
    // This guards against re-initialization in hot-reloading environments.
    if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase App initialized.");
    } else {
        app = getApp();
        console.log("Firebase App already initialized.");
    }

    // Get Firebase services using the helper function.
    auth = safeInitializeService(() => getAuth(app), "Auth");
    db = safeInitializeService(() => getFirestore(app), "Firestore");
    storage = safeInitializeService(() => getStorage(app), "Storage");
    rtdb = safeInitializeService(() => getDatabase(app), "Realtime Database"); // Initialize RTDB

    if (!app) {
        // This case should theoretically not be reached due to the checks above, but good to have.
        firebaseInitializationError = "Firebase App could not be initialized for an unknown reason.";
        console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
        throw new Error(firebaseInitializationError);
    }

} catch (error: any) {
    // Catch errors during initializeApp() itself or re-thrown config errors
    console.error("🔴 Firebase core initialization failed:", error);
    let errorMessage = `Firebase core initialization failed: ${error.message || 'Unknown error'}. Ensure Firebase config in src/lib/firebase.ts is correct and valid.`;
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
    // This might be caught by Next.js error boundaries or cause server start failure.
    throw new Error(firebaseInitializationError);
}

// --- Service Availability Check ---
// Optional: Log warnings if essential services are unavailable.
if (!auth) console.warn("🟡 Firebase Warning: Auth service is unavailable. Authentication features will not work.");
if (!db) console.warn("🟡 Firebase Warning: Firestore service is unavailable. Database operations will fail.");
if (!storage) console.warn("🟡 Firebase Warning: Storage service is unavailable. File uploads/downloads will fail.");
if (!rtdb) console.warn("🟡 Firebase Warning: Realtime Database service is unavailable. Signaling/Video calls will fail."); // Add RTDB check

// Export the initialized services (they might be undefined if initialization failed)
export { app, auth, db, storage, rtdb, firebaseInitializationError }; // Export rtdb and error
