
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter font for a modern look
import Link from 'next/link'; // Import Link
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/components/theme/theme-provider'; // Import ThemeProvider
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Button } from '@/components/ui/button'; // Import Button
import { User, MessageSquareText, Home, Image as ImageIcon, MessageCircle, Shield, LayoutDashboard, Clapperboard, Newspaper } from 'lucide-react'; // Added Newspaper for Feed

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Jules Chatting Platform', // Updated title
  description: 'A real-time chat application built with Next.js and Firebase.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased flex flex-col min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
             <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
               <div className="container flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8"> 
                 <Link href="/feed" className="mr-4 flex items-center space-x-2"> 
                   <MessageCircle className="h-6 w-6 text-primary" />
                   <span className="font-bold hidden sm:inline-block">Jules Chatting Platform</span> 
                   <span className="font-bold sm:hidden inline-block">Jules</span> 
                 </Link>
                 <nav className="flex items-center gap-1 sm:gap-2">
                     <Button variant="ghost" size="icon" asChild>
                        <Link href="/dashboard" aria-label="Go to Dashboard">
                            <LayoutDashboard className="h-5 w-5" />
                        </Link>
                     </Button>
                     {/* Chat Link - now points to / (original chat page) */}
                     <Button variant="ghost" size="icon" asChild>
                        <Link href="/" aria-label="Go to Direct Chat">
                            <MessageSquareText className="h-5 w-5" />
                        </Link>
                     </Button>
                     {/* Feed Link (New Home) */}
                     <Button variant="ghost" size="icon" asChild>
                        <Link href="/feed" aria-label="Go to Feed">
                            <Home className="h-5 w-5" />
                        </Link>
                     </Button>
                     <Button variant="ghost" size="icon" asChild>
                         <Link href="/posts" aria-label="View Posts/Create Post">
                             <Newspaper className="h-5 w-5" />
                         </Link>
                     </Button>
                     <Button variant="ghost" size="icon" asChild>
                         <Link href="/stories" aria-label="View Stories">
                             <Clapperboard className="h-5 w-5" />
                         </Link>
                     </Button>
                     <Button variant="ghost" size="icon" asChild>
                        <Link href="/status" aria-label="Update Status">
                           <ImageIcon className="h-5 w-5 opacity-0 absolute" /> {/* Keep for spacing consistency, but hide */}
                           {/* If you had a specific status icon, use it here or remove image icon if not needed */}
                           <MessageSquareText className="h-5 w-5" /> {/* Re-add if this was intended for status */}
                        </Link>
                     </Button>
                    <Button variant="ghost" size="icon" asChild>
                       <Link href="/profile" aria-label="View Profile">
                           <User className="h-5 w-5" />
                       </Link>
                    </Button>
                     <Button variant="ghost" size="icon" asChild>
                         <Link href="/admin" aria-label="Admin Dashboard">
                             <Shield className="h-5 w-5" />
                         </Link>
                     </Button>
                 </nav>
               </div>
             </header>

             <main className="flex-1">
                  {children}
             </main>

             <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
