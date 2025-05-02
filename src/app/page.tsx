
"use client";

import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth/auth-form';
import { ChatWindow } from '@/components/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton'; // Use Skeleton for initial loading
import { Loader2 } from 'lucide-react'; // Import Loader2 for better loading indicator

export default function Home() {
  const { user, loading } = useAuth();

  // Show a more prominent loading indicator while auth state is being determined
  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary"> {/* Adjust min-height */}
             <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
             <p className="text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  // Once loading is false, render either ChatWindow or AuthForm
  // Ensure ChatWindow also has adjusted height if necessary
  return user ? <ChatWindow /> : <AuthForm />;
}
