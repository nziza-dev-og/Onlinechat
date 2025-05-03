
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Users, MessageSquareText, Image as ImageIcon, User as UserIcon, LogOut, Settings, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { getOnlineUsersCount } from '@/lib/admin.service'; // Re-using admin service for count
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

// Helper to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?';
};

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [onlineUsers, setOnlineUsers] = React.useState<number | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(true);
  const { toast } = useToast();

  // Fetch analytics data on mount
  React.useEffect(() => {
    if (authLoading) {
        setLoadingAnalytics(true);
        return;
    }
    if (!user) {
        setLoadingAnalytics(false); // No user, no analytics needed
        setOnlineUsers(null);
        return;
    }

    const fetchAnalytics = async () => {
        setLoadingAnalytics(true);
        try {
            const onlineCount = await getOnlineUsersCount();
            setOnlineUsers(onlineCount);
        } catch (analyticsError: any) {
             console.error("Error fetching analytics for dashboard:", analyticsError);
             toast({
                 title: "Analytics Error",
                 description: analyticsError.message || "Could not load online user count.",
                 variant: "destructive",
             });
             setOnlineUsers(0); // Default to 0 on error
        } finally {
             setLoadingAnalytics(false);
        }
    };

    fetchAnalytics();

  }, [user, authLoading, toast]);


  // Loading state for authentication
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading your dashboard...</p>
      </div>
    );
  }

  // If user is not logged in, prompt to login (or redirect)
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.14))] bg-secondary p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <UserIcon className="h-12 w-12 mx-auto text-primary mb-3" />
            <CardTitle>Access Your Dashboard</CardTitle>
            <CardDescription>Please log in to view your dashboard and access chat features.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">Log In / Sign Up</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main Dashboard Content
  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-theme(spacing.14))] bg-muted/30 py-8 px-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Welcome Card */}
        <Card className="shadow-lg overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-4 p-6 bg-card border-b">
            <Avatar className="h-16 w-16 border">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} data-ai-hint="user avatar large" />
              <AvatarFallback className="text-2xl">{getInitials(user.displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-2xl font-bold text-foreground">
                Welcome back, {user.displayName || 'User'}!
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-1">
                Here's a quick overview of your platform activity.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="ml-auto">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardHeader>
        </Card>

        {/* Quick Actions & Analytics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Links Card */}
          <Card className="shadow-md col-span-1 lg:col-span-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Jump right back in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="default" className="w-full justify-start">
                <Link href="/">
                  <MessageSquareText className="mr-2 h-4 w-4" /> Go to Chat
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/posts">
                  <ImageIcon className="mr-2 h-4 w-4" /> View Posts Feed
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/profile">
                  <UserIcon className="mr-2 h-4 w-4" /> Edit Profile
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/status">
                   <Settings className="mr-2 h-4 w-4" /> Update Status
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Online Users Card */}
          <Card className="shadow-md col-span-1">
             <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                     <Users className="h-5 w-5 text-primary"/> Platform Activity
                 </CardTitle>
                 <CardDescription>Current online users.</CardDescription>
             </CardHeader>
             <CardContent className="text-center">
                 {loadingAnalytics && (
                    <div className="flex flex-col items-center space-y-2">
                        <Skeleton className="h-12 w-16 rounded-md" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                 )}
                 {!loadingAnalytics && onlineUsers !== null && (
                    <>
                     <p className="text-4xl font-bold text-foreground">{onlineUsers}</p>
                     <p className="text-sm text-muted-foreground mt-1">Users currently online</p>
                    </>
                 )}
                  {!loadingAnalytics && onlineUsers === null && (
                     <p className="text-sm text-destructive">Could not load data.</p>
                  )}
             </CardContent>
              <CardFooter className="text-xs text-muted-foreground justify-center">
                 Based on activity in the last 5 minutes.
              </CardFooter>
          </Card>

          {/* Placeholder for Recent Activity/Notifications */}
          <Card className="shadow-md col-span-1 md:col-span-2 lg:col-span-1 bg-gradient-to-br from-primary/10 to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-accent" /> More Features Coming Soon
              </CardTitle>
              <CardDescription>Watch this space for more insights!</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Future updates may include recent mentions, unread message summaries, and personalized activity feeds.
              </p>
              {/* Placeholder content */}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

    