
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter font for a modern look
import Link from 'next/link'; // Import Link
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Button } from '@/components/ui/button'; // Import Button
import { User, MessageSquareText, Home, Image as ImageIcon, MessageCircle } from 'lucide-react'; // Import User, MessageSquareText, Home, Image, MessageCircle icons

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
    <html lang="en">
      <body className={`${inter.className} antialiased flex flex-col min-h-screen`}>
        <AuthProvider>
           {/* Optional: Add a simple global header */}
           <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
             <div className="container flex h-14 items-center justify-between">
               <Link href="/" className="mr-6 flex items-center space-x-2">
                 {/* New logo icon */}
                 <MessageCircle className="h-6 w-6 text-primary" />
                 <span className="font-bold inline-block">Jules Chatting Platform</span> {/* Updated app name */}
               </Link>
               <nav className="flex items-center gap-2 sm:gap-4"> {/* Reduced gap on small screens */}
                   {/* Home/Chat Link */}
                   <Button variant="ghost" size="icon" asChild>
                      <Link href="/" aria-label="Go to Chat">
                          <Home className="h-5 w-5" />
                      </Link>
                   </Button>
                   {/* Posts Link */}
                   <Button variant="ghost" size="icon" asChild>
                       <Link href="/posts" aria-label="View Posts">
                           <ImageIcon className="h-5 w-5" />
                       </Link>
                   </Button>
                   {/* Status Link/Button */}
                   <Button variant="ghost" size="icon" asChild>
                      <Link href="/status" aria-label="Update Status">
                          <MessageSquareText className="h-5 w-5" />
                      </Link>
                   </Button>
                  {/* Profile Link/Button */}
                  <Button variant="ghost" size="icon" asChild>
                     <Link href="/profile" aria-label="View Profile">
                         <User className="h-5 w-5" />
                     </Link>
                  </Button>
               </nav>
             </div>
           </header>

            {/* Main content area */}
           <main className="flex-1">
                {children}
           </main>

            {/* Toaster for notifications */}
           <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
