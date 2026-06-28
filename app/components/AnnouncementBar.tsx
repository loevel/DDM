import { Link } from "@remix-run/react";
import { useEffect, useState } from "react";

interface Announcement {
  id: number;
  text: string;
  link_label: string | null;
  link_to: string | null;
  countdown_to: string | null;
  bg_color: string | null;
}

const ROTATE_INTERVAL = 4500;

function useCountdown(targetISO: string | null | undefined) {
  const [parts, setParts] = useState({ j: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    if (!targetISO) return;
    const target = new Date(targetISO).getTime();
    function tick() {
      const diff = Math.max(0, target - Date.now());
      const s = Math.floor(diff / 1000);
      setParts({ j: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetISO]);

  return parts;
}

function Countdown({ to }: { to: string }) {
  const { j, h, m, s } = useCountdown(to);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1 mx-1.5 font-mono text-[11px] font-bold tabular-nums">
      {j > 0 && <><span className="bg-white/20 px-1.5 py-0.5 rounded-sm">{j}j</span><span className="opacity-60">:</span></>}
      <span className="bg-white/20 px-1.5 py-0.5 rounded-sm">{pad(h)}</span>
      <span className="opacity-60">:</span>
      <span className="bg-white/20 px-1.5 py-0.5 rounded-sm">{pad(m)}</span>
      <span className="opacity-60">:</span>
      <span className="bg-white/20 px-1.5 py-0.5 rounded-sm">{pad(s)}</span>
    </span>
  );
}

export function AnnouncementBar() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animDir, setAnimDir] = useState<"in" | "out">("in");

  // Charger les annonces depuis l'API
  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.json())
      .then((data: any) => {
        if (data.announcements?.length) setAnnouncements(data.announcements);
      })
      .catch(() => {});
  }, []);

  function go(dir: 1 | -1) {
    if (announcements.length <= 1) return;
    setAnimDir("out");
    setTimeout(() => {
      setCurrent(c => (c + dir + announcements.length) % announcements.length);
      setAnimDir("in");
    }, 250);
  }

  useEffect(() => {
    if (paused || announcements.length <= 1) return;
    const t = setInterval(() => go(1), ROTATE_INTERVAL);
    return () => clearInterval(t);
  }, [paused, current, announcements.length]);

  if (announcements.length === 0) return null;

  const ann = announcements[current] ?? announcements[0];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ann-in  { from { opacity:0; transform:translateY(-5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes ann-out { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(5px) } }
        .ann-in  { animation: ann-in  0.25s ease both; }
        .ann-out { animation: ann-out 0.25s ease both; }
      ` }} />

      <div
        className="w-full z-[60] text-white text-[12px] font-sans font-semibold transition-colors duration-500"
        style={{ backgroundColor: ann.bg_color || "#1b1c1c" }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative flex items-center justify-center h-10 max-w-[90rem] mx-auto px-14">

          {announcements.length > 1 && (
            <button onClick={() => go(-1)} aria-label="Annonce précédente"
              className="absolute left-2 md:left-4 p-1.5 opacity-50 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-sm leading-none">chevron_left</span>
            </button>
          )}

          <div className={`flex items-center gap-2 text-center ${animDir === "in" ? "ann-in" : "ann-out"}`} key={ann.id}>
            <span className="leading-none">{ann.text}</span>
            {ann.countdown_to && <Countdown to={ann.countdown_to} />}
            {ann.link_to && ann.link_label && (
              <Link to={ann.link_to}
                className="underline underline-offset-2 opacity-80 hover:opacity-100 whitespace-nowrap ml-1 transition-opacity">
                {ann.link_label}
              </Link>
            )}
          </div>

          {announcements.length > 1 && (
            <button onClick={() => go(1)} aria-label="Annonce suivante"
              className="absolute right-2 md:right-4 p-1.5 opacity-50 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-sm leading-none">chevron_right</span>
            </button>
          )}

          {announcements.length > 1 && (
            <div className="absolute right-10 md:right-14 hidden md:flex items-center gap-1.5">
              {announcements.map((_, i) => (
                <button key={i}
                  onClick={() => { setAnimDir("out"); setTimeout(() => { setCurrent(i); setAnimDir("in"); }, 250); }}
                  aria-label={`Annonce ${i + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === current ? "bg-white" : "bg-white/35 hover:bg-white/60"}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
