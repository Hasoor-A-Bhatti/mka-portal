"use client";

import { createContext, useContext, type ReactNode } from "react";

const CanEdit = createContext(true);

/**
 * Tells everything inside whether the signed-in user can add and change things.
 * View only users get false: forms open read-only and add buttons are hidden.
 * The database enforces the same rule, so this only keeps the screen honest.
 */
export function EditAccess({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return <CanEdit.Provider value={canEdit}>{children}</CanEdit.Provider>;
}

export const useCanEdit = () => useContext(CanEdit);
