import { NextResponse } from "next/server";

const SPOTIFY_KOREA_PLAYLIST_URL =
  "https://open.spotify.com/embed/playlist/37i9dQZEVXbJZGli0rRP3r?theme=0";

const FEMALE_GROUP_ARTISTS = new Set([
  "aespa",
  "BABYMONSTER",
  "BLACKPINK",
  "fromis_9",
  "f(x)",
  "Girls' Generation",
  "Hearts2Hearts",
  "ILLIT",
  "I.O.I",
  "ITZY",
  "IVE",
  "KATSEYE",
  "KiiiKiii",
  "KISS OF LIFE",
  "LE SSERAFIM",
  "MAMAMOO",
  "NMIXX",
  "NewJeans",
  "OH MY GIRL",
  "Red Velvet",
  "RESCENE",
  "STAYC",
  "tripleS",
  "TWICE",
    "VIVIZ",
]);

type TopSong = {
  rank: string;
  title: string;
  artist: string;
  url: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ""));
}

function isFemaleGroupArtist(artist: string) {
  return FEMALE_GROUP_ARTISTS.has(artist.trim());
}

function buildSpotifySearchUrl(title: string, artist: string) {
  const query = encodeURIComponent(`${title} ${artist}`);
  return `https://open.spotify.com/search/${query}`;
}

function parseTracksFromEmbedHtml(html: string): TopSong[] {
  const itemPattern =
    /<a[^>]+href="(?<href>\/track\/[^"]+|https:\/\/open\.spotify\.com\/track\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>(?<title>.*?)<\/h3>[\s\S]*?<h4[^>]*>(?<artist>.*?)<\/h4>[\s\S]*?<\/a>/gi;
  const songs: TopSong[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(html)) !== null) {
    const title = stripTags(match.groups?.title ?? "");
    const artist = stripTags(match.groups?.artist ?? "");
    const href = decodeHtml(match.groups?.href ?? "");

    if (!title || !artist) {
      continue;
    }

    const key = `${title}:::${artist}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    songs.push({
      rank: String(songs.length + 1).padStart(2, "0"),
      title,
      artist,
      url: href.startsWith("http")
        ? href
        : `https://open.spotify.com${href || `/search/${encodeURIComponent(`${title} ${artist}`)}`}`,
    });
  }

  return songs;
}

export async function GET() {
  try {
    const response = await fetch(SPOTIFY_KOREA_PLAYLIST_URL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 * 60 * 6 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Spotify fetch failed with ${response.status}` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const songs = parseTracksFromEmbedHtml(html)
      .filter((song) => isFemaleGroupArtist(song.artist))
      .map((song) => ({
        ...song,
        url: song.url || buildSpotifySearchUrl(song.title, song.artist),
      }))
      .slice(0, 5)
      .map((song, index) => ({
        ...song,
        rank: String(index + 1).padStart(2, "0"),
      }));

    if (songs.length === 0) {
      return NextResponse.json(
        { error: "Could not parse Spotify Korea playlist tracks." },
        { status: 502 }
      );
    }

    return NextResponse.json({ songs });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown Spotify fetch error",
      },
      { status: 502 }
    );
  }
}
