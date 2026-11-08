import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { loadJaidat } from "@/lib/jaidat-server";
import type { Property } from "@/lib/jaidat";
import { PROPERTY_TABS, PropertyView, type PropertyTab } from "@/components/jaidat/property-view";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; open?: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Property" };
  const { supabase } = await getSession();
  const { data } = await supabase.from("jaidat_properties").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Property" };
}

export default async function PropertyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab, open: openId } = await searchParams;
  const tab: PropertyTab = PROPERTY_TABS.some((t) => t.key === rawTab) ? (rawTab as PropertyTab) : "overview";

  const { supabase, canAccess, canEdit, isManager } = await getSession();
  if (!canAccess("jaidat")) {
    return (
      <section className="notice glass">
        <h1>Jaidat isn&apos;t on your account</h1>
        <p>Ask an admin to add you to MKA Jaidat if you need it.</p>
      </section>
    );
  }
  if (!UUID.test(id)) notFound();

  // The property's own records, plus all properties (for moving tickets and costs between them).
  const [{ data, error }, { data: allProps }] = await Promise.all([
    loadJaidat(supabase, id),
    supabase.from("jaidat_properties").select("*").order("reference"),
  ]);
  const property = data.properties[0];
  if (!property) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;

  return (
    <PropertyView
      property={property}
      data={data}
      properties={(allProps ?? data.properties) as Property[]}
      error={error}
      origin={origin}
      tab={tab}
      openId={openId}
      canEdit={canEdit("jaidat")}
      canManage={isManager("jaidat")}
    />
  );
}
