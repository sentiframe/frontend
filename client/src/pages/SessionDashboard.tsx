import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, MoreVertical, Upload, Search, Star, Trash2, Edit3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  "Export reports as CSV for deeper analysis.",
  "End sessions promptly to ensure accurate timestamps.",
];

export function SessionDashboard({ onStartSession, onOpenSession }: SessionDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [sortBy, setSortBy] = useState<SortType>("Newest first");
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Fetch sessions
  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ sessionId, isFavorite }: { sessionId: string; isFavorite: boolean }) => {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !isFavorite }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });

  // Rename session mutation
  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, name }: { sessionId: string; name: string }) => {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });

  // Get current time of day greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  
  // Format current date
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Calculate sessions this week
  const getStartOfWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.setDate(diff));
  };

  const startOfWeek = getStartOfWeek();
  const thisWeekCount = sessions.filter(session => {
    const sessionDate = new Date(session.date);
    return sessionDate >= startOfWeek;
  }).length;

  // Get daily rotating tip
  const tipIndex = new Date().getDate() % TIPS.length;
  const todaysTip = TIPS[tipIndex];

  // Helper function to parse session date
  const parseSessionDate = (dateStr: string) => {
    return new Date(dateStr);
  };

  // Filter and sort sessions
  const filteredSessions = sessions
    .filter((session) => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sessionDate = parseSessionDate(session.date);

      switch (activeFilter) {
        case "Favorites":
          if (!session.isFavorite) return false;
          break;
        case "Recent":
          if (sessionDate < sevenDaysAgo) return false;
          break;
        case "This week":
          if (sessionDate < startOfWeek) return false;
          break;
        case "All":
        default:
          break;
      }

      return session.name.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === "By title A–Z") {
        return a.name.localeCompare(b.name);
      }
      const dateA = parseSessionDate(a.date);
      const dateB = parseSessionDate(b.date);
      return dateB.getTime() - dateA.getTime();
    });

  const handleRenameClick = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingSessionId(session.id);
    setRenameValue(session.name);
  };

  const handleRenameSubmit = (sessionId: string) => {
    if (renameValue.trim()) {
      renameMutation.mutate({ sessionId, name: renameValue.trim() });
    }
    setRenamingSessionId(null);
    setRenameValue("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === "Enter") {
      handleRenameSubmit(sessionId);
    } else if (e.key === "Escape") {
      setRenamingSessionId(null);
      setRenameValue("");
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-6 pt-6 pb-4 border-b border-gray-200">
        <div className="mx-auto max-w-6xl">
          <h1 className="tracking-tight" style={{ fontSize: "21px", fontWeight: 500 }}>
            SentiFrame
          </h1>
          <p className="mt-1" style={{ color: "#6b7280", fontSize: "13px" }}>
            {greeting} 👋 — {today} • {thisWeekCount} {thisWeekCount === 1 ? "session" : "sessions"} this week
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onStartSession}
              data-testid="button-start-session"
              className="px-3 py-1.5 rounded-md bg-black text-white hover:bg-gray-800 active:translate-y-[1px] transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80 focus:ring-offset-2"
              style={{ fontSize: "14px", minHeight: "36px" }}
            >
              Start new session
            </button>
            <button
              className="p-2 rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:translate-y-[1px] transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80 focus:ring-offset-2"
              style={{ minHeight: "36px" }}
              title="Import audio"
              data-testid="button-import"
            >
              <Upload className="w-4 h-4" style={{ color: "#6b7280" }} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {sessions.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <FileText className="w-10 h-10" style={{ color: "#d1d5db" }} />
            </div>
            <h3 className="mb-2" style={{ color: "#111827", fontSize: "18px", fontWeight: 600 }}>
              No sessions yet
            </h3>
            <p className="mb-6" style={{ color: "#6b7280", fontSize: "14px" }}>
              Click 'Start new session' to begin tracking sentiment
            </p>
            <button
              onClick={onStartSession}
              data-testid="button-empty-start"
              className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 active:translate-y-[1px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-black/80 focus:ring-offset-2"
              style={{ fontSize: "14px", minHeight: "44px" }}
            >
              Start new session
            </button>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Main Content */}
            <main className="flex-1 min-w-0">
              {/* Section Header */}
              <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#111827" }}>
                  Your sessions
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortType)}
                    data-testid="select-sort"
                    className="h-9 px-2.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80"
                    style={{ fontSize: "13px", color: "#374151" }}
                  >
                    <option>Newest first</option>
                    <option>By title A–Z</option>
                  </select>

                  {/* Filter Pills */}
                  <div className="hidden sm:flex gap-1">
                    {(["All", "Recent", "Favorites", "This week"] as FilterType[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        data-testid={`button-filter-${filter.toLowerCase().replace(" ", "-")}`}
                        className={`px-2.5 py-1.5 rounded-md border transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80 ${
                          activeFilter === filter
                            ? "bg-gray-100 border-gray-300"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                        style={{ fontSize: "13px", color: "#374151" }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: "#9ca3af" }}
                    />
                    <input
                      type="text"
                      placeholder="Search sessions"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search"
                      className="h-9 w-56 rounded-md border border-gray-200 pl-9 pr-3 transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-black/80"
                      style={{ fontSize: "14px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Session Grid */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    data-testid={`card-session-${session.id}`}
                    className="rounded-xl border hover:shadow-sm transition-all duration-150 p-4 cursor-pointer"
                    style={{ borderColor: "#e5e7eb" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }}
                    onClick={() => onOpenSession(session.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      {renamingSessionId === session.id ? (
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                          onBlur={() => handleRenameSubmit(session.id)}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`input-rename-${session.id}`}
                          autoFocus
                          className="h-8 px-2 -ml-2"
                          style={{ fontSize: "16px" }}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <h3 className="truncate" style={{ fontSize: "16px", fontWeight: 500, color: "#111827" }} data-testid={`text-session-name-${session.id}`}>
                            {session.name}
                          </h3>
                          {session.isFavorite && (
                            <Star className="w-4 h-4 flex-shrink-0 fill-amber-400 text-amber-400" data-testid={`icon-favorite-${session.id}`} />
                          )}
                        </div>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-2 rounded-md hover:bg-gray-100 transition-colors duration-100 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-black/80"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`button-menu-${session.id}`}
                          >
                            <MoreVertical className="w-4 h-4" style={{ color: "#9ca3af" }} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleRenameClick(session, e as any);
                          }} data-testid={`menu-rename-${session.id}`}>
                            <Edit3 className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteMutation.mutate({ sessionId: session.id, isFavorite: session.isFavorite });
                          }} data-testid={`menu-favorite-${session.id}`}>
                            <Star className="w-4 h-4 mr-2" />
                            {session.isFavorite ? "Remove from favorites" : "Add to favorites"}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this session?")) {
                                deleteMutation.mutate(session.id);
                              }
                            }}
                            data-testid={`menu-delete-${session.id}`}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-sm" style={{ color: "#6b7280" }} data-testid={`text-session-time-${session.id}`}>
                      {session.date} • {session.time}
                    </p>
                  </div>
                ))}
              </div>
            </main>

            {/* Sidebar with Tips */}
            <aside className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-6 rounded-xl border p-4" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}>
                <h3 className="mb-2" style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                  💡 Daily Tip
                </h3>
                <p style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.5" }}>
                  {todaysTip}
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
