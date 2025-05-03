
"use client";

import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth/auth-form';
// Remove ChatWindow import as we redirect
// import { ChatWindow } from '@/components/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton'; // Use Skeleton for initial loading
import { Loader2 } from 'lucide-react'; // Import Loader2 for better loading indicator
import { useRouter } from 'next/navigation'; // Import useRouter for redirection
import React from 'react'; // Import React for useEffect

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Effect to handle redirection after loading state changes
  React.useEffect(() => {
    // Only redirect if loading is complete and user exists
    if (!loading && user) {
      router.replace('/dashboard'); // Redirect to the new dashboard page
    }
    // If loading is complete and no user, the AuthForm will be rendered below
  }, [user, loading, router]);

  // Show a more prominent loading indicator while auth state is being determined or redirecting
  if (loading || (!loading && user)) { // Show loading if loading OR if redirecting (user exists but redirect hasn't happened yet)
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary"> {/* Adjust min-height */}
             <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
             <p className="text-muted-foreground">{loading ? "Loading your session..." : "Redirecting to dashboard..."}</p>
      </div>
    );
  }

  // If loading is complete and there's no user, show the AuthForm
  return <AuthForm />;
}
