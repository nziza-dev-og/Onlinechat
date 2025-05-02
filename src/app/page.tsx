"use client";

import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth/auth-form';
import { ChatWindow } from '@/components/chat/chat-window';
import { Skeleton } from '@/components/ui/skeleton'; // Use Skeleton for initial loading

export default function Home() {
  const { user, loading } = useAuth();

  // Show a simple loading indicator while auth state is being determined
  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-secondary">
             {/* You can keep a minimal loading state here or just a blank screen */}
             <Skeleton className="h-16 w-16 rounded-full" />
      </div>
    );
  }

  // Once loading is false, render either ChatWindow or AuthForm
  return user ? <ChatWindow /> : <AuthForm />;
}
