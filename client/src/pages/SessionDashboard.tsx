import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, MoreVertical, Search, Star, Trash2, Edit3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { queryClient } from "@/lib/queryClient";
import { listSessionsFromFirebase, updateSessionMeta, deleteSessionLocally } from "@/lib/sessions";
import type { Session } from "@shared/schema";

interface SessionDashboardProps {
  onStartSession: () => void;
  onOpenSession: (sessionId: string) => void;
}

type FilterType = "All" | "Recent" | "Favorites" | "This week";
type SortType = "Newest first" | "By title A–Z";

const TIPS = [
  "Name sessions after the event to find them faster.",
  "Use the search bar to quickly locate past sessions.",
  "End sessions promptly to ensure accurate timestamps.",
  "Mark standout talks as Favorites to surface them later.",
];

function startOfWeekLocal(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function parseSessionDate(value: string) {
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}
function displayName(session: Session) {
  // @ts-ignore – tolerate unknown shape gracefully
  return session.displayName || session.name || "(Untitled)";
}

/** small helpers */
function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 shadow-sm backdrop-blur ${
        accent
          ? "bg-white/20 text-white border border-white/25"
          : "bg-white text-gray-900 border border-gray-100"
      }`}
    >
      <div
        className={`text-[12px] uppercase tracking-wide ${
          accent ? "text-white/80" : "text-gray-500"
        }`}
      >
        {label}
      </div>
      <div className={`mt-0.5 text-[22px] font-semibold ${accent ? "text-white" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] text-white/90 backdrop-blur">
      {children}
    </span>
  );
}

