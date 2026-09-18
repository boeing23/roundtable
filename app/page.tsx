"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ModelInfo, type TopicListItem } from "@/lib/client";
import { MemoryView } from "@/components/MemoryView";
import { ProfileView } from "@/components/ProfileView";
import { Sidebar } from "@/components/Sidebar";
import { TopicView } from "@/components/TopicView";

export default function Home() {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"topic" | "memory" | "profile">("topic");

  const applyTopics = useCallback((t: TopicListItem[]) => {
    setTopics(t);
    setSelected((s) => (s && t.some((x) => x.id === s) ? s : (t[0]?.id ?? null)));
  }, []);
  const refresh = useCallback(() => api.topics().then(applyTopics), [applyTopics]);

  useEffect(() => {
    void api.models().then((m) => setModels(m));
    void api.topics().then(applyTopics);
  }, [applyTopics]);

  const open = (id: string) => {
    setSelected(id);
    setView("topic");
  };

  const none = models && models.every((m) => !m.available);

  return (
    <div className="flex min-h-screen">
      <Sidebar topics={topics} selected={selected} view={view} onSelect={open} onMemory={() => setView("memory")} onProfile={() => setView("profile")} onCreated={(id) => void refresh().then(() => open(id))} onRefresh={() => void refresh()} />
      <main className="flex-1 flex flex-col min-w-0">
        {none && (
          <div className="px-4 py-2 text-sm bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            No API keys found. Copy <code>.env.example</code> to <code>.env.local</code>, add at least one key, restart <code>npm run dev</code>.
          </div>
        )}
        {view === "profile" ? (
          <ProfileView />
        ) : view === "memory" ? (
          <MemoryView onOpen={open} />
        ) : selected && models ? (
          <TopicView key={selected} topicId={selected} models={models} onTopicsChanged={() => void refresh()} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
            {models ? "Create a topic to start." : "Loading…"}
          </div>
        )}
      </main>
    </div>
  );
}
