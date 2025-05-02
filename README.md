# Firebase Studio - React Chat App

This is a Next.js chat application built with Firebase for authentication, real-time database (Firestore), and storage. It includes user profiles and real-time messaging features.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set Up Environment Variables:**

    *   Copy the example environment file:
        ```bash
        cp .env.local.example .env.local
        ```
    *   Open `.env.local` and replace the placeholder values with your actual Firebase project configuration and your Google Generative AI API key.
        *   You can find your Firebase project configuration in your Firebase project settings (Project settings > General > Your apps > Web app > SDK setup and configuration > Config).
        *   You need to enable the Generative Language API (e.g., Gemini) in your Google Cloud project associated with Firebase and generate an API key.
    *   **Important:**
        *   Firebase variables (`NEXT_PUBLIC_FIREBASE_*`) **must** have the `NEXT_PUBLIC_` prefix to be accessible by the client-side code.
        *   The `GOOGLE_GENAI_API_KEY` **must not** have the `NEXT_PUBLIC_` prefix as it should only be used server-side.

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

## Deployment

When deploying your application to a hosting provider (like Vercel, Firebase Hosting, Netlify, etc.), you need to configure the **same environment variables** in your deployment environment/settings.

*   **`NEXT_PUBLIC_FIREBASE_API_KEY`**
*   **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`**
*   **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`**
*   **`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`**
*   **`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`**
*   **`NEXT_PUBLIC_FIREBASE_APP_ID`**
*   **`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`** (Optional)
*   **`GOOGLE_GENAI_API_KEY`** (Ensure this is set as a *server-side* or *secret* environment variable, **not** prefixed with `NEXT_PUBLIC_`).

Refer to your hosting provider's documentation on how to set environment variables. Failure to set these variables correctly in the deployment environment will cause Firebase initialization or AI features to fail.

## Building for Production

```bash
npm run build
```

This command builds the application for production usage. Ensure environment variables are correctly set during the build process if your hosting provider requires it.

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
