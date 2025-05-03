

"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, limit, where, addDoc, serverTimestamp, doc, getDoc, setDoc, Timestamp, updateDoc, type Unsubscribe, type FirestoreError } from 'firebase/firestore';
import type { Message, UserProfile, Chat } from '@/types';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut, Users, MessageSquare, Search, CircleDot } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { updateUserProfileDocument } from '@/lib/user-profile.service';
import { isFirebaseError } from '@/lib/firebase-errors';
import { formatDistanceToNowStrict } from 'date-fns';
import { updateTypingStatus } from '@/lib/chat.service';

// Helper function to create a unique chat ID between two users
const getChatId = (uid1: string, uid2: string): string => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// Consistent Helper function to get initials
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?'; // Default to '?' if no name
    const nameParts = name.trim().split(' ').filter(part => part.length > 0);
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length > 0) {
      return nameParts[0][0].toUpperCase();
    }
    return '?'; // Fallback if name is just whitespace or unusual format
};

// Helper to determine online status based on lastSeen timestamp
const isOnline = (lastSeen: Timestamp | Date | undefined): boolean => {
    if (!lastSeen) return false;
    const lastSeenDate = lastSeen instanceof Timestamp ? lastSeen.toDate() : lastSeen;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes tolerance
    return lastSeenDate > fiveMinutesAgo;
};

// Helper to format last seen time or 'Online'
const formatLastSeen = (lastSeen: Timestamp | Date | undefined): string => {
    if (isOnline(lastSeen)) {
        return 'Online';
    }
    if (!lastSeen) return ''; // No data
    const lastSeenDate = lastSeen instanceof Timestamp ? lastSeen.toDate() : lastSeen;
    // Use strict formatting for brevity, e.g., "5m", "2h", "3d"
    return formatDistanceToNowStrict(lastSeenDate, { addSuffix: true });
};


