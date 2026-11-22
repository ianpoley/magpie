import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { SettingsScreen } from "@/components/settings-screen";
import { readSettings } from "@/lib/settings-state";
import { readSyncState } from "@/lib/sync-state";

export const metadata: Metadata = { title: "Settings · Magpie" };

async function Settings() {
  await connection();
  const [settings, sync] = await Promise.all([readSettings(), readSyncState()]);
  if (sync.connection === "not_connected" || !settings.jevKeyStored || !settings.focus.chosen) redirect("/");
  return <SettingsScreen settings={settings} sync={sync} />;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="bg-wash min-h-dvh" />}>
      <Settings />
    </Suspense>
  );
}
