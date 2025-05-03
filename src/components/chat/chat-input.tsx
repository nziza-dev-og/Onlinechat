
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase'; // Keep auth import if needed elsewhere, but user comes from useAuth
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service'; // Import the server action
import { useToast } from "@/hooks/use-toast";

interface ChatInputProps {
  chatId: string | null; // ID of the chat document
}

export function ChatInput({ chatId }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Typing Indicator Logic ---
  const sendTypingUpdate = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user?.uid) return;
    try {
        // console.log(`Calling updateTypingStatus: chatId=${chatId}, userId=${user.uid}, isTyping=${isTyping}`);
        await updateTypingStatus(chatId, user.uid, isTyping);
        // console.log(`Successfully updated typing status to ${isTyping}`);
    } catch (error) {
        console.error("Error sending typing update:", error);
        // Optionally show a toast for typing status errors? Likely too noisy.
    }
   }, [chatId, user?.uid]);


  useEffect(() => {
     // Cleanup function to clear timeout and set typing to false when component unmounts or chatId/user changes
     return () => {
       if (typingTimeoutRef.current) {
         clearTimeout(typingTimeoutRef.current);
       }
       // Ensure typing status is false on unmount/dependency change
       if (chatId && user?.uid) {
           sendTypingUpdate(false);
       }
     };
  }, [chatId, user?.uid, sendTypingUpdate]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (!chatId || !user?.uid) return;

    // If user starts typing (and wasn't already marked as typing)
    if (newMessage.trim() && !typingTimeoutRef.current) {
       sendTypingUpdate(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
    }

    // Set a new timeout to mark user as not typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
       sendTypingUpdate(false);
       typingTimeoutRef.current = null; // Reset ref after timeout executes
    }, 3000); // 3 seconds
  };


  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();

    if (!user || !chatId || (!trimmedMessage && !trimmedImageUrl) || isSending) return;

    setIsSending(true);
    // Clear typing timeout immediately on send
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       // Send final 'not typing' status
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      await addDoc(messagesRef, {
        text: trimmedMessage || '', // Send empty string if no text but image exists
        imageUrl: trimmedImageUrl || null, // Send null if no image URL
        timestamp: serverTimestamp(),
        uid,
        displayName,
        photoURL,
      });
      setMessage('');
      setImageUrl('');
      setShowImageUrlInput(false); // Hide image input after sending
    } catch (error) {
        console.error("Error sending message:", error);
        toast({
            title: "Send Error",
            description: "Could not send message. Please try again.",
            variant: "destructive"
        });
    } finally {
        setIsSending(false);
    }
  };

  const toggleImageUrlInput = () => {
    setShowImageUrlInput(!showImageUrlInput);
    if (showImageUrlInput) {
      setImageUrl(''); // Clear URL if hiding the input
    }
  };

  return (
    <div className="p-4 border-t bg-background space-y-2">
      <form onSubmit={sendMessage} className="flex items-center gap-2">
        {/* Image Toggle Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleImageUrlInput}
          disabled={!user || !chatId || isSending}
          aria-label="Toggle image URL input"
          className={showImageUrlInput ? 'bg-accent text-accent-foreground' : ''}
        >
          <ImageIcon className="h-5 w-5" />
        </Button>

        {/* Message Input */}
        <Input
          type="text"
          value={message}
          onChange={handleInputChange}
          placeholder={chatId ? "Type a message..." : "Select a chat to start"}
          className="flex-1"
          disabled={!user || !chatId || isSending}
          aria-label="Chat message input"
        />

        {/* Send Button */}
        <Button
           type="submit"
           size="icon"
           disabled={!user || !chatId || (!message.trim() && !imageUrl.trim()) || isSending}
           aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {/* Image URL Input (Conditional) */}
      {showImageUrlInput && (
        <div className="flex items-center gap-2 pl-12 pr-12"> {/* Align with text input */}
          <Input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Enter image URL..."
            className="flex-1 h-9 text-sm" // Smaller height
            disabled={!user || !chatId || isSending}
            aria-label="Image URL input"
          />
          {/* Optionally add a small clear button for the URL */}
        </div>
      )}
    </div>
  );
}
