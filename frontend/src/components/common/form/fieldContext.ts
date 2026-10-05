'use client';

import { createContext, useContext } from 'react';
import type { FieldError } from 'react-hook-form';

/** What `FormField` knows about its field: the name and the current error. */
export interface FieldState {
  name: string;
  error?: FieldError;
}
export const FieldStateContext = createContext<FieldState | null>(null);
export const useFieldState = (): FieldState | null => useContext(FieldStateContext);

/** What `FormItem` hands to its control and message: one id, one message id. */
export interface ItemIds {
  id: string;
  messageId: string;
}
export const ItemIdsContext = createContext<ItemIds | null>(null);
export const useItemIds = (): ItemIds | null => useContext(ItemIdsContext);
