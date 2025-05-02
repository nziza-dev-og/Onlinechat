
# Firebase Studio - React Chat App

This is a Next.js chat application built with Firebase for authentication, real-time database (Firestore), and storage. It includes user profiles and real-time messaging features.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Firebase Configuration (CRITICAL STEP - NOW HARDCODED):**

    *   **IMPORTANT:** Firebase configuration values (API Key, Project ID, etc.) are now **hardcoded directly within the `src/lib/firebase.ts` file** based on a previous request.
    *   **VERIFY `src/lib/firebase.ts`:** Open this file and ensure the `firebaseConfig` object contains your **correct and valid** Firebase project credentials.
    *   **`apiKey` is ABSOLUTELY ESSENTIAL.** If this value is incorrect, missing, or invalid in `src/lib/firebase.ts`, the application **WILL FAIL TO START** with errors like `auth/invalid-api-key` or similar Firebase initialization errors.
    *   **Storage Bucket Format:** Ensure the `storageBucket` value is in the correct format (usually `your-project-id.appspot.com`). An incorrect format (like ending in `.firebasestorage.app`) will cause storage operations to fail.
    *   **SECURITY WARNING:** Hardcoding credentials directly in source code is **generally NOT recommended** for security reasons, especially in public repositories. Using environment variables (like the previous `.env.local` method) is the standard and more secure practice. This change was made based on a specific request, but consider reverting to environment variables for production or shared projects.

3.  **Set Up Google GenAI API Key (If using AI features):**

    *   You still need to manage your `GOOGLE_GENAI_API_KEY` securely. The recommended way is using a *server-side only* environment variable.
    *   **Create `.env.local` (Optional, for GenAI Key ONLY):** If you haven't already for other server-side keys, you can create this file:
        ```bash
        touch .env.local
        ```
    *   **Add the key to `.env.local`:**
        ```
        GOOGLE_GENAI_API_KEY=YOUR_GOOGLE_GENAI_API_KEY
        ```
        **Replace `YOUR_GOOGLE_GENAI_API_KEY`** with your actual key.
        **DO NOT** prefix this key with `NEXT_PUBLIC_`.
    *   Ensure `.env.local` is listed in your `.gitignore` file.

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`. If you encounter Firebase errors on startup (especially `auth/invalid-api-key`), **STOP** and **CAREFULLY RE-CHECK THE `firebaseConfig` OBJECT IN `src/lib/firebase.ts`** for typos or incorrect values copied from your Firebase project settings.

## Deployment (CRITICAL STEP)

Since Firebase configuration is now hardcoded in `src/lib/firebase.ts`, you **do not** need to set the `NEXT_PUBLIC_FIREBASE_*` environment variables in your hosting provider.

However, you **MUST** still configure any **server-side only** environment variables, such as:

*   **`GOOGLE_GENAI_API_KEY`** (Ensure this is set as a *server-side* or *secret* environment variable in your hosting provider, **NOT** prefixed with `NEXT_PUBLIC_`).

**Refer to your hosting provider's documentation on how to set server-side environment variables.**

**WARNING:** Deploying with hardcoded Firebase credentials in `src/lib/firebase.ts` exposes your keys in the built client-side JavaScript bundle. This is a significant security risk. **Strongly consider reverting to using `NEXT_PUBLIC_` prefixed environment variables for Firebase configuration before deploying.**

## Building for Production

```bash
npm run build
```

This command builds the application for production usage. Ensure server-side environment variables like `GOOGLE_GENAI_API_KEY` are correctly set *before* the build process if your hosting provider requires build-time variables (though runtime variables set in the deployment environment are usually sufficient).

## Key Features

*   Firebase Authentication (Email/Password, Google Sign-In)
*   Firestore for real-time chat messages and user profiles
*   Firebase Storage for profile picture uploads
*   Real-time updates for messages and user list
*   User presence tracking (basic `lastSeen`)
*   Profile page with editing capabilities
*   ShadCN UI components and Tailwind CSS for styling
*   Genkit for potential future AI features

## Project Structure

*   `src/app/`: Next.js App Router pages and layouts.
*   `src/components/`: Reusable React components.
    *   `auth/`: Authentication related components.
    *   `chat/`: Chat interface components.
    *   `ui/`: ShadCN UI components.
*   `src/contexts/`: React context providers (e.g., AuthContext).
*   `src/hooks/`: Custom React hooks.
*   `src/lib/`: Core utilities and Firebase configuration/services.
    *   `firebase.ts`: **Contains hardcoded Firebase configuration (Verify correctness!).**
*   `src/ai/`: Genkit AI configuration and flows (if any).
*   `src/types/`: TypeScript type definitions.
*   `public/`: Static assets.
*   `.env.local`: **Your local SERVER-SIDE environment variables (e.g., GOOGLE_GENAI_API_KEY).** (Firebase client keys are hardcoded in `src/lib/firebase.ts`).