export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedChatPartner, setSelectedChatPartner] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null); // State for replying
  const { toast } = useToast();

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const isInitialMessagesLoadForScroll = useRef(true);
  const messageListenerUnsubscribe = useRef<Unsubscribe | null>(null);
  const userListenerUnsubscribe = useRef<Unsubscribe | null>(null);
  const chatDocListenerUnsubscribe = useRef<Unsubscribe | null>(null);

   const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, []);

   // Function to set the message being replied to
   const handleSetReplyTo = useCallback((message: Message | null) => {
     setReplyingToMessage(message);
   }, []);

   // Function to clear the reply state
   const clearReply = useCallback(() => {
     setReplyingToMessage(null);
   }, []);


   // Update user presence (lastSeen) periodically and on focus
   useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isFocused = typeof document !== 'undefined' ? document.hasFocus() : true;

    const updateUserPresence = async (reason: string) => {
        if (!user?.uid) {
          // console.log(`Presence update skipped (${reason}): No user.`);
          return;
        }
         if (!db) {
           console.warn(`Presence update skipped for ${user.uid} (${reason}): DB service not ready.`);
           return;
         }

        try {
           await updateUserProfileDocument(user.uid, { lastSeen: 'SERVER_TIMESTAMP' });
        } catch (error: any) {
           console.error(`🔴 Error updating user presence for ${user.uid} (${reason}):`, error.message, error);
           toast({
               title: "Presence Error",
               description: `Could not update online status. Error: ${error.message}`,
               variant: "destructive",
               duration: 5000,
           });
        }
      };


    const initialTimeoutId = setTimeout(() => updateUserPresence('initial'), 1500);
    intervalId = setInterval(() => updateUserPresence('interval'), 4 * 60 * 1000);

    const handleFocus = () => {
        if (!isFocused) {
            isFocused = true;
            updateUserPresence('focus');
        }
    };

    const handleBlur = () => {
        isFocused = false;
         if (user?.uid && chatId) {
             updateTypingStatus(chatId, user.uid, false);
         }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
    }

    return () => {
      clearTimeout(initialTimeoutId);
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleBlur);
      }
       if (user?.uid && chatId) {
           updateTypingStatus(chatId, user.uid, false);
       }
    };
  }, [user, chatId, toast]);


  // Fetch users from Firestore 'users' collection
  useEffect(() => {
    if (userListenerUnsubscribe.current) {
      userListenerUnsubscribe.current();
      userListenerUnsubscribe.current = null;
    }

    if (!user || !db) {
      setUsers([]);
      setLoadingUsers(!user); // Loading is true only if user is expected but not yet available
      return;
    }

    setLoadingUsers(true);
    console.log(`Setting up Firestore listener for 'users' collection, excluding self: ${user.uid}`);
    const usersQuery = query(collection(db, 'users'));

    userListenerUnsubscribe.current = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers: UserProfile[] = snapshot.docs
        .map(doc => {
          const data = doc.data();
          if (!data.uid || typeof data.uid !== 'string') {
            console.warn("Fetched user document missing or invalid UID:", doc.id, data);
            return null;
          }
          return {
            uid: data.uid,
            displayName: data.displayName ?? null,
            email: data.email ?? null,
            photoURL: data.photoURL ?? null,
            status: data.status ?? null,
            lastSeen: data.lastSeen instanceof Timestamp ? data.lastSeen : undefined,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : undefined,
          };
        })
        .filter((u): u is UserProfile => u !== null && u.uid !== user.uid);

      fetchedUsers.sort((a, b) => {
          const onlineA = isOnline(a.lastSeen);
          const onlineB = isOnline(b.lastSeen);
          if (onlineA && !onlineB) return -1;
          if (!onlineA && onlineB) return 1;

          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
      });

      setUsers(fetchedUsers);
      setLoadingUsers(false);

      if (selectedChatPartner) {
          const updatedPartner = fetchedUsers.find(u => u.uid === selectedChatPartner.uid);
          if (updatedPartner) {
             setSelectedChatPartner(updatedPartner);
          } else {
              console.warn(`Selected chat partner ${selectedChatPartner.uid} not found in latest snapshot.`);
              setSelectedChatPartner(null);
              setChatId(null);
              setReplyingToMessage(null); // Clear reply if partner disappears
          }
      }

    }, (error: FirestoreError) => {
      console.error("🔴 Error fetching users from Firestore:", error.code, error.message, error);
      setLoadingUsers(false);
      userListenerUnsubscribe.current = null;
      toast({
        title: "Error Fetching Users",
        description: `Could not load user list: ${error.message} (${error.code})`,
        variant: "destructive",
      });
    });

    return () => {
      if (userListenerUnsubscribe.current) {
        userListenerUnsubscribe.current();
        userListenerUnsubscribe.current = null;
      }
    };
  }, [user, toast]);


  // Fetch messages and listen to chat document for typing status
  useEffect(() => {
     if (messageListenerUnsubscribe.current) {
        messageListenerUnsubscribe.current();
        messageListenerUnsubscribe.current = null;
      }
      if (chatDocListenerUnsubscribe.current) {
          chatDocListenerUnsubscribe.current();
          chatDocListenerUnsubscribe.current = null;
      }

    if (!user || !selectedChatPartner || !db) {
        setMessages([]);
        setLoadingMessages(false);
        setChatId(null);
        setIsPartnerTyping(false);
        setReplyingToMessage(null); // Clear reply when chat changes
        isInitialMessagesLoadForScroll.current = true;
        return;
    }

    setLoadingMessages(true);
    isInitialMessagesLoadForScroll.current = true;
    const currentChatId = getChatId(user.uid, selectedChatPartner.uid);
    setChatId(currentChatId);

    const messagesQuery = query(
      collection(db, 'chats', currentChatId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    messageListenerUnsubscribe.current = onSnapshot(messagesQuery, (querySnapshot) => {
       const newMessagesBatch: Message[] = [];
       let newMessagesAdded = false;

       querySnapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              const data = change.doc.data();
              if (!(data.timestamp instanceof Timestamp) || !data.uid) {
                 console.warn("Skipping invalid message:", change.doc.id, data);
                 return;
              }
              if (typeof data.text !== 'string' && typeof data.imageUrl !== 'string') {
                   console.warn("Skipping message with no text or image:", change.doc.id, data);
                   return;
              }

               const message: Message = {
                  id: change.doc.id,
                  text: data.text ?? '',
                  imageUrl: data.imageUrl ?? null,
                  timestamp: data.timestamp,
                  uid: data.uid,
                  displayName: data.displayName ?? null,
                  photoURL: data.photoURL ?? null,
                  // Include reply fields
                  replyToMessageId: data.replyToMessageId ?? null,
                  replyToMessageText: data.replyToMessageText ?? null,
                  replyToMessageAuthor: data.replyToMessageAuthor ?? null,
               };
               newMessagesBatch.push(message);
               newMessagesAdded = true;

                 const isDifferentUser = message.uid !== user?.uid;
                 const isTabHidden = typeof document !== 'undefined' && document.hidden;
                 const isChatSelected = !!selectedChatPartner;

                 if (isDifferentUser && isTabHidden && isChatSelected) {
                     toast({
                         title: `New message from ${message.displayName || 'User'}`,
                         description: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
                         duration: 5000,
                     });
                      if (typeof document !== 'undefined' && !document.title.startsWith('(*)')) {
                           document.title = `(*) ${document.title}`;
                      }
                 }
          }
       });

       if (newMessagesAdded) {
           setMessages(prevMessages => {
               const existingIds = new Set(prevMessages.map(m => m.id));
               const trulyNewMessages = newMessagesBatch.filter(m => !existingIds.has(m.id));
               if (trulyNewMessages.length === 0) return prevMessages;
               const combined = [...prevMessages, ...trulyNewMessages];
               return combined.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
           });
       }

       setLoadingMessages(false);

        setTimeout(() => {
            const shouldScroll = (isInitialMessagesLoadForScroll.current || newMessagesAdded)
                                  && typeof document !== 'undefined' && !document.hidden
                                  && !!selectedChatPartner;
            if (shouldScroll) {
                 scrollToBottom();
            }
            if (isInitialMessagesLoadForScroll.current && newMessagesAdded) {
                 isInitialMessagesLoadForScroll.current = false;
            }
        }, 100);

    }, (error: FirestoreError) => {
        console.error(`🔴 Error fetching messages for chat ${currentChatId}:`, error.code, error.message, error);
        setLoadingMessages(false);
        isInitialMessagesLoadForScroll.current = false;
        messageListenerUnsubscribe.current = null;
        toast({
            title: "Error Fetching Messages",
            description: `Could not load messages: ${error.message} (${error.code})`,
            variant: "destructive",
        });
    });

    const chatDocRef = doc(db, 'chats', currentChatId);
    chatDocListenerUnsubscribe.current = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const chatData = docSnap.data() as Chat;
            const partnerTyping = chatData.typing?.[selectedChatPartner.uid] ?? false;
            setIsPartnerTyping(partnerTyping);
        } else {
            console.warn(`Chat document ${currentChatId} does not exist yet for typing listener.`);
            setIsPartnerTyping(false);
        }
    }, (error: FirestoreError) => {
        console.error(`🔴 Error listening to chat document ${currentChatId}:`, error.code, error.message);
        setIsPartnerTyping(false);
        chatDocListenerUnsubscribe.current = null;
    });


     return () => {
        if (messageListenerUnsubscribe.current) {
          messageListenerUnsubscribe.current();
          messageListenerUnsubscribe.current = null;
        }
        if (chatDocListenerUnsubscribe.current) {
            chatDocListenerUnsubscribe.current();
            chatDocListenerUnsubscribe.current = null;
        }
      };

  }, [user, selectedChatPartner, toast, scrollToBottom]);


  useEffect(() => {
    const handleFocus = () => {
        if (typeof document !== 'undefined' && document.title.startsWith('(*)')) {
            document.title = document.title.replace(/^\(\*\)\s*/, '');
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
    }
    handleFocus();

    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', handleFocus);
        }
    };
  }, []);


  const handleSelectUser = useCallback(async (partner: UserProfile) => {
     if (selectedChatPartner?.uid !== partner.uid && user?.uid) {
        if (chatId && user.uid) {
            try {
                await updateTypingStatus(chatId, user.uid, false);
            } catch (error) {
                 console.error("Error setting typing to false on chat switch:", error);
            }
        }

        setSelectedChatPartner(partner);
        setMessages([]);
        setLoadingMessages(true);
        setIsPartnerTyping(false);
        setReplyingToMessage(null); // Clear reply state when switching chats
        isInitialMessagesLoadForScroll.current = true;
        const newChatId = getChatId(user.uid, partner.uid);
        setChatId(newChatId);

        if (db) {
            const chatDocRef = doc(db, 'chats', newChatId);
            try {
                const chatDocSnap = await getDoc(chatDocRef);
                if (!chatDocSnap.exists()) {
                    await setDoc(chatDocRef, {
                        participants: [user.uid, partner.uid],
                        createdAt: serverTimestamp(),
                        typing: {}
                    });
                } else {
                     const chatData = chatDocSnap.data();
                     if (!chatData.typing) {
                         await updateDoc(chatDocRef, { typing: {} });
                     }
                }
            } catch (error) {
                console.error(`Error ensuring chat document ${newChatId} exists:`, error);
                toast({
                    title: "Chat Error",
                    description: "Could not initialize chat session.",
                    variant: "destructive"
                });
            }
        }
      }
  }, [selectedChatPartner?.uid, user?.uid, chatId, toast]);


   const filteredUsers = users.filter(u =>
    (u.displayName && u.displayName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );


  return (
    <div className="flex h-[calc(100vh-theme(spacing.14))] bg-secondary">
       <aside className="w-64 flex flex-col border-r bg-background shadow-md">
         <header className="flex items-center justify-between p-4 border-b min-h-[65px]">
             <div className="flex items-center gap-2 overflow-hidden mr-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || 'My Avatar'} data-ai-hint="current user profile avatar"/>
                    <AvatarFallback>{getInitials(user?.displayName || user?.email)}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground truncate flex-1 min-w-0 text-sm">{user?.displayName || user?.email || 'User'}</span>
             </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="flex-shrink-0 text-muted-foreground hover:text-destructive h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
         </header>

         <div className="p-3 border-b">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search users..."
                    className="pl-8 h-9 bg-muted/50 focus:bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search for users to chat with"
                />
            </div>
         </div>

         <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
                 {loadingUsers && (
                     <div className="space-y-1 p-2">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-3 p-2 h-[52px]">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            </div>
                        ))}
                     </div>
                 )}
                 {!loadingUsers && filteredUsers.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                         <Users className="h-10 w-10 mb-3 text-primary/70" />
                        <p className="text-sm font-medium">
                            {searchTerm ? "No users found" : (users.length === 0 ? "No other users available" : "No users found matching search")}
                        </p>
                         {searchTerm && <p className="text-xs mt-1">Try a different name or email.</p>}
                         {!searchTerm && users.length === 0 && <p className="text-xs mt-1">Invite others or wait for them to join!</p>}
                    </div>
                 )}
                 {!loadingUsers && filteredUsers.map((u) => (
                     <Button
                        key={u.uid}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2 px-3 text-left rounded-md",
                            "gap-3 items-center relative",
                            selectedChatPartner?.uid === u.uid ? "bg-accent text-accent-foreground hover:bg-accent/90" : "hover:bg-muted/50"
                        )}
                        onClick={() => handleSelectUser(u)}
                        aria-pressed={selectedChatPartner?.uid === u.uid}
                    >
                        {isOnline(u.lastSeen) && (
                            <span className="absolute left-1 top-1.5 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" aria-label="Online"/>
                        )}
                        <Avatar className="h-8 w-8 flex-shrink-0 ml-1">
                            <AvatarImage src={u.photoURL || undefined} alt={u.displayName || 'User Avatar'} data-ai-hint="user chat list avatar"/>
                            <AvatarFallback>{getInitials(u.displayName || u.email)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-medium truncate text-sm">{u.displayName || u.email || 'Unnamed User'}</span>
                            {!isOnline(u.lastSeen) && u.status && (
                                <span className="text-xs text-muted-foreground truncate italic">
                                    {u.status}
                                </span>
                            )}
                             {!isOnline(u.lastSeen) && !u.status && u.lastSeen && (
                                 <span className="text-xs text-muted-foreground truncate">
                                     {formatLastSeen(u.lastSeen)}
                                 </span>
                             )}
                        </div>
                    </Button>
                 ))}
            </div>
         </ScrollArea>
       </aside>

       <main className="flex-1 flex flex-col bg-background">
            {selectedChatPartner ? (
                 <>
                 <header className="flex items-center gap-3 p-4 border-b shadow-sm bg-card min-h-[65px]">
                    <div className="relative">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Chat partner avatar'} data-ai-hint="chat partner avatar"/>
                            <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                        </Avatar>
                        {isOnline(selectedChatPartner.lastSeen) && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card border border-background" aria-label="Online"/>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-card-foreground">{selectedChatPartner.displayName || selectedChatPartner.email}</span>
                        <span className="text-xs text-muted-foreground">
                           {isOnline(selectedChatPartner.lastSeen)
                               ? (selectedChatPartner.status || 'Online')
                               : (selectedChatPartner.status || formatLastSeen(selectedChatPartner.lastSeen))
                           }
                        </span>
                    </div>
                 </header>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                        <div ref={viewportRef} className="h-full flex flex-col p-4 space-y-2">
                            <div className="flex-grow" />
                            {loadingMessages && messages.length === 0 && (
                                <div className="space-y-4 p-4">
                                    {[...Array(4)].map((_, i) => (
                                        <React.Fragment key={i}>
                                         <Skeleton className={cn("h-12 rounded-lg", i % 2 === 0 ? "w-3/5 self-start" : "w-3/4 self-end")}/>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                            {!loadingMessages && messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-6">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-3 text-primary/80" />
                                    <p className="font-medium">Start your conversation!</p>
                                    <p className="text-sm">Send a message to {selectedChatPartner.displayName || selectedChatPartner.email}.</p>
                                </div>
                            )}
                            <div className="pb-4">
                                {messages.map((msg) => (
                                    <ChatMessage
                                        key={msg.id}
                                        message={msg}
                                        onReply={() => handleSetReplyTo(msg)} // Pass reply handler
                                     />
                                ))}
                            </div>
                            {isPartnerTyping && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse px-2 pb-2">
                                    <Avatar className="h-7 w-7 flex-shrink-0">
                                        <AvatarImage src={selectedChatPartner.photoURL || undefined} alt={selectedChatPartner.displayName || 'Typing avatar'} data-ai-hint="typing indicator avatar"/>
                                        <AvatarFallback>{getInitials(selectedChatPartner.displayName || selectedChatPartner.email)}</AvatarFallback>
                                    </Avatar>
                                    <span>is typing...</span>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <ChatInput
                    chatId={chatId}
                    replyingTo={replyingToMessage} // Pass replyingTo state
                    onClearReply={clearReply} // Pass clear reply handler
                 />
                </>
            ) : (
                 <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8 bg-gradient-to-br from-background to-muted/30">
                    <Users className="h-16 w-16 mb-4 text-primary opacity-80" />
                    <h2 className="text-xl font-semibold text-foreground mb-1">Select a Chat</h2>
                    <p className="text-base mb-4 max-w-xs">Choose someone from the list on the left to start messaging.</p>
                </div>
            )}
       </main>
    </div>
  );
}

