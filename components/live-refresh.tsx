"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a page up to date: when any of these tables change (and the signed-in
 * person can see the change), the page reloads its data in place.
 * Supabase Realtime only sends rows the person is allowed to read.
 */
export function LiveRefresh({ tables, channel }: { tables: string[]; channel: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several changes often land together (a decision and its message): refresh once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    let ch = supabase.channel(`${channel}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [router, channel, tables.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
