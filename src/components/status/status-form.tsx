
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { updateUserProfileDocument } from '@/lib/user-profile.service'; // Import the service
import type { UserProfile } from '@/types'; // Import UserProfile type

// Validation schema for the status form
const statusSchema = z.object({
  status: z.string().max(150, { message: "Status cannot exceed 150 characters." }).nullable(), // Allow null or string up to 150 chars
});

type StatusFormData = z.infer<typeof statusSchema>;

interface StatusFormProps {
    initialStatus: string | null | undefined; // Pass the current status
    onStatusUpdate: (newStatus: string | null) => void; // Callback after successful update
}

export function StatusForm({ initialStatus, onStatusUpdate }: StatusFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);

  const form = useForm<StatusFormData>({
    resolver: zodResolver(statusSchema),
    defaultValues: {
      status: initialStatus || '', // Initialize with current status or empty string
    },
  });

   // Reset form if initialStatus changes (e.g., fetched after mount)
   React.useEffect(() => {
     form.reset({ status: initialStatus || '' });
   }, [initialStatus, form]);


  const onSubmit = async (data: StatusFormData) => {
    if (!user) return;

    setIsSaving(true);
    const newStatus = data.status?.trim() || null; // Trim whitespace, store null if empty

    try {
      console.log(`Updating status for user ${user.uid} to: "${newStatus}"`);
      await updateUserProfileDocument(user.uid, { status: newStatus });
      toast({
        title: 'Status Updated!',
        description: newStatus ? `Your status is now "${newStatus}".` : 'Your status has been cleared.',
      });
      onStatusUpdate(newStatus); // Call the callback to update parent state if needed
      form.reset({ status: newStatus || '' }); // Reset form with the new status
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast({
        title: 'Update Failed',
        description: `Could not update status: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full shadow-md">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle>Update Your Status</CardTitle>
          <CardDescription>Let others know what you're up to (max 150 characters).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid w-full gap-1.5">
            <Label htmlFor="status">Your Status</Label>
            <Textarea
              id="status"
              placeholder="What's on your mind?"
              maxLength={150}
              {...form.register('status')}
              disabled={isSaving}
              className="min-h-[60px]"
            />
            {form.formState.errors.status && (
              <p className="text-sm text-destructive">{form.formState.errors.status.message}</p>
            )}
             <p className="text-xs text-muted-foreground text-right">
                {form.watch('status')?.length ?? 0} / 150
             </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Status
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
