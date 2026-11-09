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

// "진영&최유리", "IU(아이유)", "A, B", "A feat. B" → ["진영","최유리"], ["IU","아이유"] ...
export function splitArtists(s) {
  const out = [];
  for (const part of String(s || "").split(/\s*(?:&|,|×|\s+x\s+|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)) {
    const main = part.replace(/\([^)]*\)/g, " ").trim();
    if (main) out.push(main);
    for (const m of part.matchAll(/\(([^)]+)\)/g)) if (m[1].trim()) out.push(m[1].trim());
  }
  return [...new Set(out)];
}

export function cleanVideoTitle(raw, channel = "") {
  // 이모지 제거 (🎤, ✨ 등)
  let t = String(raw || "").replace(/[\p{Extended_Pictographic}️‍]/gu, " ");
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
  // "진영&최유리 생각을 멈추다 보면": 첫 단어에 &·×·, 가 있으면 가수 여러 명으로 봄
  else if (/[&×,]/.test(t.split(" ")[0]) && t.split(" ").length >= 2) {
    const words = t.split(" ");
    artist = words.shift();
    title = words.join(" ");
  }
  title = title.replace(/^["'“‘]|["'”’]$/g, "").trim();

  // 가수를 못 찾으면 채널명 사용 (" - Topic", "Official" 등 정리). 노래방 채널 이름은 가수가 아니니 제외.
  if (!artist && channel && !KARAOKE_CHANNEL.test(channel)) {
    artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/\b(official|vevo|channel)\b/gi, "").trim();
  }
  // 검색어: "IU(아이유)" → "IU" (괄호 안 별칭은 빼야 검색이 잘 돼요)
  const artists = splitArtists(artist);
  const mainTitle = title.replace(/\s*\((?!feat|ft\.)[^)]*\)\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
  return { title, artist, artists, mainTitle, query: `${artists[0] || ""} ${mainTitle}`.trim() };
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

// 미국 스토어에서 검색 (한국 스토어는 음원 판매가 없어 검색 결과가 0건이에요)
async function searchUS(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=US&media=music&entity=song&limit=8`;
  const data = await getJSON(url, "iTunes 검색");
  return (data?.results || []).filter(r => r.kind === "song");
}

// 곡 번호로 한국 스토어를 조회해서 한글 제목·가수를 받아요
async function lookupKR(ids) {
  if (!ids.length) return [];
  const url = `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=KR`;
  const data = await getJSON(url, "iTunes 한국 조회");
  return (data?.results || []).filter(r => r.kind === "song");
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

// ---------- 점수 매기기 ----------
const normWord = s => String(s || "").toLowerCase().replace(/[\s()\[\]'".,!?~\-_·&]/g, "");
const NOT_ORIGINAL = /(instrumental|\binst\b|\bmr\b|karaoke|반주|remix|sped\s*up|slowed|cover|piano\s*ver|acoustic\s*ver)/i;

// 후보 하나가 영상에서 뽑은 제목·가수와 얼마나 맞는지
export function scoreCandidate(c, guess) {
  const titleWords = String(guess.mainTitle || guess.title || "").split(/\s+/).map(normWord).filter(Boolean);
  const titles = [c.title, c.enTitle].filter(Boolean).map(normWord);
  const candArtists = [c.artist, c.enArtist].filter(Boolean).map(normWord);

  let titleScore = 0;
  if (titleWords.length) {
    for (const ct of titles) {
      const s = titleWords.filter(w => ct.includes(w)).length / titleWords.length;
      titleScore = Math.max(titleScore, s);
    }
  }
  const guessArtists = (guess.artists || []).map(normWord).filter(Boolean);
  const artistHit = guessArtists.some(a => candArtists.some(ca => ca.includes(a) || a.includes(ca)));
  const notOriginal = NOT_ORIGINAL.test(c.title || "") || NOT_ORIGINAL.test(c.album || "");

  const score = titleScore * 0.6 + (artistHit ? 0.4 : 0) - (notOriginal ? 0.3 : 0);
  const exact = titleScore === 1 && (artistHit || !guessArtists.length) && !notOriginal;
  return { score: Math.round(score * 100) / 100, exact, artistHit };
}

// 영상 정보로 공식 음원 찾기: 미국 스토어 검색 → 한국 스토어에서 한글 이름 조회 → 점수순 정렬
export async function searchSongs(guess) {
  const t = guess.mainTitle || guess.title;
  if (!t) return [];
  const queries = [...new Set([...(guess.artists || []).slice(0, 3).map(a => `${a} ${t}`), t])];

  const byId = new Map();
  for (const q of queries) {
    for (const r of await searchUS(q)) {
      if (byId.has(r.trackId)) continue;
      byId.set(r.trackId, {
        trackId: r.trackId, title: r.trackName, artist: r.artistName, album: r.collectionName,
        enTitle: r.trackName, enArtist: r.artistName, src: "iTunes",
      });
    }
  }
  // 한국 스토어에 있는 곡은 한글 이름으로 바꿔요
  for (const r of await lookupKR([...byId.keys()].slice(0, 30))) {
    const c = byId.get(r.trackId);
    if (c) Object.assign(c, { title: r.trackName, artist: r.artistName, album: r.collectionName, kr: true });
  }

  let list = [...byId.values()];
  if (!list.length) list = await searchDeezer(guess.query || t);

  list = dedupe(list)
    .map(c => ({ ...c, ...scoreCandidate(c, guess) }))
    .sort((a, b) => b.score - a.score || (b.kr ? 1 : 0) - (a.kr ? 1 : 0));
  console.info(`[곡서랍] 검색어 ${JSON.stringify(queries)} → ${list.length}건`, list);
  return list;
}

// ---------- 5. 노래방 번호 (비공식 무료 API, 안 되면 조용히 빈 결과) ----------
// 악센트 제거(ROSÉ → rose), 소문자, 기호·띄어쓰기 제거
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s()\[\]'".,!?~\-_]/g, "");

const hasHangul = s => /[가-힣]/.test(String(s || ""));

async function getList(url) {
  const r = await fetch(url).catch(() => null);
  if (!r?.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

export async function searchKaraoke(title, artist) {
  if (!title) return [];
  const out = [];
  const q = norm(title);
  const names = splitArtists(artist).map(norm).filter(Boolean);
  const rawNames = splitArtists(artist);

  // 제목: 같거나, 노래방 제목이 우리 제목으로 시작하면 OK ("화이트(White)" ← "화이트")
  const titleOk = x => { const t = norm(x.title); return t === q || (q.length >= 2 && t.startsWith(q)); };
  // 가수: 이름이 서로 포함되면 OK
  const singerOk = x => !names.length || names.some(a => norm(x.singer).includes(a) || a.includes(norm(x.singer)));
  // 표기 언어가 다른 경우(ROSÉ ↔ 로제)에만 가수 비교를 건너뛸 수 있음
  const scriptDiffers = x => rawNames.length > 0 && rawNames.every(n => hasHangul(n) !== hasHangul(x.singer));

  const pick = (list, brand) => {
    const hit = list.find(x => titleOk(x) && singerOk(x));
    if (hit) return hit;
    const sameTitle = list.filter(titleOk);
    if (sameTitle.length === 1 && scriptDiffers(sameTitle[0])) return sameTitle[0];
    if (sameTitle.length) console.info(`[곡서랍] 노래방 ${brand}: 같은 제목은 있지만 가수가 달라서 제외`, sameTitle.slice(0, 5));
    return null;
  };

  for (const brand of ["tj", "kumyoung"]) {
    try {
      let hit = null;
      // 1) 제목으로 (띄어쓰기 있는 / 없는 제목)
      for (const t of [...new Set([title, title.replace(/\s+/g, "")])]) {
        hit = pick(await getList(`https://api.manana.kr/karaoke/song/${encodeURIComponent(t)}/${brand}.json`), brand);
        if (hit) break;
      }
      // 2) 가수 이름으로 검색해서 그 가수 곡 중 제목이 맞는 곡
      if (!hit) {
        for (const singer of rawNames) {
          const list = await getList(`https://api.manana.kr/karaoke/singer/${encodeURIComponent(singer)}/${brand}.json`);
          console.info(`[곡서랍] 노래방 가수검색 ${brand} "${singer}" ${list.length}건`);
          hit = list.find(titleOk) || null;
          if (hit) break;
        }
      }
      if (hit?.no) out.push({ company: brand === "tj" ? "TJ" : "금영", number: String(hit.no) });
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
