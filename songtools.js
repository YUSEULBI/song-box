// 곡 정보 자동 찾기 도구 모음 (브라우저 전용, API 키 없음)

// ---------- 1. 유튜브 링크 확인 ----------
export function isYouTube(url) {
  try {
    const h = new URL(url).hostname.replace(/^(www|m)\./, "");
    return ["youtu.be", "youtube.com", "music.youtube.com"].includes(h);
  } catch {
    return false;
  }
}

// ---------- 2. 유튜브 영상 제목 + 채널명 가져오기 ----------
// noembed(CORS 허용)를 먼저 쓰고, 실패하면 유튜브 공식 oEmbed를 시도해요.
export async function fetchYouTubeInfo(url) {
  const tries = [
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  ];
  for (const t of tries) {
    try {
      const r = await fetch(t);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.title) return { title: j.title, channel: j.author_name || "" };
    } catch { /* 다음 방법 시도 */ }
  }
  return null;
}

// ---------- 3. 영상 제목 정리 ----------
const NOISE = [
  /\b(official\s*)?(music\s*)?(video|audio|m\/?v|mv|lyric(s)?\s*video|visualizer)\b/gi,
  /\b(lyrics?|live|cover|full\s*ver(sion)?|teaser|performance|special\s*clip|4k|hd)\b/gi,
  /(가사|뮤직비디오|공식|라이브|커버|자막|한글자막|노래방|반주|MR|inst\.?)/gi,
];

export function cleanVideoTitle(raw, channel = "") {
  let t = String(raw || "");
  // [MV], 【...】, 「...」 같은 괄호 덩어리 제거
  t = t.replace(/[\[【「『][^\]】」』]*[\]】」』]/g, " ");
  // (Official Video) 같이 잡음만 든 괄호 제거 (feat. 는 남김)
  t = t.replace(/\(([^)]*)\)/g, (m, inner) => {
    if (/feat|ft\./i.test(inner)) return m;
    return NOISE.some(re => { re.lastIndex = 0; return re.test(inner); }) ? " " : m;
  });
  // | 뒤는 보통 부가 설명
  t = t.split(/\s[|｜]\s?/)[0];
  for (const re of NOISE) t = t.replace(re, " ");
  t = t.replace(/#\S+/g, " ").replace(/\s{2,}/g, " ").trim();

  // "가수 - 제목" / "가수 _ 제목" / "가수 – 제목" 분리
  let artist = "", title = t;
  // "가수 '제목'" / "가수 “제목”" 패턴 (K-pop 공식 MV에 흔함)
  const q = t.match(/^(.+?)\s*['‘“"](.+?)['’”"]\s*(.*)$/);
  const m = t.match(/^(.+?)\s*[-_–—]\s+(.+)$/) || t.match(/^(.+?)\s+[-_–—]\s*(.+)$/);
  if (q && q[1].trim()) { artist = q[1].trim(); title = q[2].trim(); }
  else if (m) { artist = m[1].trim(); title = m[2].trim(); }
  title = title.replace(/^["'“‘]|["'”’]$/g, "").trim();

  // 가수를 못 찾으면 채널명 사용 (" - Topic", "Official" 등 정리)
  if (!artist && channel) {
    artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/\b(official|vevo|channel)\b/gi, "").trim();
  }
  // "IU(아이유)" → 검색용으로 두 이름 다 보존
  return { title, artist, query: `${artist} ${title}`.replace(/[()]/g, " ").replace(/\s{2,}/g, " ").trim() };
}

// ---------- 4. iTunes로 공식 제목·가수 검증 (JSONP: CORS 문제 없음) ----------
function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cb = "__it" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const done = () => { delete window[cb]; s.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, timeoutMs);
    window[cb] = data => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("network")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    document.head.appendChild(s);
  });
}

export async function searchITunes(query) {
  if (!query) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=KR&media=music&entity=song&limit=6`;
    const data = await jsonp(url);
    const seen = new Set();
    return (data.results || [])
      .map(r => ({ title: r.trackName, artist: r.artistName, album: r.collectionName }))
      .filter(r => {
        const k = (r.title + "|" + r.artist).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  } catch {
    return [];
  }
}

// ---------- 5. 노래방 번호 (비공식 무료 API, 안 되면 조용히 빈 결과) ----------
const norm = s => String(s || "").toLowerCase().replace(/[\s()\[\]'".,!?~\-_]/g, "");

export async function searchKaraoke(title, artist) {
  if (!title) return [];
  const out = [];
  for (const brand of ["tj", "kumyoung"]) {
    try {
      const r = await fetch(`https://api.manana.kr/karaoke/song/${encodeURIComponent(title)}/${brand}.json`);
      if (!r.ok) continue;
      const list = await r.json();
      if (!Array.isArray(list)) continue;
      const a = norm(artist);
      const hit = list.find(x => norm(x.title) === norm(title) && (!a || norm(x.singer).includes(a) || a.includes(norm(x.singer))))
               || list.find(x => !a || norm(x.singer).includes(a) || a.includes(norm(x.singer)));
      if (hit && hit.no) out.push({ company: brand === "tj" ? "TJ" : "금영", number: String(hit.no) });
    } catch { /* API를 못 쓰면 건너뜀 */ }
  }
  return out;
}

export function searchLinks(title, artist) {
  const q = s => "https://www.google.com/search?q=" + encodeURIComponent(s);
  return {
    tj: q(`TJ노래방 번호 ${title} ${artist}`),
    ky: q(`금영노래방 번호 ${title} ${artist}`),
  };
}
