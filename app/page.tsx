"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  Loader2Icon,
  ShieldCheckIcon,
  ThumbsDownIcon,
  UsersIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type TopSong = {
  rank: string;
  title: string;
  artist: string;
  url: string;
};

const fallbackTopSongs: TopSong[] = [
  {
    rank: "02",
    title: "LOVE ATTACK",
    artist: "RESCENE",
    url: "https://open.spotify.com/search/LOVE%20ATTACK%20RESCENE",
  },
  {
    rank: "03",
    title: "Pretty Girl",
    artist: "RESCENE",
    url: "https://open.spotify.com/search/Pretty%20Girl%20RESCENE",
  },
  {
    rank: "04",
    title: "LEMONADE",
    artist: "aespa",
    url: "https://open.spotify.com/search/LEMONADE%20aespa",
  },
  {
    rank: "05",
    title: "It's Me",
    artist: "ILLIT",
    url: "https://open.spotify.com/search/It's%20Me%20ILLIT",
  },
  {
    rank: "07",
    title: "Lemon Tang",
    artist: "Hearts2Hearts",
    url: "https://open.spotify.com/search/Lemon%20Tang%20Hearts2Hearts",
  },
];

const highlights = [
  {
    title: "Member directory",
    description:
      "Review member details, onboarding gaps, and archived history without opening fourteen tabs like a maniac.",
    icon: UsersIcon,
  },
  {
    title: "Service calendar",
    description:
      "Track expected service days and see whether claims were already created before your memory starts making creative edits.",
    icon: CalendarDaysIcon,
  },
  {
    title: "Claims workflow",
    description:
      "Keep billing work visible in one place instead of doing emotional parkour across disconnected screens.",
    icon: ClipboardListIcon,
  },
];

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [topSongs, setTopSongs] = useState<TopSong[]>(fallbackTopSongs);
  const [ggBaeCount, setGGBaeCount] = useState<number | null>(0);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setIsCheckingSession(false);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isCheckingSession) {
      return;
    }

    if (!hasSupabaseConfig || !supabase) {
      router.replace("/login");
      return;
    }

    if (!session) {
      router.replace("/login?redirect=%2F");
    }
  }, [isCheckingSession, router, session]);

  const updateGGBaeCount = () => {
    setGGBaeCount((prevCount) => (prevCount !== null ? prevCount + 1 : 1));
  };

  useEffect(() => {
    if (!session) {
      return;
    }

    let isCancelled = false;

    async function loadTopSongs() {
      try {
        const response = await fetch("/api/kpop-top-songs", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { songs?: TopSong[] };
        if (
          !isCancelled &&
          Array.isArray(payload.songs) &&
          payload.songs.length > 0
        ) {
          setTopSongs(payload.songs);
        }
      } catch {
        // Keep the fallback list if Spotify is unavailable.
      }
    }

    void loadTopSongs();

    return () => {
      isCancelled = true;
    };
  }, [session]);

  if (isCheckingSession || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Opening Sophia Members
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(35,78,112,0.08),transparent_18rem)]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12 sm:px-8 lg:px-10">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="mb-5 rounded-full px-4 py-3 text-[0.72rem] font-semibold tracking-normal border-black/80"
            >
              Home of the bullshit
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Send claims, 2-3 years, no problem.
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/workspace"
                className={cn(buttonVariants({ size: "lg" }), "min-w-[11rem]")}
                onClick={() => {
                  toast("GGBae");
                }}
              >
                Here we go again
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>

          <div>
            {ggBaeCount !== null && (
              <div className="mb-2 text-sm font-semibold tracking-normal text-foreground">
                GGBae Count: {ggBaeCount}
              </div>
            )}
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground"
              onClick={updateGGBaeCount}
            >
              <ThumbsDownIcon className="mr-2 h-4 w-4" />
              GGBae Counter
            </Button>
          </div>
        </div>

        <section className="mt-14 grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="text-2xl font-semibold tracking-normal text-foreground">
                Got you
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {topSongs.map((song) => (
              <button
                key={`${song.rank}-${song.title}`}
                type="button"
                className="grid min-h-[168px] gap-6 rounded-lg border border-border/70 bg-card px-5 py-5 text-left shadow-sm transition-colors hover:bg-accent/40 cursor-pointer"
                onClick={() => {
                  window.open(song.url, "_blank", "noopener,noreferrer");
                }}
              >
                <div className="text-xs font-semibold tracking-normal text-muted-foreground">
                  #{song.rank}
                </div>
                <div className="grid gap-2 self-end">
                  <h3 className="text-xl font-semibold tracking-normal text-foreground">
                    {song.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{song.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