export function SessionDashboard({ onStartSession, onOpenSession }: SessionDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [sortBy, setSortBy] = useState<SortType>("Newest first");
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: sessions = [], isLoading, isError, refetch } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: listSessionsFromFirebase,
  });

  // Delete (optimistic)
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const prev = queryClient.getQueryData<Session[]>(["sessions"]) || [];
      queryClient.setQueryData(["sessions"], prev.filter((s) => s.id !== sessionId));
      try {
        await deleteSessionLocally(sessionId);
      } catch (e) {
        queryClient.setQueryData(["sessions"], prev);
        throw e;
      }
      return { success: true };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  // Favorite (optimistic)
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ sessionId, isFavorite }: { sessionId: string; isFavorite: boolean }) => {
      const prev = queryClient.getQueryData<Session[]>(["sessions"]) || [];
      queryClient.setQueryData(
        ["sessions"],
        prev.map((s) => (s.id === sessionId ? { ...s, isFavorite: !isFavorite } : s)),
      );
      try {
        await updateSessionMeta(sessionId, { isFavorite: !isFavorite });
      } catch (e) {
        queryClient.setQueryData(["sessions"], prev);
        throw e;
      }
      return { success: true };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  // Rename (optimistic)
  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, name }: { sessionId: string; name: string }) => {
      const prev = queryClient.getQueryData<Session[]>(["sessions"]) || [];
      queryClient.setQueryData(
        ["sessions"],
        prev.map((s) => (s.id === sessionId ? { ...s, name } : s)),
      );
      try {
        await updateSessionMeta(sessionId, { displayName: name });
      } catch (e) {
        queryClient.setQueryData(["sessions"], prev);
        throw e;
      }
      return { success: true };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  // Header info
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const weekStart = startOfWeekLocal(new Date());

  const thisWeekCount = useMemo(
    () => sessions.filter((s) => parseSessionDate(s.date) >= weekStart).length,
    [sessions, weekStart],
  );
  const favoritesCount = useMemo(() => sessions.filter((s) => s.isFavorite).length, [sessions]);
  const recentCount = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return sessions.filter((s) => parseSessionDate(s.date) >= sevenDaysAgo).length;
  }, [sessions]);

  // Derived list
  const filteredSessions = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const base = sessions.filter((session) => {
      const when = parseSessionDate(session.date);
      if (activeFilter === "Favorites" && !session.isFavorite) return false;
      if (activeFilter === "Recent" && when < sevenDaysAgo) return false;
      if (activeFilter === "This week" && when < weekStart) return false;
      return displayName(session).toLowerCase().includes(searchQuery.toLowerCase());
    });

    base.sort((a, b) => {
      if (sortBy === "By title A–Z") return displayName(a).localeCompare(displayName(b));
      return parseSessionDate(b.date).getTime() - parseSessionDate(a.date).getTime();
    });

    return base;
  }, [sessions, activeFilter, weekStart, searchQuery, sortBy]);

  // Rename helpers
  const startRename = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingSessionId(session.id);
    setRenameValue(displayName(session));
  };
  const submitRename = (sessionId: string) => {
    const name = renameValue.trim();
    setRenamingSessionId(null);
    if (!name) return;
    renameMutation.mutate({ sessionId, name });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRenamingSessionId(null);
        setRenameValue("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-4 text-sm text-gray-600 shadow-sm">
          Loading sessions…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 shadow-sm">
          Failed to load sessions.&nbsp;
          <button className="underline underline-offset-2 hover:opacity-80" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      {/* Hero / Header */}
      <header className="bg-gradient-to-r from-violet-600 to-blue-500">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="tracking-tight text-[22px] font-semibold text-white">SentiFrame</h1>
              <p className="mt-0.5 text-[13px] text-white/90">
                {greeting} 👋 — {today} • {thisWeekCount} {thisWeekCount === 1 ? "session" : "sessions"} this week
              </p>

              {/* leaner feature set */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill>Emotion timeline</Pill>
                <Pill>Live transcription</Pill>
                <Pill>AI summaries</Pill>
              </div>
            </div>

            <button
              onClick={onStartSession}
              data-testid="button-start-session"
              className="h-9 rounded-lg bg-white/95 px-4 text-[14px] font-medium text-gray-900 shadow
hover:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/60
hover:shadow-[0_10px_24px_-12px_rgba(124,58,237,0.45)]"

            >
              Start new session
            </button>
          </div>

          {/* Stats (glass on gradient) */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="All sessions" value={sessions.length} accent />
            <StatCard label="This week" value={thisWeekCount} accent />
            <StatCard label="Recent (7d)" value={recentCount} accent />
            <StatCard label="Favorites" value={favoritesCount} accent />
          </div>
        </div>
      </header>

      {/* Controls bar */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[16px] font-semibold text-gray-900">Your sessions</h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                data-testid="select-sort"
                className="h-9 rounded-md border border-gray-200 bg-white px-2.5 text-[13px] text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
              >
                <option>Newest first</option>
                <option>By title A–Z</option>
              </select>

              {/* Filters */}
              <div className="hidden gap-1 sm:flex">
                {(["All", "Recent", "Favorites", "This week"] as FilterType[]).map((filter) => {
                  const active = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      data-testid={`button-filter-${filter.toLowerCase().replace(" ", "-")}`}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] transition-all focus:outline-none focus:ring-2 ${
                        active
                          ? "bg-violet-600 text-white shadow focus:ring-violet-600/60"
                          : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-300/60"
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search sessions"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                  className="h-9 w-64 rounded-md border border-gray-200 bg-white pl-9 pr-3 text-[14px] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm">
              <FileText className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="mb-2 text-[18px] font-semibold text-gray-900">No sessions yet</h3>
            <p className="mb-6 text-[14px] text-gray-500">Click ‘Start new session’ to begin tracking sentiment</p>
            <button
              onClick={onStartSession}
              data-testid="button-empty-start"
              className="min-h-[44px] rounded-lg bg-violet-600 px-4 py-2 text-white shadow hover:bg-violet-700 active:translate-y-[1px] focus:outline-none focus:ring-2 focus:ring-violet-600/60"
              style={{ fontSize: "14px" }}
            >
              Start new session
            </button>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Grid */}
            <main className="min-w-0 flex-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSessions.map((session) => {
                  const name = displayName(session);
                  return (
                    <div
  key={session.id}
  data-testid={`card-session-${session.id}`}
  onClick={() => onOpenSession(session.id)}
  className="
    group cursor-pointer rounded-2xl border border-gray-100 bg-white p-4
    shadow-sm transition-all duration-200
    hover:-translate-y-[1px]
    hover:border-violet-400/50
    hover:ring-2 hover:ring-violet-500/40 hover:ring-offset-2 hover:ring-offset-[#f7f8fb]
    hover:shadow-lg hover:shadow-violet-500/20
    focus-within:ring-2 focus-within:ring-violet-500/60 focus-within:ring-offset-2 focus-within:ring-offset-[#f7f8fb]
  "
>

                      <div className="mb-2 flex items-start justify-between">
                        {renamingSessionId === session.id ? (
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitRename(session.id);
                              if (e.key === "Escape") {
                                setRenamingSessionId(null);
                                setRenameValue("");
                              }
                            }}
                            onBlur={() => submitRename(session.id)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`input-rename-${session.id}`}
                            autoFocus
                            className="h-8 -ml-2 px-2"
                            style={{ fontSize: 16 }}
                          />
                        ) : (
                          <div className="min-w-0 flex flex-1 items-center gap-1.5">
                            <h3 className="truncate text-[16px] font-medium text-gray-900" data-testid={`text-session-name-${session.id}`}>
                              {name}
                            </h3>
                            {session.isFavorite && (
                              <Star
                                className="h-4 w-4 flex-shrink-0 fill-amber-400 text-amber-400"
                                data-testid={`icon-favorite-${session.id}`}
                                aria-label="Favorite"
                              />
                            )}
                          </div>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-menu-${session.id}`}
                              aria-label="Open session menu"
                              className="flex-shrink-0 rounded-md p-2 transition-colors duration-100 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                            >
                              <MoreVertical className="h-4 w-4 text-gray-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(session, e as any);
                              }}
                              data-testid={`menu-rename-${session.id}`}
                            >
                              <Edit3 className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavoriteMutation.mutate({
                                  sessionId: session.id,
                                  isFavorite: session.isFavorite,
                                });
                              }}
                              data-testid={`menu-favorite-${session.id}`}
                            >
                              <Star className="mr-2 h-4 w-4" />
                              {session.isFavorite ? "Remove from favorites" : "Add to favorites"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this session?")) deleteMutation.mutate(session.id);
                              }}
                              data-testid={`menu-delete-${session.id}`}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <p className="text-sm text-gray-500" data-testid={`text-session-time-${session.id}`}>
                        {session.date} • {session.time}
                      </p>

                      <div className="mt-3 h-[1px] w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                      <div className="mt-2 text-[12px] text-gray-500">Click to view emotions, transcript & AI summary</div>
                    </div>
                  );
                })}
              </div>
            </main>

            {/* Sidebar – lighter, calmer */}
            <aside className="hidden w-72 flex-shrink-0 lg:block">
              <div className="sticky top-6 space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <h3 className="mb-1.5 text-[14px] font-semibold text-gray-900">💡 Daily Tip</h3>
                  <p className="text-[14px] leading-6 text-gray-600">
                    {TIPS[new Date().getDate() % TIPS.length]}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
