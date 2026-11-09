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

// 노래방 채널 영상 제목에 들어 있는 번호 뽑기: "(KY.53191)", "TJ 46827", "[TJ노래방 12345]"
export function extractKaraokeNumbers(raw) {
  const out = [];
  const s = String(raw || "");
  const re = /(TJ|KY|금영)\s*(?:노래방)?\s*[.#:\-]?\s*(\d{4,6})/gi;
  let m;
  while ((m = re.exec(s))) {
    const company = /tj/i.test(m[1]) ? "TJ" : "금영";
    if (!out.some(o => o.company === company)) out.push({ company, number: m[2] });
  }
  return out;
}

const KARAOKE_CHANNEL = /(karaoke|노래방|\bTJ\b|\bKY\b|금영|태진)/i;

export function cleanVideoTitle(raw, channel = "") {
  let t = String(raw || "");
  // 노래방 채널 표기 제거: "/ KY KARAOKE", "| TJ Karaoke", "(KY.53191)", "[TJ노래방]"
  t = t.replace(/\(?\s*(TJ|KY|금영)\s*(노래방)?\s*[.#:\-]?\s*\d{4,6}\s*\)?/gi, " ");
  t = t.split(/\s[\/|｜]\s?/)[0];
  t = t.replace(/\b(KY|TJ)\s*karaoke\b/gi, " ").replace(/(TJ|금영|KY)\s*노래방/gi, " ");
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
  else if (m) {
    // 노래방 채널은 보통 "제목 - 가수" 순서, 일반 채널은 "가수 - 제목" 순서
    if (KARAOKE_CHANNEL.test(channel) || KARAOKE_CHANNEL.test(raw)) { title = m[1].trim(); artist = m[2].trim(); }
    else { artist = m[1].trim(); title = m[2].trim(); }
  }
  // 노래방 채널의 "제목 가수" (구분자 없음): 마지막 단어를 가수로 추정
  else if ((KARAOKE_CHANNEL.test(channel) || KARAOKE_CHANNEL.test(raw)) && t.split(" ").length >= 2) {
    const words = t.split(" ");
    artist = words.pop();
    title = words.join(" ");
  }
  title = title.replace(/^["'“‘]|["'”’]$/g, "").trim();

  // 가수를 못 찾으면 채널명 사용 (" - Topic", "Official" 등 정리). 노래방 채널 이름은 가수가 아니니 제외.
  if (!artist && channel && !KARAOKE_CHANNEL.test(channel)) {
    artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/\b(official|vevo|channel)\b/gi, "").trim();
  }
  // "IU(아이유)" → 검색용으로 두 이름 다 보존
  // 검색어: "IU(아이유)" → "IU" (괄호 안 별칭은 빼야 검색이 잘 돼요)
  const mainArtist = artist.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const mainTitle = title.replace(/\s*\((?!feat|ft\.)[^)]*\)\s*/gi, " ").trim();
  return { title, artist, query: `${mainArtist} ${mainTitle}`.replace(/\s{2,}/g, " ").trim() };
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

function dedupe(list) {
  const seen = new Set();
  return list.filter(r => {
    if (!r.title || !r.artist) return false;
    const k = (r.title + "|" + r.artist).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// 일반 요청을 먼저 시도하고, 막히면 JSONP로 다시 시도
async function getJSON(url, label) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.json();
    console.warn(`[곡서랍] ${label} fetch 응답 ${r.status}`);
  } catch (e) {
    console.warn(`[곡서랍] ${label} fetch 실패 → JSONP 시도`, e);
  }
  try {
    return await jsonp(url);
  } catch (e) {
    console.warn(`[곡서랍] ${label} JSONP 실패`, e);
    return null;
  }
}

async function searchITunesOnly(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=US&media=music&entity=song&limit=6`;
  const data = await getJSON(url, "iTunes");
  return (data?.results || []).map(r => ({ title: r.trackName, artist: r.artistName, album: r.collectionName, src: "iTunes" }));
}

async function searchDeezer(query) {
  try {
    const data = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=6&output=jsonp`);
    return (data?.data || []).map(r => ({ title: r.title, artist: r.artist?.name, album: r.album?.title, src: "Deezer" }));
  } catch (e) {
    console.warn("[곡서랍] Deezer JSONP 실패", e);
    return [];
  }
}

// 검색 결과가 검색어 단어들과 얼마나 맞는지 점수 매기기 (0~1)
const normWord = s => String(s || "").toLowerCase().replace(/[\s()\[\]'".,!?~\-_·]/g, "");
export function matchScore(cand, query) {
  const words = String(query || "").split(/\s+/).map(normWord).filter(w => w.length >= 1);
  if (!words.length) return 0;
  const hay = normWord(cand.title + " " + cand.artist);
  return words.filter(w => hay.includes(w)).length / words.length;
}

// 이름은 그대로 두고, 여러 음원 DB를 찾아 점수 순으로 정렬
export async function searchITunes(query) {
  if (!query) return [];
  let list = await searchITunesOnly(query);
  const best = l => Math.max(0, ...l.map(c => matchScore(c, query)));
  if (best(list) < 1) list = list.concat(await searchDeezer(query));
  list = dedupe(list)
    .map(c => ({ ...c, score: matchScore(c, query) }))
    .sort((a, b) => b.score - a.score);
  console.info(`[곡서랍] "${query}" 검색 결과 ${list.length}건`, list);
  return list;
}

// ---------- 5. 노래방 번호 (비공식 무료 API, 안 되면 조용히 빈 결과) ----------
const norm = s => String(s || "").toLowerCase().replace(/[\s()\[\]'".,!?~\-_]/g, "");

export async function searchKaraoke(title, artist) {
  if (!title) return [];
  const out = [];
  // 브랜드별 주소가 안 되면 전체 검색 주소에서 브랜드로 걸러요
  let all = null;
  for (const brand of ["tj", "kumyoung"]) {
    try {
      let list = null;
      const r = await fetch(`https://api.manana.kr/karaoke/song/${encodeURIComponent(title)}/${brand}.json`);
      if (r.ok) list = await r.json();
      if (!Array.isArray(list) || !list.length) {
        if (all === null) {
          const r2 = await fetch(`https://api.manana.kr/karaoke/song/${encodeURIComponent(title)}.json`).catch(() => null);
          all = r2?.ok ? await r2.json().catch(() => []) : [];
          console.info("[곡서랍] 노래방 전체검색 응답", r2?.status, all);
        }
        list = (Array.isArray(all) ? all : []).filter(x => String(x.brand || "").toLowerCase() === brand);
      }
      if (!list.length) continue;
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
