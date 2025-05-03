
import { FirebaseError } from 'firebase/app';

/**
 * Type guard to check if an error is a FirebaseError.
 *
 * @param error - The error object to check.
 * @returns True if the error is an instance of FirebaseError, false otherwise.
 */
export const isFirebaseError = (error: unknown): error is FirebaseError => {
  return error instanceof FirebaseError;
};
