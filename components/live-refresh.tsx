"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a page up to date: when any of these tables change (and the signed-in
 * person can see the change), the page reloads its data in place.
 * Supabase Realtime only sends rows the person is allowed to read.
 *
 * `filter` (e.g. "delegation_id=eq.<id>") limits inserts and updates to one
 * record's rows. Deletes can't be filtered by Realtime, so any delete in these
 * tables still refreshes the page (they're rare).
 */
export function LiveRefresh({ tables, channel, filter }: { tables: string[]; channel: string; filter?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several changes often land together (a decision and its message, a whole group saved): refresh once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    let ch = supabase.channel(`${channel}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      if (filter) {
        ch = ch
          .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, refresh)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, refresh)
          .on("postgres_changes", { event: "DELETE", schema: "public", table }, refresh);
      } else {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      }
    }
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [router, channel, filter, tables.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
