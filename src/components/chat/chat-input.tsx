

"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Image as ImageIcon, X } from 'lucide-react'; // Import X for closing reply
import { useAuth } from '@/hooks/use-auth';
import { updateTypingStatus } from '@/lib/chat.service';
import { useToast } from "@/hooks/use-toast";
import type { Message } from '@/types'; // Import Message type
import { cn } from '@/lib/utils';

interface ChatInputProps {
  chatId: string | null;
  replyingTo: Message | null; // Message being replied to
  onClearReply: () => void; // Function to clear reply state
}

export function ChatInput({ chatId, replyingTo, onClearReply }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the message input

  // Focus input when reply context appears
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const sendTypingUpdate = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user?.uid) return;
    try {
        await updateTypingStatus(chatId, user.uid, isTyping);
    } catch (error) {
        console.error("Error sending typing update:", error);
    }
   }, [chatId, user?.uid]);


  useEffect(() => {
     return () => {
       if (typingTimeoutRef.current) {
         clearTimeout(typingTimeoutRef.current);
       }
       if (chatId && user?.uid) {
           sendTypingUpdate(false);
       }
     };
  }, [chatId, user?.uid, sendTypingUpdate]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (!chatId || !user?.uid) return;

    if (newMessage.trim() && !typingTimeoutRef.current) {
       sendTypingUpdate(true);
    }

    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
       sendTypingUpdate(false);
       typingTimeoutRef.current = null;
    }, 3000);
  };


  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();

    if (!user || !chatId || (!trimmedMessage && !trimmedImageUrl) || isSending) return;

    setIsSending(true);
    if (typingTimeoutRef.current) {
       clearTimeout(typingTimeoutRef.current);
       typingTimeoutRef.current = null;
       sendTypingUpdate(false);
    }

    const { uid, displayName, photoURL } = user;

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      const messageData: Omit<Message, 'id' | 'timestamp'> & { timestamp: any } = {
        text: trimmedMessage || '',
        imageUrl: trimmedImageUrl || null,
        timestamp: serverTimestamp(),
        uid,
        displayName,
        photoURL,
        // Include reply information if replyingTo is set
        replyToMessageId: replyingTo?.id ?? null,
        replyToMessageText: replyingTo?.text ?? null,
        replyToMessageAuthor: replyingTo?.displayName ?? null,
      };

      await addDoc(messagesRef, messageData);
      setMessage('');
      setImageUrl('');
      setShowImageUrlInput(false);
      onClearReply(); // Clear reply context after sending
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
      setImageUrl('');
    }
  };

  return (
    <div className="p-4 border-t bg-background space-y-2">
        {/* Reply Context Display */}
        {replyingTo && (
            <div className="flex items-center justify-between p-2 mb-2 text-sm bg-muted/50 rounded-md border-l-4 border-primary">
                <div className="flex-1 overflow-hidden mr-2">
                    <p className="font-medium text-primary truncate">
                        Replying to {replyingTo.displayName || 'Unknown'}
                    </p>
                    <p className="text-muted-foreground truncate italic">
                        {replyingTo.text || (replyingTo.imageUrl ? 'Image' : 'Original message')}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClearReply}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    aria-label="Cancel reply"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )}

      <form onSubmit={sendMessage} className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleImageUrlInput}
          disabled={!user || !chatId || isSending}
          aria-label="Toggle image URL input"
          className={cn(showImageUrlInput ? 'bg-accent text-accent-foreground' : '', "flex-shrink-0")} // Added flex-shrink-0
        >
          <ImageIcon className="h-5 w-5" />
        </Button>

        <Input
          ref={inputRef} // Add ref to input
          type="text"
          value={message}
          onChange={handleInputChange}
          placeholder={chatId ? (replyingTo ? "Write your reply..." : "Type a message...") : "Select a chat to start"}
          className="flex-1"
          disabled={!user || !chatId || isSending}
          aria-label="Chat message input"
        />

        <Button
           type="submit"
           size="icon"
           disabled={!user || !chatId || (!message.trim() && !imageUrl.trim()) || isSending}
           aria-label="Send message"
           className="flex-shrink-0" // Added flex-shrink-0
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {showImageUrlInput && (
        <div className="flex items-center gap-2 pl-12 pr-12"> {/* Adjust padding to align roughly */}
          <Input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Enter image URL..."
            className="flex-1 h-9 text-sm"
            disabled={!user || !chatId || isSending}
            aria-label="Image URL input"
          />
        </div>
      )}
    </div>
  );
}
