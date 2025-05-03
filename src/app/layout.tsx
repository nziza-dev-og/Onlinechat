
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter font for a modern look
import Link from 'next/link'; // Import Link
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/components/theme/theme-provider'; // Import ThemeProvider
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Button } from '@/components/ui/button'; // Import Button
import { User, MessageSquareText, Home, Image as ImageIcon, MessageCircle, Shield, LayoutDashboard, Clapperboard } from 'lucide-react'; // Added LayoutDashboard, Clapperboard

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
    // Remove any direct whitespace children of the <html> tag
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased flex flex-col min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
             {/* Optional: Add a simple global header */}
             <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
               <div className="container flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8"> {/* Added responsive padding */}
                 <Link href="/" className="mr-4 flex items-center space-x-2"> {/* Reduced mr-6 to mr-4 */}
                   {/* New logo icon */}
                   <MessageCircle className="h-6 w-6 text-primary" />
                   <span className="font-bold hidden sm:inline-block">Jules Chatting Platform</span> {/* Hide text on very small screens */}
                   <span className="font-bold sm:hidden inline-block">Jules</span> {/* Shorter name for small screens */}
                 </Link>
                 {/* Adjusted gap for responsiveness */}
                 <nav className="flex items-center gap-1 sm:gap-2">
                     {/* Dashboard Link */}
                     <Button variant="ghost" size="icon" asChild>
                        <Link href="/dashboard" aria-label="Go to Dashboard">
                            <LayoutDashboard className="h-5 w-5" />
                        </Link>
                     </Button>
                     {/* Chat Link */}
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
                     {/* Stories Link */}
                     <Button variant="ghost" size="icon" asChild>
                         <Link href="/stories" aria-label="View Stories">
                             <Clapperboard className="h-5 w-5" />
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
                     {/* Admin Link/Button (Consider conditional rendering based on user role) */}
                     <Button variant="ghost" size="icon" asChild>
                         <Link href="/admin" aria-label="Admin Dashboard">
                             <Shield className="h-5 w-5" />
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
        </ThemeProvider>
      </body>
    </html>
  );
}
