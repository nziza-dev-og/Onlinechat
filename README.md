
# Firebase Studio - React Chat App

This is a Next.js chat application built with Firebase for authentication, real-time database (Firestore), and storage. It includes user profiles and real-time messaging features.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables (CRITICAL STEP):**

    *   **Create `.env.local`:** Copy the example environment file:
        ```bash
        cp .env.local.example .env.local
        ```
        **Do NOT rename this file.** It must be exactly `.env.local`.

    *   **Edit `.env.local`:** Open the newly created `.env.local` file and **REPLACE ALL placeholder values (`YOUR_...`)** with your actual Firebase project configuration and your Google Generative AI API key.
        *   You can find your Firebase project configuration in your Firebase project settings (Project settings > General > Your apps > Web app > SDK setup and configuration > Config).
        *   You need to enable the Generative Language API (e.g., Gemini) in your Google Cloud project associated with Firebase and generate an API key for `GOOGLE_GENAI_API_KEY`.

    *   **VERY IMPORTANT - READ CAREFULLY:**
        *   All Firebase variables (`NEXT_PUBLIC_FIREBASE_*`) **MUST** have the `NEXT_PUBLIC_` prefix to be accessible by the client-side code.
        *   **`NEXT_PUBLIC_FIREBASE_API_KEY` IS ABSOLUTELY ESSENTIAL.**
            *   If this variable is **not set correctly**, is **missing**, or still contains the **placeholder `YOUR_FIREBASE_API_KEY`**, the application **WILL FAIL TO START** with an error like:
                *   `Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is not defined`
                *   `auth/invalid-api-key`
            *   **Double-check and triple-check** that you have copied the correct `apiKey` value from your Firebase project settings into the `NEXT_PUBLIC_FIREBASE_API_KEY` field in your `.env.local` file.
        *   The `GOOGLE_GENAI_API_KEY` **MUST NOT** have the `NEXT_PUBLIC_` prefix as it should only be used server-side.

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`. If you encounter Firebase errors on startup (especially `NEXT_PUBLIC_FIREBASE_API_KEY` or `auth/invalid-api-key` errors), **STOP** and **CAREFULLY RE-CHECK YOUR `.env.local` file** for typos, missing values, or placeholder values that were not replaced.

## Deployment (CRITICAL STEP)

When deploying your application to a hosting provider (like Vercel, Firebase Hosting, Netlify, etc.), you **MUST** configure the **exact same environment variables** in your deployment environment/settings as you defined in your local `.env.local` file.

*   **`NEXT_PUBLIC_FIREBASE_API_KEY`** (CRITICAL - App **will not start** without this set correctly in the deployment environment)
*   **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`**
*   **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`**
*   **`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`**
*   **`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`**
*   **`NEXT_PUBLIC_FIREBASE_APP_ID`**
*   **`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`** (Optional)
*   **`GOOGLE_GENAI_API_KEY`** (Ensure this is set as a *server-side* or *secret* environment variable in your hosting provider, **NOT** prefixed with `NEXT_PUBLIC_`).

**Refer to your hosting provider's documentation on how to set environment variables.** Failure to set these variables correctly in the deployment environment, especially the `NEXT_PUBLIC_` prefixed ones and **critically `NEXT_PUBLIC_FIREBASE_API_KEY`**, will cause Firebase initialization to fail, and the application will likely crash or fail to start, often showing the same `NEXT_PUBLIC_FIREBASE_API_KEY is not defined` or `auth/invalid-api-key` errors seen locally.

## Building for Production

```bash
npm run build
```

This command builds the application for production usage. Ensure environment variables are correctly set *before* the build process if your hosting provider requires build-time variables (though runtime variables set in the deployment environment are usually sufficient for Firebase client-side config). If the build fails with Firebase errors, check the environment variables available *during the build process*.

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
*   `src/ai/`: Genkit AI configuration and flows (if any).
*   `src/types/`: TypeScript type definitions.
*   `public/`: Static assets.
*   `.env.local.example`: Example environment file.
*   `.env.local`: **Your local environment variables (MUST BE CREATED AND FILLED CORRECTLY).**
