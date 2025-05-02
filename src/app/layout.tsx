
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter font for a modern look
import Link from 'next/link'; // Import Link
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { Button } from '@/components/ui/button'; // Import Button
import { User } from 'lucide-react'; // Import User icon


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'React Chat App', // Updated title
  description: 'A real-time chat application built with Next.js and Firebase.', // Updated description
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
                 {/* You can add a logo here */}
                 <span className="font-bold inline-block">Chat App</span>
               </Link>
               <nav className="flex items-center gap-4">
                 {/* Profile Link/Button - Consider showing only when logged in via useAuth hook usage here or in a dedicated Header component */}
                 <Button variant="ghost" size="icon" asChild>
                    <Link href="/profile" aria-label="View Profile">
                        <User className="h-5 w-5" />
                    </Link>
                 </Button>
                 {/* Add other nav links if needed */}
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
```