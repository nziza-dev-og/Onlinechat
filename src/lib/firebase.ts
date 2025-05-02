
import { initializeApp, getApps, getApp, FirebaseError, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// --- Firebase Configuration ---
// IMPORTANT: Load configuration from environment variables.
// NEXT_PUBLIC_ prefixed variables are exposed to the browser.
// Ensure these are set in your .env.local file for local development
// and in your hosting provider's environment variables for deployment.

const firebaseConfig: FirebaseOptions = {
    // REQUIRED: Your Firebase project's API key. Critical for initialization.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    // Your Firebase project's authentication domain (e.g., 'your-project-id.firebaseapp.com').
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    // Your Firebase project ID.
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // Your Firebase storage bucket (e.g., 'your-project-id.appspot.com').
    // Ensure it ends with '.appspot.com'.
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    // Your Firebase project's messaging sender ID.
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    // Your Firebase project's app ID.
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    // Optional: Your Firebase project's measurement ID (for Analytics).
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// --- Validation for Environment Variables ---
let firebaseInitializationError: string | null = null;

// Validate REQUIRED apiKey
if (!firebaseConfig.apiKey) {
    firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined. Please check your environment variables (e.g., .env.local file for local development, or your hosting provider's settings for deployment). Make sure the variable name is exactly 'NEXT_PUBLIC_FIREBASE_API_KEY' and the value is your actual Firebase API key.";
    console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
    // Throw immediately if the critical API key is missing.
    // This prevents the app from trying to run in a broken state.
    // NOTE: This check runs during module initialization (server/client).
    throw new Error(firebaseInitializationError);
} else if (firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY') {
    // Check if placeholder value is still present
     firebaseInitializationError = "Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is still set to the placeholder value 'YOUR_FIREBASE_API_KEY'. Please replace it with your actual Firebase API key in your environment variables (.env.local or deployment settings).";
     console.error("🔴 FATAL Firebase Init Error:", firebaseInitializationError);
     throw new Error(firebaseInitializationError);
} else if (!firebaseConfig.apiKey.startsWith('AIzaSy')) {
    // Basic sanity check for key format (Firebase web API keys typically start with AIzaSy)
    console.warn(`🟡 Firebase Init Warning: The provided API Key (NEXT_PUBLIC_FIREBASE_API_KEY: "${firebaseConfig.apiKey.substring(0, 6)}...") doesn't start with the typical 'AIzaSy'. Ensure it's a valid Firebase Web API Key.`);
}


// Validate other potentially important config values (log warnings, don't throw)
if (!firebaseConfig.projectId) {
    console.warn("🟡 Firebase Init Warning: Project ID (NEXT_PUBLIC_FIREBASE_PROJECT_ID) is missing. Some Firebase services might require it.");
}
if (!firebaseConfig.authDomain) {
    console.warn("🟡 Firebase Init Warning: Auth Domain (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) is missing. Authentication might not work correctly.");
}
if (!firebaseConfig.storageBucket) {
    console.warn("🟡 Firebase Init Warning: Storage Bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) is missing. Firebase Storage operations will fail.");
} else if (!firebaseConfig.storageBucket.endsWith('.appspot.com')) {
    // Validate storageBucket format - common mistake (should be .appspot.com, not .firebasestorage.app)
    console.warn(`🟡 Firebase Init Warning: Invalid Storage Bucket format ("${firebaseConfig.storageBucket}"). It should typically end with '.appspot.com', not '.firebasestorage.app'. Please check NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.`);
}
if (!firebaseConfig.messagingSenderId) {
    console.warn("🟡 Firebase Init Warning: Messaging Sender ID (NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) is missing. FCM/Push Notifications might not work.");
}
if (!firebaseConfig.appId) {
    console.warn("🟡 Firebase Init Warning: App ID (NEXT_PUBLIC_FIREBASE_APP_ID) is missing.");
}


// --- Initialize Firebase App and Services ---
let app: ReturnType<typeof initializeApp> | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

try {
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

    console.log("Firebase App initialized successfully.");

} catch (error: any) {
    // Catch errors during initializeApp() itself
    console.error("🔴 Firebase core initialization failed:", error);
    let errorMessage = `Firebase core initialization failed: ${error.message}. Ensure Firebase config in environment variables is correct.`;
    if (error instanceof FirebaseError && (error.code === 'auth/invalid-api-key' || (error.message && error.message.includes('API key not valid')))) {
        errorMessage = `Firebase initialization failed at runtime due to an invalid API key: ${error.message}. Verify NEXT_PUBLIC_FIREBASE_API_KEY.`;
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
