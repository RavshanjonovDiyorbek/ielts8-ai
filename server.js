const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

// Load local .env if present (kept out of git via .gitignore)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  }
} catch (_) {}

const PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || '';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const MODEL_CHAIN = [
  'gemini-4-hydrogen',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest'
];
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const BRAIN_FILE = path.join(DATA_DIR, 'student_brain.json');

const GRAMMAR_CHAIN_7 = [
  {
    day: 1,
    shortLabel: '1-Kun: Hozirgi Zamon',
    titleUz: "1-Kun: Gap Skeleti (Oltin Tartib) & Hozirgi Zamon",
    grammarBlock: 'Golden Word Order (S + V + O + Place + Time), To Be (am/is/are), Present Simple vs Present Continuous',
    snowballRuleUz: "1-zanjir: To'g'ri tartibda hozirgi holat va odat haqida gapirish."
  },
  {
    day: 2,
    shortLabel: "2-Kun: O'tmish+Tajriba",
    titleUz: "2-Kun: O'tgan Zamon & Tajriba (1 + 2 Zanjir)",
    grammarBlock: 'Past Simple (was/were, V2, did) + Present Perfect (have/has V3)',
    snowballRuleUz: "1+2 Zanjir: Kechagi 1-kun (hozirgi holat) va bugungi 2-kunni (o'tmish/tajriba) BITTA GAPDA bog'lash!"
  },
  {
    day: 3,
    shortLabel: '3-Kun: Kelajak+Modal',
    titleUz: "3-Kun: Kelajak & Modal Fe'llar (1 + 2 + 3 Zanjir)",
    grammarBlock: 'Future (will / going to) + Modals (can, should, must, have to, might)',
    snowballRuleUz: "1..3 Zanjir: O'tmish (2) + Hozir (1) + Kelajak reja yoki maslahat (3) ni bitta vaziyatda aytish!"
  },
  {
    day: 4,
    shortLabel: "4-Kun: Bog'lovchilar",
    titleUz: "4-Kun: Sabab-Oqibat & Qarshilik Bog'lovchilari (1..4 Zanjir)",
    grammarBlock: 'because, so, although, despite, however, whereas, while, in order to',
    snowballRuleUz: "1..4 Zanjir: Oldingi 1-3 kunlardagi zamon va modallarni murakkab bog'lovchilar bilan bitta uzun Band 7+ gapga yig'ish!"
  },
  {
    day: 5,
    shortLabel: '5-Kun: Shart Gaplar',
    titleUz: "5-Kun: Shart Gaplar & Tasavvur (1..5 Zanjir)",
    grammarBlock: 'Zero, First, Second & Third Conditionals (If / Unless / Had I...)',
    snowballRuleUz: "1..5 Zanjir: Shart gaplarni (If...) o'tilgan 1-4 kun qoliplari bilan bitta jonli hikoyada qo'shish!"
  },
  {
    day: 6,
    shortLabel: '6-Kun: Relative+Passive',
    titleUz: "6-Kun: Who/Which, Passive & Gerund/Infinitive (1..6 Zanjir)",
    grammarBlock: 'Relative Clauses (who, which, that, where) + Passive Voice (is/was/will be V3) + Verb Patterns (V-ing / to V)',
    snowballRuleUz: "1..6 Zanjir: Gaplarni 'who/which' va Passive bilan akademik shaklga keltirib, 1-5 zanjirlar bilan bog'lash!"
  },
  {
    day: 7,
    shortLabel: '7-Kun: Band 8 Oliy',
    titleUz: "7-Kun: IELTS Band 8.0 Oliy Skelet — Inversion & Participles (1..7 Final)",
    grammarBlock: 'Participle Clauses (Having V3..., V-ing...), Cleft Sentences (What strikes me most is...), Inversion (Not only...), Advanced Comparisons',
    snowballRuleUz: "1..7 TO'LIQ ZANJIR: Barcha 7 ta grammatik qatlamni bitta ravon IELTS Band 8.0 nutqida erkin ishlatish!"
  }
];

function buildChainNotification(brain) {
  const bc = brain.bootcamp || {};
  const day = Number(bc.currentChainDay || 1);
  if (bc.brokenLinksAlert) {
    return `🔗 Diqqat! Suhbatda ${bc.brokenLinksAlert}-kun zanjiri unutildi — keling uni hozir amaliyotda tez tiklab olamiz!`;
  }
  if (day === 1) {
    return "🔔 1-kun: Ingliz tili gap qurish skeletining 1-zanjirini (Hozirgi zamon va Oltin Qolip) jonli amaliyotda boshlaymiz!";
  }
  if (day >= 2 && day <= 7) {
    const prevText = day === 2 ? 'kechagi 1-kun' : `oldingi 1–${day - 1}-kunlar`;
    return `🔔 ${day}-kun: Yangi grammatikani ulash vaqti keldi! Bugun ${day}-zanjirni ${prevText} bilan BITTA GAPDA qo'shib gapiramiz!`;
  }
  return `🚀 ${day}-kun / 90 (IELTS 8.0 Erkin Parvoz): 7 kunlik grammatika skeleti tayyor! Bugun sof C1/C2 lug'at, tez audio/video va jonli tajriba!`;
}

function syncLevelFromBand(brain) {
  const b = Number(brain.estimatedBand || 4.0);
  if (b < 4.8) brain.level = "Elementary (A2 - Boshlang'ich)";
  else if (b < 5.5) brain.level = "Pre-Intermediate (B1 - O'sib boruvchi)";
  else if (b < 6.5) brain.level = "Intermediate (B2 - O'rta daraja)";
  else if (b < 7.5) brain.level = "Upper-Intermediate (C1 - Yuqori daraja)";
  else brain.level = "Advanced (C2 - IELTS Band 8.0 Daraja)";

  if (!brain.dailyChecklist || typeof brain.dailyChecklist !== 'object') {
    brain.dailyChecklist = {
      step1_patterns: false,
      step2_bricks: false,
      step3_micro_media: false,
      step4_live_chat: false,
      completedCount: 0
    };
  }
  if (!brain.skillBands || typeof brain.skillBands !== 'object') {
    brain.skillBands = { speaking: b, listening: b, reading: b, writing: b };
  }
  const dc = brain.dailyChecklist;
  dc.completedCount = ['step1_patterns', 'step2_bricks', 'step3_micro_media', 'step4_live_chat'].filter(
    (k) => Boolean(dc[k])
  ).length;
}

function createDefaultBriefing(brain) {
  const day = Number(brain.bootcamp?.currentChainDay || 1);
  return {
    generatedForDay: day,
    pushTitleUz: `🔔 ${day}-Kun Hisoboti: Darajangiz ${brain.level.split('(')[0].trim()} (Band ${Number(brain.estimatedBand || 4).toFixed(1)})`,
    knowledgeDiagnosisUz: `Hozir siz ${brain.level} darajasidasiz (taxminiy IELTS Band ${Number(brain.estimatedBand || 4).toFixed(1)}). 90 kunda Band 8.0 ga chiqish uchun avval ${day <= 7 ? '7 kunlik grammatika zanjirini mustahkamlab' : 'C1/C2 lug‘at va tez eshitishni kuchaytirib'}, har kuni 4 ta vazifani bajaring.`,
    paceStatusUz: `90 kunlik reja: ${day}-kun / 90 • Maqsad: Band 8.0 (${Math.max(1, 90 - day)} kun qoldi)`,
    missions: [
      {
        id: 'step1_patterns',
        actionType: 'patterns',
        titleUz: day <= 7 ? `${day}-kun Oltin Fe'llar va Qoliplari` : 'C1/C2 Oltin Collocationlar',
        detailUz: "Hozirgi darajangizga mos 6 ta asosiy qolipni o'rganing va 3 ta tezkor mashqni yeching."
      },
      {
        id: 'step2_bricks',
        actionType: 'bricks',
        titleUz: 'Gap Kubiklari bilan 3 ta Gap Yig‘ish',
        detailUz: "O'zbekcha fikringizni darajangizga mos inglizcha kubiklar bilan yig'ib Band 8 ko'prigini ko'ring."
      },
      {
        id: 'step3_micro_media',
        actionType: 'media',
        titleUz: '1 ta Audio/Video Jumlalarini Chaynab Eshitish',
        detailUz: "Internetdan mos audio/videoni ochib, jumlama-jumla 0.8x tezlikda tinglang va AI bilan muhokama qiling."
      },
      {
        id: 'step4_live_chat',
        actionType: 'chat',
        titleUz: `${day}-kun Zanjirli Jonli Suhbat`,
        detailUz: "AI Ustoz bilan yozma yoki ovozli (🎧/🎙️) muloqotda bugungi qoidalarni amalda ishlating."
      }
    ]
  };
}

function createDefaultBrain() {
  const base = {
    level: "Elementary (A2 - Boshlang'ich)",
    estimatedBand: 4.0,
    targetBand: 8.0,
    activeFocusUz: "O'quvchi bilan tanishish, real gapirish/yozish darajasini va ilk kamchiliklarni aniqlash",
    weaknesses: [],
    strengths: [],
    interests: [],
    dynamicRoadmap: [
      {
        id: 'step_init_1',
        titleUz: '1-Bosqich: Jonli Tanishuv va Real Darajani Aniqlash',
        reasonUz: "Tayyor shablon o'rniga, AI Ustoz avval sizning hozirgi gapirish va fikrlash usulingizni eshitib, shaxsiy yo'l xaritasini tuzib chiqadi.",
        targetGap: 'Diagnostic & Personal Baseline',
        status: 'active',
        theoryUz: "Siz Elementary darajadan boshlayapsiz. Shuning uchun birinchi qadam — ingliz tilida o'zingiz haqingizda 2-3 oddiy gap yozing yoki ayting. AI ongi sizning xatolaringiz va qiziqishlaringizdan kelib chiqib keyingi darslar va internetdagi audio/videolarni yaratadi.",
        practicePrompt: 'Hello teacher! My name is ... I want to learn English because ...',
        createdByAiAt: new Date().toISOString()
      }
    ],
    personalVocab: [],
    mediaHistory: [],
    aiMemoryNotes: [
      "O'quvchi Elementary darajadan boshlab 3 oy ichida IELTS Band 8.0 olishni maqsad qilgan."
    ],
    bootcamp: {
      currentChainDay: 1,
      completedChainDays: [],
      phase: 'bootcamp_7',
      brokenLinksAlert: null,
      notificationUz: ''
    },
    dailyChecklist: {
      step1_patterns: false,
      step2_bricks: false,
      step3_micro_media: false,
      step4_live_chat: false,
      completedCount: 0
    },
    skillBands: {
      speaking: 4.0,
      listening: 4.0,
      reading: 4.0,
      writing: 4.0
    },
    strictMode: 'auto',
    vocabSprint: {
      totalMasteredCount: 0,
      currentBatchDay: 1,
      highScoreCombo: 0
    },
    weeklyCheckpoints: [],
    dailyBriefing: null,
    updatedAt: new Date().toISOString()
  };
  base.bootcamp.notificationUz = buildChainNotification(base);
  syncLevelFromBand(base);
  base.dailyBriefing = createDefaultBriefing(base);
  return base;
}

function loadBrain() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(BRAIN_FILE)) {
      const fresh = createDefaultBrain();
      fs.writeFileSync(BRAIN_FILE, JSON.stringify(fresh, null, 2), 'utf8');
      return fresh;
    }
    const raw = fs.readFileSync(BRAIN_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const merged = { ...createDefaultBrain(), ...parsed };
    merged.bootcamp = { ...createDefaultBrain().bootcamp, ...(parsed.bootcamp || {}) };
    merged.dailyChecklist = { ...createDefaultBrain().dailyChecklist, ...(parsed.dailyChecklist || {}) };
    merged.skillBands = { ...createDefaultBrain().skillBands, ...(parsed.skillBands || {}) };
    merged.vocabSprint = { ...createDefaultBrain().vocabSprint, ...(parsed.vocabSprint || {}) };
    merged.weeklyCheckpoints = Array.isArray(parsed.weeklyCheckpoints) ? parsed.weeklyCheckpoints : [];
    merged.bootcamp.notificationUz = buildChainNotification(merged);
    syncLevelFromBand(merged);
    if (!merged.dailyBriefing) merged.dailyBriefing = createDefaultBriefing(merged);
    return merged;
  } catch (err) {
    console.warn('Brain load error, using fresh brain:', err.message);
    return createDefaultBrain();
  }
}

function saveBrain(brain) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    syncLevelFromBand(brain);
    brain.updatedAt = new Date().toISOString();
    fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2), 'utf8');
  } catch (err) {
    console.error('Brain save error:', err.message);
  }
}

let studentBrain = loadBrain();

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 12 * 1024 * 1024) {
        reject(new Error('Request body too large (max 12MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveApiKey(req) {
  const hdr = req.headers['x-api-key'];
  if (typeof hdr === 'string' && hdr.trim().length > 10) return hdr.trim();
  return DEFAULT_API_KEY;
}

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
    } catch (_) {}
  }
  return null;
}

async function callGemini({ apiKey, systemInstruction, contents, jsonMode = true, temperature = 0.72 }) {
  const errors = [];
  const body = {
    contents,
    generationConfig: { temperature }
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    const maxAttempts = model === PRIMARY_MODEL ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000)
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          errors.push(`${model}#${attempt}: HTTP ${resp.status} ${errText.slice(0, 140)}`);
          if (resp.status === 503 && attempt < maxAttempts) {
            await sleep(800);
            continue;
          }
          break;
        }

        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (!text) {
          errors.push(`${model}#${attempt}: Empty response`);
          break;
        }
        return { text, modelUsed: model };
      } catch (err) {
        errors.push(`${model}#${attempt}: ${err.message}`);
        if (attempt < maxAttempts) await sleep(800);
      }
    }
  }

  throw new Error(`All Gemini models failed: ${errors.join(' | ')}`);
}

// ==================== MULTI-SOURCE INTERNET SEARCH PROVIDERS ====================

async function searchPodcastsAudio(query) {
  const q = `${query} english`.trim();
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcastEpisode&limit=8`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || [])
      .filter((r) => r.episodeUrl && /^https?:\/\//i.test(r.episodeUrl))
      .slice(0, 5)
      .map((r) => {
        const secs = Math.round((r.trackTimeMillis || 0) / 1000);
        const mins = secs > 0 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'Audio';
        return {
          id: `pod_${r.trackId || Math.random().toString(36).slice(2, 8)}`,
          mediaType: 'audio',
          sourcePlatform: 'Podcast Audio (MP3)',
          title: r.trackName || r.collectionName || 'English Audio Lesson',
          channel: r.collectionName || 'English Podcast',
          duration: mins,
          thumbnail: r.artworkUrl600 || r.artworkUrl160 || '',
          audioUrl: r.episodeUrl,
          url: r.trackViewUrl || r.episodeUrl,
          snippet: (r.description || r.shortDescription || '').replace(/<[^>]+>/g, '').slice(0, 220)
        };
      });
  } catch (err) {
    console.warn('Podcast search warning:', err.message);
    return [];
  }
}

async function searchDailymotionVideos(query) {
  try {
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,description,duration,thumbnail_480_url,embed_url,url,owner.screenname&limit=6`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.list || []).slice(0, 5).map((v) => {
      const dur = Number(v.duration || 0);
      const durStr = dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '';
      return {
        id: v.id,
        mediaType: 'dailymotion',
        sourcePlatform: 'Dailymotion Video',
        title: v.title || 'English Video',
        channel: v['owner.screenname'] || 'Dailymotion',
        duration: durStr,
        thumbnail: v.thumbnail_480_url || '',
        embedUrl: v.embed_url || `https://geo.dailymotion.com/player.html?video=${v.id}`,
        url: v.url || `https://www.dailymotion.com/video/${v.id}`,
        snippet: (v.description || '').slice(0, 220)
      };
    });
  } catch (err) {
    console.warn('Dailymotion search warning:', err.message);
    return [];
  }
}

function collectVideoRenderers(obj, out = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || out.length >= 8) return out;
  if (obj.videoRenderer && obj.videoRenderer.videoId && !seen.has(obj.videoRenderer.videoId)) {
    const v = obj.videoRenderer;
    seen.add(v.videoId);
    const title = v.title?.runs?.map((r) => r.text).join('') || v.title?.simpleText || 'English Video';
    const channel = v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || 'YouTube';
    const duration =
      v.lengthText?.simpleText ||
      v.thumbnailOverlays?.find((o) => o.thumbnailOverlayTimeStatusRenderer)
        ?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
      '';
    const snippet =
      v.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r) => r.text).join('') ||
      v.descriptionSnippet?.runs?.map((r) => r.text).join('') ||
      '';

    out.push({
      id: v.videoId,
      mediaType: 'youtube',
      sourcePlatform: 'YouTube Video',
      title,
      channel,
      duration,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}?playsinline=1&rel=0`,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      snippet
    });
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (out.length >= 8) break;
      collectVideoRenderers(item, out, seen);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (out.length >= 8) break;
      collectVideoRenderers(obj[key], out, seen);
    }
  }
  return out;
}

async function searchYouTube(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    return collectVideoRenderers(data).slice(0, 5);
  } catch (err) {
    console.warn('YouTube search warning:', err.message);
    return [];
  }
}

async function searchWebArticles(query) {
  const headers = { 'User-Agent': 'IELTS8AITeacher/1.0 (https://localhost:3000)' };
  try {
    const searchUrl = `https://simple.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&srlimit=4`;
    const sResp = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!sResp.ok) return [];
    const sJson = await sResp.json();
    const hits = sJson?.query?.search || [];
    if (hits.length === 0) return [];

    const titles = hits.map((h) => h.title).join('|');
    const extUrl = `https://simple.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=400&titles=${encodeURIComponent(titles)}&format=json`;
    const eResp = await fetch(extUrl, { headers, signal: AbortSignal.timeout(6000) });
    const eJson = eResp.ok ? await eResp.json() : {};
    const pages = Object.values(eJson?.query?.pages || {});

    return hits.slice(0, 4).map((h) => {
      const page = pages.find((p) => p.title === h.title) || {};
      const fullText = (page.extract || h.snippet.replace(/<[^>]+>/g, '')).trim();
      return {
        id: `wiki_${h.pageid}`,
        mediaType: 'article',
        sourcePlatform: 'Simple English Web',
        title: h.title,
        channel: 'Simple English Wikipedia',
        duration: `${Math.max(1, Math.round(fullText.split(/\s+/).length / 130))} min read`,
        thumbnail: page.thumbnail?.source || '',
        url: `https://simple.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
        snippet: fullText.slice(0, 220),
        fullText
      };
    });
  } catch (err) {
    console.warn('Web article search warning:', err.message);
    return [];
  }
}

async function searchAllInternetSources(query, source = 'all', queriesOverride = null) {
  const qAudio = queriesOverride?.audioQuery || query;
  const qVideo = queriesOverride?.videoQuery || query;
  const qArticle = queriesOverride?.articleQuery || query;

  const tasks = [];
  if (source === 'all' || source === 'audio') tasks.push(searchPodcastsAudio(qAudio));
  if (source === 'all' || source === 'dailymotion') tasks.push(searchDailymotionVideos(qVideo));
  if (source === 'all' || source === 'youtube') tasks.push(searchYouTube(qVideo));
  if (source === 'all' || source === 'article') tasks.push(searchWebArticles(qArticle));

  const settled = await Promise.allSettled(tasks);
  const buckets = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));

  // Interleave items cleanly across sources when source === 'all'
  const items = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (bucket[i]) items.push(bucket[i]);
    }
  }
  return items;
}

// ==================== COGNITIVE BRAIN HELPERS ====================

function applyBrainUpdates(updates) {
  if (!updates || typeof updates !== 'object') return;

  if (typeof updates.activeFocusUz === 'string' && updates.activeFocusUz.trim()) {
    studentBrain.activeFocusUz = updates.activeFocusUz.trim();
  }

  if (typeof updates.estimatedBandDelta === 'number' && Number.isFinite(updates.estimatedBandDelta)) {
    const next = studentBrain.estimatedBand + updates.estimatedBandDelta;
    studentBrain.estimatedBand = Number(Math.max(3.5, Math.min(8.5, next)).toFixed(1));
  }

  const weaknessesInput = [];
  if (Array.isArray(updates.newWeakness)) weaknessesInput.push(...updates.newWeakness);
  else if (updates.newWeakness && typeof updates.newWeakness === 'object') weaknessesInput.push(updates.newWeakness);
  if (Array.isArray(updates.newWeaknesses)) weaknessesInput.push(...updates.newWeaknesses);

  for (const nw of weaknessesInput) {
    if (!nw || !nw.area) continue;
    const exists = studentBrain.weaknesses.find(
      (w) => w.area.toLowerCase() === String(nw.area).toLowerCase()
    );
    if (!exists) {
      studentBrain.weaknesses.unshift({
        id: `weak_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        area: nw.area,
        detailUz: nw.detailUz || '',
        targetSkill: nw.targetSkill || 'Speaking & Grammar',
        status: 'active',
        detectedAt: new Date().toISOString()
      });
      studentBrain.weaknesses = studentBrain.weaknesses.slice(0, 15);
    } else if (nw.detailUz) {
      exists.detailUz = nw.detailUz;
    }
  }

  if (typeof updates.newStrength === 'string' && updates.newStrength.trim()) {
    const s = updates.newStrength.trim();
    if (!studentBrain.strengths.includes(s)) {
      studentBrain.strengths.unshift(s);
      studentBrain.strengths = studentBrain.strengths.slice(0, 12);
    }
  }

  if (typeof updates.newInterest === 'string' && updates.newInterest.trim()) {
    const intr = updates.newInterest.trim();
    if (!studentBrain.interests.includes(intr)) {
      studentBrain.interests.unshift(intr);
      studentBrain.interests = studentBrain.interests.slice(0, 10);
    }
  }

  if (updates.newRoadmapStep && updates.newRoadmapStep.titleUz) {
    const title = updates.newRoadmapStep.titleUz.trim();
    const dup = studentBrain.dynamicRoadmap.find((r) => r.titleUz.toLowerCase() === title.toLowerCase());
    if (!dup) {
      studentBrain.dynamicRoadmap.push({
        id: `step_${Date.now()}`,
        titleUz: title,
        reasonUz: updates.newRoadmapStep.reasonUz || '',
        targetGap: updates.newRoadmapStep.targetGap || studentBrain.activeFocusUz,
        status: 'active',
        theoryUz: updates.newRoadmapStep.theoryUz || '',
        practicePrompt: updates.newRoadmapStep.practicePrompt || '',
        createdByAiAt: new Date().toISOString()
      });
    }
  }

  if (Array.isArray(updates.newVocab)) {
    for (const v of updates.newVocab) {
      if (!v || !v.band8) continue;
      const dup = studentBrain.personalVocab.find(
        (x) => x.band8.toLowerCase() === String(v.band8).toLowerCase()
      );
      if (!dup) {
        studentBrain.personalVocab.unshift({
          id: `voc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          elementary: v.elementary || '',
          band8: v.band8,
          uzbek: v.uzbek || '',
          example: v.example || '',
          reasonUz: v.reasonUz || "AI suhbatingizdan kelib chiqib qo'shdi",
          mastered: false
        });
      }
    }
    studentBrain.personalVocab = studentBrain.personalVocab.slice(0, 120);
  }

  if (typeof updates.memoryNoteUz === 'string' && updates.memoryNoteUz.trim()) {
    studentBrain.aiMemoryNotes.unshift(updates.memoryNoteUz.trim());
    studentBrain.aiMemoryNotes = studentBrain.aiMemoryNotes.slice(0, 15);
  }

  saveBrain(studentBrain);
}

function getEffectiveStrictStage(brain) {
  const pref = brain.strictMode || 'auto';
  if (['assisted', 'semi_strict', 'exam_strict'].includes(pref)) return pref;
  const day = Number(brain.bootcamp?.currentChainDay || 1);
  if (day <= 14) return 'assisted';
  if (day <= 45) return 'semi_strict';
  return 'exam_strict';
}

function buildCognitiveSystemPrompt(mode, context = {}) {
  const strictStage = getEffectiveStrictStage(studentBrain);
  const strictDirective =
    strictStage === 'exam_strict'
      ? `STRICT MODE STAGE 3 (100% ENGLISH-ONLY EXAM MODE):
- NEVER use Uzbek in "reply", "uzbekHint", or "correction.explanationUz"! Set "uzbekHint" to "" and "nextReplyBricks" to [].
- Grade and coach strictly in clear academic English as an official IELTS Examiner.`
      : strictStage === 'semi_strict'
      ? `STRICT MODE STAGE 2 (SEMI-STRICT TRANSITION):
- Minimize native language crutches! Keep "uzbekHint" under 8 words (only critical hints), and provide at most 3 short keyword hints in "nextReplyBricks".`
      : `STRICT MODE STAGE 1 (ASSISTED ELEMENTARY FOUNDATION):
- Full supportive Uzbek hints allowed alongside English, and provide 6-8 helpful "nextReplyBricks" scaled to ${studentBrain.level}.`;
  const stealthWeaknesses = studentBrain.weaknesses.slice(0, 2).map((w) => w.area);
  const stealthVocab = studentBrain.personalVocab
    .filter((v) => !v.mastered)
    .slice(0, 2)
    .map((v) => v.band8);

  const bc = studentBrain.bootcamp || { currentChainDay: 1, completedChainDays: [] };
  const chainDay = Math.min(7, Number(bc.currentChainDay || 1));
  const activeChains = GRAMMAR_CHAIN_7.slice(0, chainDay);
  const isBootcampMode = mode === 'bootcamp' || Number(bc.currentChainDay || 1) <= 7;

  const brainSnapshot = JSON.stringify(
    {
      level: studentBrain.level,
      estimatedBand: studentBrain.estimatedBand,
      targetBand: studentBrain.targetBand,
      activeFocusUz: studentBrain.activeFocusUz,
      weaknesses: studentBrain.weaknesses.slice(0, 6),
      strengths: studentBrain.strengths.slice(0, 5),
      interests: studentBrain.interests.slice(0, 5),
      aiMemoryNotes: studentBrain.aiMemoryNotes.slice(0, 5),
      BOOTCAMP_CHAIN: {
        currentDay: bc.currentChainDay,
        phase: bc.phase,
        unlockedLinks: activeChains.map((c) => `${c.day}-kun: ${c.grammarBlock}`)
      },
      STEALTH_TARGETS: {
        weaknessesToCheck: stealthWeaknesses,
        vocabToElicit: stealthVocab
      }
    },
    null,
    2
  );

  const mediaContext =
    mode === 'media_discussion' && context.media
      ? `\nACTIVE MEDIA THE STUDENT JUST CONSUMED:
- Type: ${context.media.mediaType} (${context.media.sourcePlatform})
- Title: ${context.media.title}
- Summary/Text: ${context.media.summaryEn || context.media.snippet || ''}
- Key Phrases: ${JSON.stringify(context.media.keyPhrases || [])}
Discuss THIS exact audio/video/article deeply with the student! Ask comprehension + opinion questions, verify what they understood, and fix their weaknesses using sentences from this media.`
      : '';

  const ROLEPLAY_SCENARIOS = {
    airport:
      'ROLEPLAY SCENARIO: London Heathrow Passport Control & Airport Check-in Officer. Speak naturally like a polite UK airport officer asking about purpose of visit, stay duration, luggage, and hotel. Keep Elementary-friendly pacing while gradually nudging toward fluent answers.',
    cafe:
      'ROLEPLAY SCENARIO: Friendly British Coffee Shop Barista & Local Friend in London. Chat casually about drinks, weather, hobbies, and local tips while gently upgrading simple answers.',
    interview:
      'ROLEPLAY SCENARIO: International Tech/Company Hiring Manager conducting a realistic English Job Interview. Ask about strengths, teamwork, past work experience, and career goals.',
    debate:
      'ROLEPLAY SCENARIO: IELTS Part 3 Debate Partner (Devil’s Advocate). Politely challenge the student’s opinion with counter-arguments (e.g., on technology, cities, education, environment) to push them to defend ideas at IELTS Band 8.0!'
  };

  const roleplayContext =
    mode === 'roleplay'
      ? `\n${ROLEPLAY_SCENARIOS[context.scenario] || ROLEPLAY_SCENARIOS.airport}\nStay vividly in character inside "reply", while still filling "thoughtUz", "correction", "stealthCheck", and "brainUpdates" as their hidden AI mentor!`
      : '';

  const snowballContext = isBootcampMode
    ? `\n7-DAY SNOWBALL GRAMMAR CHAIN ACTIVE (Day ${bc.currentChainDay}/7):
- Current Day Grammar: ${GRAMMAR_CHAIN_7[chainDay - 1].titleUz} (${GRAMMAR_CHAIN_7[chainDay - 1].grammarBlock})
- SNOWBALL METHOD RULE (CRITICAL!): NO dry textbook lectures! Give crisp 2-line Uzbek clarity, then IMMEDIATELY put the student into LIVE PRACTICE (questions, Uzbek-to-English thought building, real situations) where they MUST connect ALL previous days (1..${Math.max(1, chainDay - 1)}) WITH today's Day ${chainDay} in ONE sentence or situation!`
    : `\nDAYS 8-90 FREE FLIGHT (IELTS 8.0 ERKIN PARVOZ - Day ${bc.currentChainDay}/90):
- The 7-day grammar skeleton is complete! Focus on C1/C2 lexical depth, rapid comprehension, natural Band 8 fluency, and IELTS speaking/writing polish.
- CHAIN REPAIR RULE: If the student forgets or breaks ANY of the 7 foundational grammar links (Days 1-7), catch it immediately in "chainCheck.brokenLinkDay" (1..7) and guide them to repair that link in live practice right away!`;

  return `You are "Gemini 4 Hydrogen — Jonli AI Ustoz" (a real, living cognitive English & IELTS mentor, NOT a fixed textbook or static algorithm).
Your mission: Take this specific Uzbek student from Elementary (${studentBrain.level}) to IELTS Band 8.0 within 3 months by genuinely understanding their mind, diagnosing exact weaknesses in real time, inventing custom lessons/exercises on the spot, and searching the real internet (Audio Podcasts, Dailymotion Videos, YouTube Videos, and Simple English Web Articles) specifically to heal their current weaknesses.

STUDENT COGNITIVE MEMORY (live evolving profile):
${brainSnapshot}
${mediaContext}
${roleplayContext}
${snowballContext}
${strictDirective}

PEDAGOGICAL BEHAVIOR ("Real Ong"):
1. THINK FIRST ("thoughtUz"): Before replying, genuinely diagnose what the student struggled with, what Elementary gap or psychological barrier appeared, or what next cognitive step will move them closest to Band 8.0.
2. ADAPTIVE LEVEL TEACHING ("reply" & MIXED UZBEK-ENGLISH):
   - Always adapt your English complexity, speed, and Uzbek scaffolding dynamically to the student's CURRENT LEVEL (${studentBrain.level}, Band ${studentBrain.estimatedBand}) — from Elementary A2 -> B1 -> B2 -> C1 -> Band 8.0!
   - The student may write in mixed Uzbek + English (e.g., "Yesterday men ishga bordim va charchadim"). Welcome this! Help them translate/express the Uzbek parts cleanly at their current level AND show the Band 8.0 upgrade.
   - Also ALWAYS provide "nextReplyBricks": an array of 6-8 short English words/chunks scaled to their current level (${studentBrain.level}, Band ${studentBrain.estimatedBand}) so the student can tap bricks to answer your follow-up question smoothly!
   - When mode is "mock_exam", act as a supportive yet realistic IELTS Examiner (Part 1 -> 2 -> 3) and include "examEvaluation" when asked or after sufficient turns.
   - Do NOT repeat scripted/robotic template lines. React to THIS specific student's exact words, errors, and personality.
3. STEALTH MEMORY EXAM ("stealthCheck" - Yashirin Imtihon):
   - Look at "STEALTH_TARGETS" in STUDENT COGNITIVE MEMORY above. Whenever non-empty, subtly create conversational situations or questions that require the student to use those past weak grammar rules or unmastered Band 8 words!
   - Whenever the student either successfully applies one of those STEALTH_TARGETS OR slips on it again, populate "stealthCheck": { "testedItem": "name of rule/word", "passed": true/false, "feedbackUz": "O'zbekcha qisqa baho: yashirin tekshiruvdan o'tdingizmi yoki hali mashq kerakmi" }. Otherwise set "stealthCheck": null.
4. MICRO-DIAGNOSIS & BAND 8 UPGRADE ("correction"):
   - Whenever the student writes/speaks English, analyze mistakes AND show how a Band 8.0 speaker expresses that exact thought, explaining the grammar/lexical bridge in Uzbek.
5. ON-THE-SPOT INTERACTIVE WIDGET ("interactiveWidget"):
   - Frequently (whenever helpful to test/reinforce a weakness right now!), create a live 1-question micro-exercise right inside chat so the student practices immediately without leaving the conversation!
6. INTERNET MEDIA DISCOVERY ("mediaTrigger"):
   - If the student asks for audio/video/materials OR if YOU decide that listening to a podcast/audio, watching a video, or reading a short web article on a specific weakness will accelerate them right now, set "mediaTrigger.needed = true" with a targeted English search query and explain WHY in "reasonForStudentUz".
7. MEMORY EVOLUTION ("brainUpdates"):
   - THIS IS ESSENTIAL: Whenever the student writes/speaks English and makes ANY mistake or uses Elementary phrasing, you MUST populate:
     * "brainUpdates.activeFocusUz" with the concrete focus right now
     * "brainUpdates.newWeakness": { "area": "...", "detailUz": "...", "targetSkill": "..." }
     * "brainUpdates.newVocab": at least 1-2 Band 8 upgrades derived from their sentence!
     * "brainUpdates.newRoadmapStep": whenever they need a dedicated mini-lesson on that newly detected gap (especially if dynamicRoadmap has fewer than 4 steps)!
     * "brainUpdates.memoryNoteUz": 1 concise observation about their progress/personality.

CRITICAL: Return valid JSON ONLY matching this exact schema:
{
  "thoughtUz": "Sizning ichki AI tahlilingiz (1-2 jumla o'zbek tilida: hozir o'quvchida qanday kamchilik/ehtiyoj ko'rdingiz va nega shunday yondashyapsiz)",
  "reply": "O'quvchiga asosiy javobingiz (dars, savol, suhbat yoki yo'naltirish)",
  "uzbekHint": "Hozirgi darajaga mos qisqa o'zbekcha yordamchi izoh (yoki bo'sh satr)",
  "nextReplyBricks": ["I think", "Yesterday", "because", "even though", "in my opinion", "from my perspective"],
  "chainCheck": {
    "activeDay": 2,
    "requiredLinks": ["1-kun: Hozirgi zamon", "2-kun: Past/Perfect"],
    "passedSnowball": true,
    "brokenLinkDay": null,
    "snowballModelSentence": "I usually drink tea in the morning (1-kun), because yesterday I felt exhausted (2-kun).",
    "feedbackUz": "O'zbekcha izoh: eski va yangi zanjirni bitta gapda qanday ulaganingiz yoki qaysi zanjir tushib qolgani"
  },
  "stealthCheck": {
    "testedItem": "Past Simple / Overwhelming workload",
    "passed": true,
    "feedbackUz": "Yashirin imtihon: bu safar qoidani to'g'ri ishlatdingiz!"
  },
  "correction": {
    "original": "student's English text",
    "corrected": "grammatically accurate version",
    "band8Upgrade": "Band 8.0 natural C1/C2 version",
    "explanationUz": "o'zbek tilida tushuntirish"
  },
  "interactiveWidget": {
    "type": "choice",
    "promptUz": "O'quvchi xatosini mustahkamlash uchun jonli mashq savoli",
    "options": ["Option A", "Option B", "Option C"],
    "correctIndex": 0,
    "explanationUz": "Nima uchun bu to'g'ri"
  },
  "mediaTrigger": {
    "needed": true,
    "mediaType": "all",
    "searchQuery": "clean english search query",
    "reasonForStudentUz": "Nima uchun aynan shu audio/video sizning kamchiligingizni tuzatadi"
  },
  "brainUpdates": {
    "activeFocusUz": "hozirgi aniq fokus (masalan: Past Simple & Much/Many)",
    "estimatedBandDelta": 0.1,
    "newWeakness": {
      "area": "Short weakness title (e.g. Past Simple Irregular Verbs)",
      "detailUz": "O'zbekcha qisqa izoh",
      "targetSkill": "Grammar / Speaking"
    },
    "newStrength": "Optional short strength string or null",
    "newInterest": "Optional short interest string or null",
    "newRoadmapStep": {
      "titleUz": "Dynamic lesson title tailored to their gap",
      "reasonUz": "Why AI created this lesson right now",
      "targetGap": "Exact skill gap",
      "theoryUz": "Clear Uzbek explanation with examples",
      "practicePrompt": "Practice prompt for student"
    },
    "newVocab": [
      {
        "elementary": "too much work / very tired",
        "band8": "overwhelming workload / absolutely exhausted",
        "uzbek": "haddan tashqari ko'p ish / nihoyatda charchagan",
        "example": "I felt absolutely exhausted due to an overwhelming workload.",
        "reasonUz": "Sizning oxirgi gapingizni Band 8 darajasiga olib chiqish uchun"
      }
    ],
    "memoryNoteUz": "O'quvchi haqida qisqa xotira qaydi"
  },
  "examEvaluation": null
}
Set optional fields ("chainCheck", "stealthCheck", "correction", "interactiveWidget", "mediaTrigger", "newWeakness", "newRoadmapStep", "examEvaluation") to null ONLY when genuinely not applicable on that turn.`;
}

function pcm16ToWavBase64(pcmBase64, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]).toString('base64');
}

// ==================== HTTP API HANDLER ====================

async function handleApi(req, res, pathname, queryObj) {
  const apiKey = resolveApiKey(req);

  if (req.method === 'GET' && pathname === '/api/config') {
    const lanIp = getLanIp();
    return sendJson(res, 200, {
      primaryModel: PRIMARY_MODEL,
      fallbackModels: MODEL_CHAIN.slice(1),
      ttsModel: TTS_MODEL,
      lanIp,
      port: PORT,
      httpsPort: HTTPS_PORT,
      httpsUrl: `https://${lanIp}:${HTTPS_PORT}`,
      hasDefaultKey: Boolean(DEFAULT_API_KEY),
      runtimeKey: DEFAULT_API_KEY
    });
  }

  if (req.method === 'GET' && pathname === '/api/brain') {
    return sendJson(res, 200, { brain: studentBrain, chainSkeleton: GRAMMAR_CHAIN_7 });
  }

  if (req.method === 'POST' && pathname === '/api/brain/reset') {
    studentBrain = createDefaultBrain();
    saveBrain(studentBrain);
    return sendJson(res, 200, { brain: studentBrain });
  }

  if (req.method === 'POST' && pathname === '/api/brain/step-complete') {
    const body = await readBody(req);
    const step = studentBrain.dynamicRoadmap.find((s) => s.id === body.stepId);
    if (step) {
      step.status = 'completed';
      studentBrain.estimatedBand = Number(Math.min(8.5, studentBrain.estimatedBand + 0.1).toFixed(1));
      saveBrain(studentBrain);
    }
    return sendJson(res, 200, { brain: studentBrain });
  }

  if (req.method === 'POST' && pathname === '/api/brain/vocab-master') {
    const body = await readBody(req);
    const v = studentBrain.personalVocab.find((x) => x.id === body.id);
    if (v) {
      v.mastered = Boolean(body.mastered);
      saveBrain(studentBrain);
    }
    return sendJson(res, 200, { brain: studentBrain });
  }

  if (req.method === 'GET' && pathname === '/api/media/search') {
    const q = (queryObj.get('q') || 'BBC Learning English elementary speaking').trim();
    const source = queryObj.get('source') || 'all';
    const items = await searchAllInternetSources(q, source);
    return sendJson(res, 200, { query: q, source, items });
  }

  if (req.method === 'POST' && pathname === '/api/brain/recommend-media') {
    const body = await readBody(req);
    const customRequestUz = (body.customRequestUz || '').trim();
    const mediaFilter = body.mediaFilter || 'all';

    const prompt = `Analyze this student's cognitive brain and recommend the best internet Audio Podcasts, Dailymotion/YouTube Videos, and Simple English Web Articles right now to fix their weaknesses and advance them from Elementary toward IELTS Band 8.0.

STUDENT BRAIN:
${JSON.stringify({
      level: studentBrain.level,
      estimatedBand: studentBrain.estimatedBand,
      activeFocusUz: studentBrain.activeFocusUz,
      weaknesses: studentBrain.weaknesses,
      interests: studentBrain.interests
    })}
Student extra request: ${customRequestUz || 'Mening hozirgi kamchiliklarim va darajamga qarab internetdan eng foydali audio, video va matn topib ber'}

Return JSON ONLY:
{
  "aiReasoningUz": "2-3 sentences in Uzbek explaining what specific weakness/need Gemini 4 Hydrogen is targeting right now and why these internet materials will help",
  "queries": {
    "audioQuery": "2-4 English keywords ideal for finding an ESL/BBC/elementary podcast episode",
    "videoQuery": "2-4 English keywords ideal for finding a video lesson/story on YouTube & Dailymotion",
    "articleQuery": "2-3 English topic keywords for a readable Simple English Wikipedia article"
  },
  "whyAudioUz": "Short Uzbek reason why listening to this audio fixes their gap",
  "whyVideoUz": "Short Uzbek reason why watching this video fixes their gap",
  "whyArticleUz": "Short Uzbek reason why reading this article fixes their gap"
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.6
    });

    const plan = extractJson(text) || {
      aiReasoningUz: "Sizning Elementary darajadan tezroq Band 8 sari o'sishingiz uchun eshitish (podcast audio), jonli video va oson tushunarli maqola tanlandi.",
      queries: {
        audioQuery: 'BBC 6 minute english elementary',
        videoQuery: 'English speaking story elementary conversation',
        articleQuery: 'London culture'
      },
      whyAudioUz: "Talaffuz va tinglab tushunishni tabiiy nutqda o'stirish uchun.",
      whyVideoUz: "Mimika, kontekst va kunlik iboralarni ko'rib eslab qolish uchun.",
      whyArticleUz: "Yangi so'zlarni oson kontekstda o'qib mustahkamlash uchun."
    };

    const items = await searchAllInternetSources(
      plan.queries?.videoQuery || 'english learning',
      mediaFilter,
      plan.queries
    );

    const enriched = items.map((it) => ({
      ...it,
      whyRecommendedUz:
        it.mediaType === 'audio'
          ? plan.whyAudioUz
          : it.mediaType === 'article'
          ? plan.whyArticleUz
          : plan.whyVideoUz
    }));

    return sendJson(res, 200, {
      aiReasoningUz: plan.aiReasoningUz,
      queries: plan.queries,
      items: enriched,
      modelUsed
    });
  }

  if (req.method === 'POST' && pathname === '/api/media/analyze') {
    const body = await readBody(req);
    const item = body.item || {};
    if (!item.title) return sendJson(res, 400, { error: 'Media item with title is required' });

    // Record in brain history
    studentBrain.mediaHistory = [
      { id: item.id, title: item.title, mediaType: item.mediaType, openedAt: new Date().toISOString() },
      ...studentBrain.mediaHistory.filter((m) => m.id !== item.id)
    ].slice(0, 20);
    saveBrain(studentBrain);

    const prompt = `Analyze this internet ${item.mediaType || 'media'} resource for our specific student.
Student Profile: ${studentBrain.level}, Estimated Band ${studentBrain.estimatedBand}, Weaknesses: ${JSON.stringify(studentBrain.weaknesses.slice(0, 4))}
Resource Title: ${item.title}
Platform: ${item.sourcePlatform || item.channel || ''}
Content/Snippet: ${item.fullText || item.snippet || 'N/A'}

Return JSON ONLY:
{
  "whyForYouUz": "O'zbek tilida: aynan sizning qaysi kamchiligingizni tuzatishga yordam berishi",
  "summaryUz": "O'zbek tilida qisqa va tushunarli xulosa",
  "summaryEn": "2-3 clear sentences in English summarizing the core topic",
  "sentenceBreakdown": [
    {
      "english": "Short natural sentence adapted to student's current level (${studentBrain.level}, Band ${studentBrain.estimatedBand}) based on this media",
      "wordByWordUz": "So'zma-so'z tahlil: [bo'lak 1] = ma'nosi | [bo'lak 2] = ma'nosi",
      "band8Upgrade": "Band 8.0 way to express this exact idea",
      "tipUz": "Talaffuz yoki eshitish bo'yicha qisqa maslahat"
    }
  ],
  "keyPhrases": [
    {
      "elementary": "simple word/phrase",
      "band8": "Band 8.0 upgrade or collocation",
      "uzbek": "o'zbekcha tarjima",
      "example": "natural example sentence"
    }
  ],
  "discussionQuestions": [
    "Warm-up question (level-appropriate)",
    "Opinion question (step up)",
    "IELTS Part 3 deeper question"
  ]
}
Provide 4 items in sentenceBreakdown, 5 keyPhrases, and 3 discussionQuestions.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.55
    });

    const parsed = extractJson(text) || {
      whyForYouUz: 'Eshitish va fikrni ingliz tilida ifodalash ko‘nikmasini rivojlantiradi.',
      summaryUz: `${item.title} materiali asosida muhim so‘zlar va suhbat savollari tayyorlandi.`,
      summaryEn: item.snippet || item.title,
      sentenceBreakdown: [],
      keyPhrases: [],
      discussionQuestions: [
        'What is the main topic of this material?',
        'Which new expression did you notice?',
        'What is your personal opinion about this topic?'
      ]
    };

    studentBrain.dailyChecklist.step3_micro_media = true;
    saveBrain(studentBrain);

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    const body = await readBody(req);
    const { messages = [], mode = 'speaking', context = {} } = body;

    const systemInstruction = buildCognitiveSystemPrompt(mode, context);
    const trimmed = messages.slice(-16).map((m) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text || m.content || '') }]
    }));
    if (trimmed.length === 0) {
      trimmed.push({
        role: 'user',
        parts: [{ text: "Salom ustoz! Men Elementary darajadan boshlayapman, menga o'zingiz moslashib darsni boshlang." }]
      });
    }

    const { text, modelUsed } = await callGemini({
      apiKey,
      systemInstruction,
      contents: trimmed,
      jsonMode: true,
      temperature: 0.75
    });

    let parsed = extractJson(text);
    if (!parsed || typeof parsed.reply !== 'string') {
      parsed = {
        thoughtUz: "O'quvchining javobini tahlil qilib, muloqotni davom ettiryapman.",
        reply: text,
        uzbekHint: '',
        correction: null,
        interactiveWidget: null,
        mediaTrigger: null,
        brainUpdates: null,
        examEvaluation: null
      };
    }

    if (parsed.brainUpdates) {
      applyBrainUpdates(parsed.brainUpdates);
    }

    if (parsed.chainCheck) {
      if (parsed.chainCheck.brokenLinkDay) {
        studentBrain.bootcamp.brokenLinksAlert = Number(parsed.chainCheck.brokenLinkDay);
      } else if (parsed.chainCheck.passedSnowball) {
        studentBrain.bootcamp.brokenLinksAlert = null;
      }
      studentBrain.bootcamp.notificationUz = buildChainNotification(studentBrain);
      saveBrain(studentBrain);
    }

    let recommendedMedia = [];
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.text || '';
    const explicitMediaAsk = /\b(video|audio|podcast|podkast|maqola|article|internet|youtube|dailymotion|topib|tavsiya|ko'rish|eshitish|watch|listen)\b/i.test(
      lastUserMsg
    );

    if (parsed.mediaTrigger?.needed || explicitMediaAsk) {
      const q = parsed.mediaTrigger?.searchQuery || `${studentBrain.activeFocusUz} English elementary`;
      const mType = parsed.mediaTrigger?.mediaType || 'all';
      const found = await searchAllInternetSources(q, mType);
      recommendedMedia = found.slice(0, 4).map((it) => ({
        ...it,
        whyRecommendedUz: parsed.mediaTrigger?.reasonForStudentUz || "Sizning hozirgi ehtiyojingizga mos internet materiali"
      }));
    }

    studentBrain.dailyChecklist.step4_live_chat = true;
    saveBrain(studentBrain);

    return sendJson(res, 200, {
      thoughtUz: parsed.thoughtUz || '',
      reply: parsed.reply,
      uzbekHint: parsed.uzbekHint || '',
      nextReplyBricks: Array.isArray(parsed.nextReplyBricks) ? parsed.nextReplyBricks : [],
      chainCheck: parsed.chainCheck || null,
      stealthCheck: parsed.stealthCheck || null,
      correction: parsed.correction || null,
      interactiveWidget: parsed.interactiveWidget || null,
      examEvaluation: parsed.examEvaluation || null,
      recommendedMedia,
      brain: studentBrain,
      modelUsed
    });
  }

  if (req.method === 'POST' && pathname === '/api/brain/generate-step') {
    const body = await readBody(req);
    const focusRequestUz = (body.focusRequestUz || '').trim();
    const stepId = body.stepId || null;
    const existingStep = stepId ? studentBrain.dynamicRoadmap.find((s) => s.id === stepId) : null;

    const prompt = `You are Gemini 4 Hydrogen — an autonomous AI English & IELTS Teacher.
Based on this exact student's live cognitive brain, dynamically synthesize a personalized lesson/workshop right now!
Student Brain: ${JSON.stringify({
      level: studentBrain.level,
      estimatedBand: studentBrain.estimatedBand,
      activeFocusUz: studentBrain.activeFocusUz,
      weaknesses: studentBrain.weaknesses,
      interests: studentBrain.interests,
      existingTitles: studentBrain.dynamicRoadmap.map((s) => s.titleUz)
    })}
Target Focus / Request: ${existingStep ? `${existingStep.titleUz} (${existingStep.targetGap})` : focusRequestUz || 'Create the exact next personalized step this student needs right now based on their weaknesses and goal to reach Band 8.0.'}

Return JSON ONLY:
{
  "step": {
    "titleUz": "Clear Uzbek lesson title tailored to this student's gap",
    "reasonUz": "Why Gemini 4 Hydrogen specifically chose this lesson for them right now",
    "targetGap": "Exact grammar/speaking/listening/vocab skill targeted",
    "theoryUz": "Clear, encouraging Uzbek explanation with Elementary -> Band 8 examples",
    "practicePrompt": "An English speaking/writing challenge for them to try"
  },
  "quiz": [
    {
      "question": "Targeted check question in Uzbek/English",
      "options": ["Option A", "Option B", "Option C"],
      "correctIndex": 0,
      "explanationUz": "O'zbekcha izoh"
    }
  ],
  "vocab": [
    {
      "elementary": "simple phrasing",
      "band8": "Band 8.0 upgrade",
      "uzbek": "o'zbekcha ma'nosi",
      "example": "natural example",
      "reasonUz": "Nima uchun kerak"
    }
  ],
  "mediaSearchQuery": "English search query to find real internet audio/video for this exact weakness"
}
Include 2 quiz questions and 4 vocab items.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.7
    });

    const parsed = extractJson(text);
    if (!parsed || !parsed.step) {
      return sendJson(res, 500, { error: 'AI failed to generate personalized step' });
    }

    let targetStep = existingStep;
    if (existingStep) {
      existingStep.theoryUz = parsed.step.theoryUz;
      existingStep.practicePrompt = parsed.step.practicePrompt;
      existingStep.reasonUz = parsed.step.reasonUz;
      existingStep.quiz = parsed.quiz || [];
    } else {
      targetStep = {
        id: `step_${Date.now()}`,
        titleUz: parsed.step.titleUz,
        reasonUz: parsed.step.reasonUz,
        targetGap: parsed.step.targetGap,
        status: 'active',
        theoryUz: parsed.step.theoryUz,
        practicePrompt: parsed.step.practicePrompt,
        quiz: parsed.quiz || [],
        createdByAiAt: new Date().toISOString()
      };
      studentBrain.dynamicRoadmap.push(targetStep);
      studentBrain.activeFocusUz = parsed.step.titleUz;
    }

    if (Array.isArray(parsed.vocab)) {
      applyBrainUpdates({ newVocab: parsed.vocab });
    } else {
      saveBrain(studentBrain);
    }

    const mediaItems = parsed.mediaSearchQuery
      ? (await searchAllInternetSources(parsed.mediaSearchQuery, 'all')).slice(0, 4)
      : [];

    return sendJson(res, 200, {
      step: targetStep,
      quiz: parsed.quiz || [],
      vocab: parsed.vocab || [],
      mediaItems,
      brain: studentBrain,
      modelUsed
    });
  }

  if (req.method === 'POST' && pathname === '/api/brain/vocab-generate') {
    const body = await readBody(req);
    const customTopic = (body.topic || '').trim();
    const prompt = `Generate 6 personalized IELTS Band 8.0 vocabulary upgrades specifically tailored to help this student bridge from Elementary to Band 8.0.
Student Brain: ${JSON.stringify({
      level: studentBrain.level,
      estimatedBand: studentBrain.estimatedBand,
      weaknesses: studentBrain.weaknesses.slice(0, 5),
      activeFocusUz: studentBrain.activeFocusUz,
      existingWords: studentBrain.personalVocab.slice(0, 15).map((v) => v.band8)
    })}
Focus topic (optional): ${customTopic || 'Based directly on the student’s current weaknesses and daily speaking needs'}

Return JSON ONLY:
{
  "words": [
    {
      "elementary": "simple word/phrase",
      "band8": "Band 8.0 phrase/collocation",
      "uzbek": "o'zbekcha tarjima",
      "example": "natural Band 8 example sentence",
      "reasonUz": "Nima uchun aynan sizga hozir bu so'z kerak"
    }
  ]
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.7
    });

    const parsed = extractJson(text);
    const words = parsed?.words || [];
    applyBrainUpdates({ newVocab: words });
    return sendJson(res, 200, { added: words.length, brain: studentBrain, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/writing-eval') {
    const body = await readBody(req);
    const { taskType = 'Writing / Essay', prompt = '', essay = '' } = body;
    if (!essay || essay.trim().length < 10) {
      return sendJson(res, 400, { error: 'Kamida 1-2 ta gap yozing!' });
    }

    const evalPrompt = `You are Gemini 4 Hydrogen — an autonomous IELTS Examiner & Cognitive Mentor coaching this student (${studentBrain.level}, estimated Band ${studentBrain.estimatedBand}).
Evaluate their writing and ALSO identify 1 core weakness to store in their cognitive profile!
Task: ${taskType}
Prompt: ${prompt || 'Free Writing Practice'}
Student Text:
${essay}

Return JSON ONLY:
{
  "overallBand": 5.0,
  "criteria": {
    "taskResponse": 5.0,
    "coherenceCohesion": 5.0,
    "lexicalResource": 4.5,
    "grammar": 4.5
  },
  "feedbackUz": "O'zbek tilida tahlil: hozirgi darajadan Band 8 ga o'tish uchun eng muhim maslahatlar.",
  "corrections": [
    {
      "mistake": "wrong or too basic phrase",
      "fix": "Band 8.0 level correction",
      "whyUz": "O'zbekcha tushuntirish"
    }
  ],
  "band8Rewrite": "Full Band 8.0 natural model rewrite keeping the student's core idea.",
  "detectedWeakness": {
    "area": "Short 2-4 word label e.g. Past Tense & Articles",
    "detailUz": "O'zbekcha qisqa izoh aynan nimada qiynalayotgani",
    "targetSkill": "Writing & Grammar"
  }
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: evalPrompt }] }],
      jsonMode: true,
      temperature: 0.45
    });

    const parsed = extractJson(text);
    if (!parsed) {
      return sendJson(res, 200, {
        overallBand: 5.0,
        criteria: { taskResponse: 5, coherenceCohesion: 5, lexicalResource: 5, grammar: 5 },
        feedbackUz: text,
        corrections: [],
        band8Rewrite: '',
        brain: studentBrain,
        modelUsed
      });
    }

    if (typeof parsed.overallBand === 'number') {
      studentBrain.skillBands.writing = Number(Math.max(3.5, Math.min(8.5, parsed.overallBand)).toFixed(1));
    }
    if (parsed.detectedWeakness) {
      applyBrainUpdates({
        newWeakness: parsed.detectedWeakness,
        memoryNoteUz: `Writing tekshiruvidan natija: Band ${parsed.overallBand}. Asosiy e'tibor: ${parsed.detectedWeakness.area}`
      });
    } else {
      saveBrain(studentBrain);
    }

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/tts') {
    const body = await readBody(req);
    const text = String(body.text || '').trim().slice(0, 1100);
    const voiceName = ['Kore', 'Puck', 'Aoede', 'Charon', 'Fenrir'].includes(body.voiceName)
      ? body.voiceName
      : 'Kore';

    if (!text) return sendJson(res, 400, { error: 'text is required' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return sendJson(res, resp.status, { error: `TTS HTTP ${resp.status}`, detail: errText.slice(0, 180) });
    }

    const data = await resp.json();
    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) return sendJson(res, 502, { error: 'No audio returned by Gemini TTS' });

    const rateMatch = (inlineData.mimeType || '').match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const wavBase64 = pcm16ToWavBase64(inlineData.data, sampleRate, 1, 16);

    return sendJson(res, 200, { audioBase64: wavBase64, mimeType: 'audio/wav', modelUsed: TTS_MODEL });
  }

  // Feature 1 & 3: Raw Audio Multimodal Pronunciation & Shadowing X-Ray
  if (req.method === 'POST' && pathname === '/api/audio/xray') {
    const body = await readBody(req);
    const { audioBase64, mimeType = 'audio/webm', targetSentence = '', mode = 'chat_voice' } = body;
    if (!audioBase64) return sendJson(res, 400, { error: 'audioBase64 is required' });

    const cleanMime = String(mimeType).split(';')[0].trim() || 'audio/webm';
    const prompt =
      mode === 'shadowing' && targetSentence
        ? `You are an expert IELTS Pronunciation & Phonetics Coach analyzing an Uzbek student's Shadowing recording.
Target sentence they tried to repeat: "${targetSentence}"
Listen closely to their actual voice audio: pronunciation accuracy of individual sounds (th, r, w/v, vowels), word stress, connected speech rhythm, intonation, and hesitation pauses.

Return JSON ONLY:
{
  "transcript": "exact words you actually heard in the audio",
  "pronunciationScore": 78,
  "estimatedPronunciationBand": 6.5,
  "rhythmAndIntonationUz": "O'zbek tilida: ohang, urg'u, tezlik va pauzalar haqida aniq tahlil",
  "problemWords": [
    {
      "word": "word from audio",
      "issueUz": "qanday talaffuz qilindi va til/labni qanday qo'yib to'g'ri aytish kerak",
      "ipa": "/ipa/"
    }
  ],
  "band8Upgrade": "How a Band 8 speaker delivers or phrases this naturally",
  "detectedWeakness": {
    "area": "Short pronunciation focus e.g. TH & Word Stress",
    "detailUz": "O'zbekcha izoh",
    "targetSkill": "Pronunciation"
  }
}`
        : `You are an expert IELTS Pronunciation & Speaking Coach listening directly to an Uzbek student's raw voice recording.
Transcribe exactly what they said, evaluate their pronunciation, rhythm, word stress, pauses, and suggest a Band 8.0 upgrade.

Return JSON ONLY:
{
  "transcript": "exact English words heard from the audio",
  "pronunciationScore": 75,
  "estimatedPronunciationBand": 6.0,
  "rhythmAndIntonationUz": "O'zbek tilida: ovoz ohangi, urg'u va pauzalar tahlili",
  "problemWords": [
    {
      "word": "mispronounced or hesitant word",
      "issueUz": "O'zbekcha tushuntirish: qanday to'g'ri talaffuz qilish kerak",
      "ipa": "/ipa/"
    }
  ],
  "band8Upgrade": "IELTS Band 8.0 version of what the student wanted to express",
  "detectedWeakness": {
    "area": "Short pronunciation or fluency gap",
    "detailUz": "O'zbekcha qisqa izoh",
    "targetSkill": "Pronunciation"
  }
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: cleanMime, data: audioBase64 } }
          ]
        }
      ],
      jsonMode: true,
      temperature: 0.4
    });

    const parsed = extractJson(text) || {
      transcript: targetSentence || '',
      pronunciationScore: 70,
      estimatedPronunciationBand: 6.0,
      rhythmAndIntonationUz: text,
      problemWords: [],
      band8Upgrade: targetSentence || '',
      detectedWeakness: null
    };

    if (parsed.detectedWeakness?.area) {
      applyBrainUpdates({
        newWeakness: parsed.detectedWeakness,
        memoryNoteUz: `Ovozli talaffuz tahlili (${parsed.pronunciationScore}%): ${parsed.detectedWeakness.area}`
      });
    }

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  // Feature 3: Shadowing Sentence Generator
  if (req.method === 'POST' && pathname === '/api/shadowing/generate') {
    const body = await readBody(req);
    const customFocus = (body.customFocus || '').trim();
    const prompt = `Generate 3 progressive English Shadowing sentences tailored to this Uzbek student's cognitive brain (from Elementary A2 up to IELTS Band 8.0).
Student Brain: ${JSON.stringify({
      level: studentBrain.level,
      estimatedBand: studentBrain.estimatedBand,
      activeFocusUz: studentBrain.activeFocusUz,
      weaknesses: studentBrain.weaknesses.slice(0, 4),
      personalVocab: studentBrain.personalVocab.slice(0, 5).map((v) => v.band8)
    })}
Custom focus: ${customFocus || 'Student current weaknesses and IELTS fluency rhythm'}

Return JSON ONLY:
{
  "focusTitleUz": "O'zbek tilida bugungi Shadowing mashqining maqsadi",
  "sentences": [
    {
      "levelLabel": "1. Oson (Elementary Baza)",
      "sentence": "Natural clear sentence to repeat",
      "stressGuide": "Sentence with STRESSED syllables in CAPS for rhythm",
      "ipa": "/key difficult word IPA/",
      "uzbek": "O'zbekcha aniq tarjima",
      "tipUz": "Talaffuz va urg'u bo'yicha qisqa maslahat"
    },
    {
      "levelLabel": "2. O'rta (B1–B2 Ravonlik)",
      "sentence": "...",
      "stressGuide": "...",
      "ipa": "...",
      "uzbek": "...",
      "tipUz": "..."
    },
    {
      "levelLabel": "3. IELTS Band 8.0 Daraja",
      "sentence": "...",
      "stressGuide": "...",
      "ipa": "...",
      "uzbek": "...",
      "tipUz": "..."
    }
  ]
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.7
    });

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.sentences)) {
      return sendJson(res, 500, { error: 'Failed to generate shadowing sentences' });
    }
    return sendJson(res, 200, { ...parsed, modelUsed });
  }

  // Feature 2: Camera / Photo Vision Analyzer ("Visual Ustoz")
  if (req.method === 'POST' && pathname === '/api/vision/analyze') {
    const body = await readBody(req);
    const { imageBase64, mimeType = 'image/jpeg', visionMode = 'handwriting', userNote = '' } = body;
    if (!imageBase64) return sendJson(res, 400, { error: 'imageBase64 is required' });

    const cleanMime = String(mimeType).split(';')[0].trim() || 'image/jpeg';
    const prompt =
      visionMode === 'handwriting'
        ? `You are Gemini 4 Hydrogen — Visual IELTS Teacher inspecting a photo of a student's handwritten English notebook, essay, or textbook exercise.
Student Note: ${userNote || 'Please check my handwriting / exercise'}
Student Level: ${studentBrain.level} (Estimated Band ${studentBrain.estimatedBand})

Read every word carefully from the image, correct grammar/spelling/vocabulary mistakes, explain in Uzbek, and provide an IELTS Band 8.0 rewrite.
Return JSON ONLY:
{
  "extractedTextOrScene": "Exact text transcribed from the image",
  "overallBand": 5.0,
  "feedbackUz": "O'zbek tilida batafsil tahlil: nima to'g'ri, qayerda xato bor va qanday yaxshilash kerak",
  "band8Version": "Full IELTS Band 8.0 corrected and upgraded version of the text",
  "vocabFromImage": [
    {
      "elementary": "basic phrase from text",
      "band8": "Band 8.0 upgrade",
      "uzbek": "o'zbekcha ma'nosi",
      "example": "natural sentence"
    }
  ],
  "speakingQuestion": "1 follow-up speaking question based on what the student wrote",
  "detectedWeakness": {
    "area": "Short weakness area from image",
    "detailUz": "O'zbekcha izoh",
    "targetSkill": "Writing & Grammar"
  }
}`
        : `You are Gemini 4 Hydrogen — Visual Speaking Coach looking at a real-world photo snapped by an Uzbek student on their iPhone 13 Pro.
Student Note: ${userNote || 'Help me describe this scene in IELTS Band 8 English!'}
Student Level: ${studentBrain.level} (Estimated Band ${studentBrain.estimatedBand})

Describe what you see in the photo, teach 4 useful Elementary -> Band 8 words/collocations connected to objects/actions in this exact photo, provide a Band 8.0 model description, and ask an engaging IELTS Speaking question about the photo!
Return JSON ONLY:
{
  "extractedTextOrScene": "Short clear summary of what is visible in the photo",
  "overallBand": null,
  "feedbackUz": "O'zbek tilida: bu rasm asosida Elementary darajadan Band 8 darajada qanday tasvirlash mumkinligi haqida izoh",
  "band8Version": "Rich 3-4 sentence IELTS Band 8.0 description of this exact scene",
  "vocabFromImage": [
    {
      "elementary": "simple word for something in the photo",
      "band8": "Band 8.0 descriptive phrase/collocation",
      "uzbek": "o'zbekcha tarjima",
      "example": "natural example sentence about the photo"
    }
  ],
  "speakingQuestion": "Engaging speaking question asking the student to talk about this photo",
  "detectedWeakness": null
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: cleanMime, data: imageBase64 } }
          ]
        }
      ],
      jsonMode: true,
      temperature: 0.5
    });

    const parsed = extractJson(text);
    if (!parsed) {
      return sendJson(res, 200, {
        extractedTextOrScene: 'Rasm tahlil qilindi',
        overallBand: null,
        feedbackUz: text,
        band8Version: '',
        vocabFromImage: [],
        speakingQuestion: 'Can you describe this picture in your own words?',
        brain: studentBrain,
        modelUsed
      });
    }

    if (parsed.detectedWeakness?.area) {
      applyBrainUpdates({
        newWeakness: parsed.detectedWeakness,
        memoryNoteUz: `Kamera/Qo'lyozma tahlili: ${parsed.detectedWeakness.area}`
      });
    }
    if (Array.isArray(parsed.vocabFromImage) && parsed.vocabFromImage.length > 0) {
      applyBrainUpdates({
        newVocab: parsed.vocabFromImage.map((v) => ({
          ...v,
          reasonUz: "Rasm/Qo'lyozma tahlilidan olindi"
        }))
      });
    }

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  // Feature 6: Visual Memory Mnemonic SVG & Dynamic IELTS Task 1 Chart Generator
  if (req.method === 'POST' && pathname === '/api/visual/generate') {
    const body = await readBody(req);
    const { visualType = 'mnemonic', wordObj = {}, chartTopic = '' } = body;

    if (visualType === 'task1_chart') {
      const prompt = `Generate a realistic, fresh IELTS Academic Writing Task 1 Chart dataset + prompt for practice.
Topic preference: ${chartTopic || 'Choose an interesting modern IELTS topic (renewable energy, urban transport, smartphone usage, higher education, tourism)'}

Return JSON ONLY:
{
  "chartTitle": "Clean English chart title",
  "chartType": "bar",
  "unit": "% or millions",
  "categories": ["2010", "2015", "2020", "2025"],
  "series": [
    { "name": "Series A", "color": "#0A84FF", "values": [24, 38, 55, 72] },
    { "name": "Series B", "color": "#30D158", "values": [62, 54, 41, 28] }
  ],
  "promptText": "Official-style IELTS Task 1 prompt instructing the student to summarize the main features and make comparisons in at least 150 words.",
  "band8OverviewTipUz": "O'zbek tilida: bu grafik uchun Band 8.0 Overview (umumiy trend) qanday yozilishi va qaysi fe'llardan foydalanish kerakligi",
  "keyVocab": ["surge dramatically", "decline steadily", "outstrip", "account for"]
}
Note: chartType must be either "bar" or "line", with 4-5 categories and 2 series of matching length.`;

      const { text, modelUsed } = await callGemini({
        apiKey,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        jsonMode: true,
        temperature: 0.75
      });

      const parsed = extractJson(text);
      if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.series)) {
        return sendJson(res, 500, { error: 'Failed to generate Task 1 chart data' });
      }
      return sendJson(res, 200, { visualType: 'task1_chart', ...parsed, modelUsed });
    }

    // Visual Memory Mnemonic SVG for Vocabulary Flashcard
    const wordText = wordObj.band8 || wordObj.elementary || 'Paramount importance';
    const uzText = wordObj.uzbek || '';
    const exText = wordObj.example || '';
    const prompt = `Create a vivid visual memory mnemonic + clean SVG illustration for an Uzbek student memorizing this IELTS Band 8 expression:
Expression: "${wordText}"
Meaning in Uzbek: "${uzText}"
Example: "${exText}"

Return JSON ONLY:
{
  "memoryAssociationUz": "2 sentences in Uzbek explaining a memorable visual story / association so the student NEVER forgets this phrase.",
  "svgCode": "<svg viewBox='0 0 320 170' xmlns='http://www.w3.org/2000/svg'>...</svg>"
}
Rules for svgCode:
- Must be valid self-contained SVG with viewBox="0 0 320 170", dark/deep background (#0e172b), bright accent colors (#0A84FF, #30D158, #FF9F0A, #BF5AF2, #FFFFFF), clear simple shapes/icons/arrows, and readable short labels illustrating the concept visually.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.7
    });

    const parsed = extractJson(text) || {
      memoryAssociationUz: `"${wordText}" (${uzText}) iborasini kuchli obraz bilan eslab qoling.`,
      svgCode: `<svg viewBox="0 0 320 170" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="170" rx="16" fill="#0e172b"/><circle cx="160" cy="70" r="38" fill="#0A84FF" opacity="0.25" stroke="#0A84FF" stroke-width="3"/><text x="160" y="76" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="bold">BAND 8.0</text><text x="160" y="136" text-anchor="middle" fill="#30D158" font-size="13" font-weight="bold">${wordText.slice(0, 32)}</text></svg>`
    };

    return sendJson(res, 200, { visualType: 'mnemonic', ...parsed, modelUsed });
  }

  // ==================== 7-DAY SNOWBALL GRAMMAR BOOTCAMP & 8-90 FREE FLIGHT ====================
  if (req.method === 'POST' && pathname === '/api/bootcamp/lesson') {
    const body = await readBody(req);
    const reqDay = Math.max(1, Math.min(90, Number(body.day || studentBrain.bootcamp.currentChainDay || 1)));
    const isBootcamp = reqDay <= 7;
    const chainDef = isBootcamp ? GRAMMAR_CHAIN_7[reqDay - 1] : null;
    const prevLinks = isBootcamp ? GRAMMAR_CHAIN_7.slice(0, reqDay - 1) : GRAMMAR_CHAIN_7;

    const prompt = isBootcamp
      ? `You are Gemini 4 Hydrogen creating Day ${reqDay}/7 of the "7-Kunlik Intensiv Grammatika Zanjiri (Snowball Bootcamp)" for an Uzbek Elementary learner aiming for IELTS Band 8.0.
CRITICAL PHILOSOPHY:
- NO boring dry textbook lectures! Keep grammar formula under 4 crisp lines, then IMMEDIATELY put the student into REAL LIVE EXPERIENCE (combining previous days + today's new block in ONE real-life sentence, Uzbek-to-English thought building, speaking & listening).
Today's Block (${reqDay}-Kun): ${chainDef.titleUz} -> ${chainDef.grammarBlock}
Previous Unlocked Blocks (MUST BE COMBINED WITH TODAY): ${prevLinks.length ? prevLinks.map((p) => `${p.day}-kun: ${p.grammarBlock}`).join(' | ') : 'None (Day 1 Foundation)'}
Student's current weaknesses: ${JSON.stringify(studentBrain.weaknesses.slice(0, 3))}

Return JSON ONLY:
{
  "day": ${reqDay},
  "phase": "bootcamp_7",
  "titleUz": "${chainDef.titleUz}",
  "notificationBannerUz": "${reqDay === 1 ? "🔔 1-kun: Gap qurish skeletining 1-zanjirini jonli amaliyotda boshlaymiz!" : `🔔 ${reqDay}-kun: Yangi grammatikani ${reqDay === 2 ? 'kechagi 1-kun' : `oldingi 1–${reqDay - 1}-kunlar`} bilan ulash vaqti keldi!`}",
  "shortFormulaUz": "3-4 qatorlik juda qisqa, tushunarli formula (quruq ma'ruza emas!)",
  "snowballBridge": {
    "oldPart": "${reqDay === 1 ? 'Asosiy qolip: S + V + O' : `Kecha/oldingi kunlar (1–${reqDay - 1}): ...`}",
    "newPart": "Bugungi ${reqDay}-kun qismi: ...",
    "combinedEnglish": "One real natural sentence merging OLD + NEW grammar seamlessly",
    "combinedUzbek": "O'zbekcha tarjimasi",
    "explanationUz": "Qanday qilib eski va yangi bitta gapga ulanganini qisqacha tushuntirish"
  },
  "liveVocabulary": [
    {
      "uzbek": "o'zbekcha",
      "elementary": "oddiy so'z",
      "band8": "Band 8 ibora",
      "chainExample": "Example sentence using Day ${reqDay} snowball chain"
    }
  ],
  "uzbekToEnglishBuilder": {
    "uzbekThought": "Hayotiy o'zbekcha fikr (1..${reqDay}-kun zanjirlarini bitta gapda ishlatishga majbur qiladigan)",
    "hintBlocks": ["Masalan: yesterday / usually / because..."],
    "modelCombinedEnglish": "Expected correct combined English sentence",
    "band8Version": "IELTS Band 8.0 upgraded version"
  },
  "livePracticePrompt": "Engaging question/scenario the AI Teacher will ask immediately in voice/text chat to force Days 1..${reqDay} usage",
  "mediaQuery": "2-4 English keywords to find real audio/video practicing today's grammar in natural speech"
}
Provide 4 items in liveVocabulary.`
      : `You are Gemini 4 Hydrogen designing Day ${reqDay}/90 ("IELTS 8.0 Erkin Parvoz — Pure Language Experience").
The 7-day grammar skeleton is ALREADY complete. Today is pure high-level language experience: C1/C2 vocabulary, fast audio/video comprehension, and Band 8.0 Speaking/Writing!
Student weaknesses to watch/repair: ${JSON.stringify(studentBrain.weaknesses.slice(0, 4))}

Return JSON ONLY:
{
  "day": ${reqDay},
  "phase": "free_flight_8_90",
  "titleUz": "${reqDay}-Kun / 90: IELTS 8.0 Erkin Parvoz — Sof Til Tajribasi",
  "notificationBannerUz": "🚀 ${reqDay}-kun: Grammatika skeleti tayyor! Bugun sof C1/C2 lug'at, tez tushunish va Band 8.0 suhbat!",
  "shortFormulaUz": "Bugungi C1/C2 strategiya va nutqni boyitish qoidasi (3 qator)",
  "snowballBridge": {
    "oldPart": "7-kunlik To'liq Skelet",
    "newPart": "Bugungi Band 8.0 C1/C2 Leksika & Idioma",
    "combinedEnglish": "Sophisticated Band 8.0 model sentence",
    "combinedUzbek": "O'zbekcha ma'nosi",
    "explanationUz": "Nimasi bilan Band 8.0 darajasida ekani"
  },
  "liveVocabulary": [
    { "uzbek": "...", "elementary": "...", "band8": "...", "chainExample": "..." }
  ],
  "uzbekToEnglishBuilder": {
    "uzbekThought": "IELTS Part 2/3 darajasidagi o'zbekcha fikr",
    "hintBlocks": ["C1/C2 hints"],
    "modelCombinedEnglish": "...",
    "band8Version": "..."
  },
  "livePracticePrompt": "High-impact IELTS Speaking/Debate scenario to practice live",
  "mediaQuery": "BBC 6 Minute English TED IELTS speaking band 8"
}
Provide 4 items in liveVocabulary.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.68
    });

    const parsed = extractJson(text);
    if (!parsed) return sendJson(res, 500, { error: 'Failed to generate bootcamp experience' });

    return sendJson(res, 200, { ...parsed, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/bootcamp/check-builder') {
    const body = await readBody(req);
    const { day = 1, uzbekThought = '', studentEnglish = '' } = body;
    if (!studentEnglish || studentEnglish.trim().length < 5) {
      return sendJson(res, 400, { error: 'Inglizcha gap yozing yoki ayting!' });
    }

    const reqDay = Math.max(1, Math.min(90, Number(day)));
    const requiredChain = GRAMMAR_CHAIN_7.slice(0, Math.min(7, reqDay));

    const prompt = `Evaluate this Uzbek student's Snowball Grammar Chain sentence for Day ${reqDay}.
Target Uzbek Thought: "${uzbekThought}"
Student's English Attempt: "${studentEnglish}"
Required Grammar Chain Links to Connect (${requiredChain.length} links):
${requiredChain.map((c) => `- Day ${c.day}: ${c.grammarBlock}`).join('\n')}

Check strictly:
1) Did the student successfully combine BOTH previous links AND today's Day ${Math.min(7, reqDay)} link in this sentence/thought?
2) Give encouraging Uzbek feedback, the clean corrected combined sentence, and an IELTS Band 8.0 version!

Return JSON ONLY:
{
  "passed": true,
  "usedLinks": ["1-kun: ...", "2-kun: ..."],
  "missingLinks": [],
  "correctedCombined": "Grammatically clean combined sentence",
  "band8Combined": "Band 8.0 upgraded combined sentence",
  "feedbackUz": "O'zbekcha tushuntirish: qaysi zanjir to'g'ri ulandi va nima yetishmadi"
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.45
    });

    const parsed = extractJson(text) || {
      passed: true,
      usedLinks: requiredChain.map((c) => c.shortLabel),
      missingLinks: [],
      correctedCombined: studentEnglish,
      band8Combined: studentEnglish,
      feedbackUz: text
    };

    if (!parsed.passed && Array.isArray(parsed.missingLinks) && parsed.missingLinks.length > 0) {
      applyBrainUpdates({
        newWeakness: {
          area: `Zanjir Bo'shlig'i (${reqDay}-kun)`,
          detailUz: parsed.feedbackUz,
          targetSkill: 'Grammar Chain'
        }
      });
    }

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/bootcamp/advance') {
    const body = await readBody(req);
    const completedDay = Number(body.completedDay || studentBrain.bootcamp.currentChainDay || 1);
    const bc = studentBrain.bootcamp;

    if (!bc.completedChainDays.includes(completedDay)) {
      bc.completedChainDays.push(completedDay);
    }
    if (completedDay >= bc.currentChainDay && bc.currentChainDay < 90) {
      bc.currentChainDay = completedDay + 1;
    }
    bc.phase = bc.currentChainDay <= 7 ? 'bootcamp_7' : 'free_flight_8_90';
    bc.brokenLinksAlert = null;
    bc.notificationUz = buildChainNotification(studentBrain);

    studentBrain.estimatedBand = Number(
      Math.min(8.5, 4.0 + bc.completedChainDays.length * (bc.currentChainDay <= 7 ? 0.25 : 0.05)).toFixed(1)
    );
    studentBrain.skillBands = {
      speaking: Math.max(studentBrain.skillBands.speaking, studentBrain.estimatedBand),
      listening: Math.max(studentBrain.skillBands.listening, Number((studentBrain.estimatedBand - 0.1).toFixed(1))),
      reading: Math.max(studentBrain.skillBands.reading, studentBrain.estimatedBand),
      writing: Math.max(studentBrain.skillBands.writing, Number((studentBrain.estimatedBand - 0.2).toFixed(1)))
    };
    studentBrain.dailyChecklist = {
      step1_patterns: false,
      step2_bricks: false,
      step3_micro_media: false,
      step4_live_chat: false,
      completedCount: 0
    };
    studentBrain.dailyBriefing = createDefaultBriefing(studentBrain);
    studentBrain.aiMemoryNotes.unshift(
      completedDay <= 7
        ? `⚡ ${completedDay}-kun Grammatika Zanjiri yakunlandi! Keyingi: ${bc.currentChainDay}-kun.`
        : `🚀 ${completedDay}-kun Erkin Parvoz tajribasi yakunlandi!`
    );
    studentBrain.aiMemoryNotes = studentBrain.aiMemoryNotes.slice(0, 15);
    saveBrain(studentBrain);

    return sendJson(res, 200, { brain: studentBrain });
  }

  // ==================== LEVEL-ADAPTIVE SCAFFOLDING ENDPOINTS (ALL LEVELS A2 -> BAND 8.0) ====================

  // 1. Mixed Uzbek/English Thought -> Interactive Word Bricks scaled to student's current level
  if (req.method === 'POST' && pathname === '/api/brick-helper') {
    const body = await readBody(req);
    const rawInput = String(body.rawInput || '').trim();
    if (!rawInput) return sendJson(res, 400, { error: 'Fikringizni yozing (o‘zbekcha yoki aralash)!' });

    const prompt = `You are helping an Uzbek student at level "${studentBrain.level}" (Estimated Band ${studentBrain.estimatedBand}) turn their mixed Uzbek/English or Uzbek thought into natural English using Word Bricks!
Student's Input: "${rawInput}"

Adapt "currentLevelEnglish" cleanly to their current level (${studentBrain.level}), AND provide the "band8English" version!
Split "currentLevelEnglish" into 5-9 meaningful phrase/word bricks in order ("orderedBricks") plus 2 tricky distractor bricks in "shuffledBricks" (random order of all bricks + distractors).

Return JSON ONLY:
{
  "currentLevelLabel": "${studentBrain.level}",
  "currentLevelEnglish": "Natural sentence matched to student's current Band ${studentBrain.estimatedBand}",
  "band8English": "IELTS Band 8.0 upgraded version of the same idea",
  "orderedBricks": ["Yesterday", "I went", "to work", "and", "I felt", "exhausted"],
  "shuffledBricks": ["to work", "exhausted", "I went", "Yesterday", "go", "and", "I felt", "very much"],
  "uzbekExplanation": "O'zbek tilida qisqa tushuntirish: nima uchun kubiklar shu tartibda qo'yildi va Band 8 versiyasida nima o'zgardi"
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.5
    });

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.orderedBricks)) {
      return sendJson(res, 500, { error: 'Failed to generate word bricks' });
    }

    studentBrain.dailyChecklist.step2_bricks = true;
    saveBrain(studentBrain);

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  // 2. Global Tap-to-Translate & 3-Tier Level Upgrade Lookup
  if (req.method === 'POST' && pathname === '/api/word/lookup') {
    const body = await readBody(req);
    const word = String(body.word || '').trim().replace(/^[^a-zA-Z]+|[^a-zA-Z'-]+$/g, '');
    const contextSentence = String(body.contextSentence || '').slice(0, 300);
    if (!word) return sendJson(res, 400, { error: 'word is required' });

    const prompt = `Explain this English word/phrase for an Uzbek learner currently at "${studentBrain.level}" (Band ${studentBrain.estimatedBand}):
Word: "${word}"
Context sentence: "${contextSentence || 'General English'}"

Return JSON ONLY:
{
  "word": "${word}",
  "ipa": "/pronunciation/",
  "partOfSpeech": "verb / noun / adj / phrase",
  "uzbekMeaning": "Kontekstga mos aniq o'zbekcha ma'nosi",
  "tiers": {
    "elementaryA2": "simpler Elementary (A2) equivalent",
    "intermediateB2": "natural Intermediate (B2) equivalent",
    "band8C1": "sophisticated IELTS Band 8.0 (C1/C2) equivalent"
  },
  "example": "Clear example sentence suited to Band ${studentBrain.estimatedBand}"
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.35
    });

    const parsed = extractJson(text) || {
      word,
      ipa: '',
      partOfSpeech: 'word',
      uzbekMeaning: word,
      tiers: { elementaryA2: word, intermediateB2: word, band8C1: word },
      example: contextSentence || word
    };
    return sendJson(res, 200, { ...parsed, modelUsed });
  }

  // 3. Level-Adaptive Golden Verbs & Patterns Trainer (A2 V1-V2-V3 -> B1/B2 Phrasal Verbs -> C1/Band 8 Collocations)
  if (req.method === 'POST' && pathname === '/api/brain/golden-patterns') {
    const body = await readBody(req);
    const customFocus = String(body.customFocus || '').trim();
    const band = Number(studentBrain.estimatedBand || 4.0);

    const tierDirective =
      band < 5.2
        ? 'TIER 1 (Elementary A2): Focus on 6 essential high-frequency survival/irregular verbs (with V1 - V2 - V3 forms) and core starter frames (want to, have to, used to, was/were).'
        : band < 6.5
        ? 'TIER 2 (Pre-Intermediate/Intermediate B1-B2): Focus on 6 high-utility Phrasal Verbs, Prepositional Verbs, and B2 contrasting/linking sentence frames.'
        : 'TIER 3 (Upper-Intermediate to IELTS Band 8.0 C1/C2): Focus on 6 elite IELTS Band 8.0 Verb+Noun Collocations, Natural Idioms, and Cleft/Inversion sentence frames.';

    const prompt = `Generate a Level-Adaptive "Oltin Fe'llar va Qoliplar" training pack!
Student Current Level: ${studentBrain.level} (Estimated Band ${band})
Weaknesses: ${JSON.stringify(studentBrain.weaknesses.slice(0, 4))}
${tierDirective}
Extra focus: ${customFocus || 'Tailored directly to student current level and weaknesses'}

Return JSON ONLY:
{
  "tierTitleUz": "Darajangizga mos sarlavha (masalan: Elementary Oltin Fe'llar / B2 Phrasal Verbs / Band 8 Collocations)",
  "whyThisTierUz": "Nega aynan hozirgi Band ${band} darajangizda bularni o'rganish muhim",
  "patterns": [
    {
      "pattern": "e.g. go - went - gone (or take into account / mitigate)",
      "uzbek": "o'zbekcha ma'nosi",
      "formulaUz": "Qisqa qolip/ishlatish qoidasi",
      "example": "Natural example sentence",
      "band8Upgrade": "Band 8.0 version of that expression"
    }
  ],
  "drills": [
    {
      "question": "Fill-in-the-blank or choice check using one of the 6 patterns",
      "options": ["Option A", "Option B", "Option C"],
      "correctIndex": 0,
      "explanationUz": "O'zbekcha izoh"
    }
  ]
}
Include 6 patterns and 3 drills.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.6
    });

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.patterns)) {
      return sendJson(res, 500, { error: 'Failed to generate golden patterns' });
    }

    studentBrain.dailyChecklist.step1_patterns = true;
    saveBrain(studentBrain);

    return sendJson(res, 200, { ...parsed, brain: studentBrain, modelUsed });
  }

  // 4. Daily Checklist Toggle / Completion
  if (req.method === 'POST' && pathname === '/api/brain/checklist-toggle') {
    const body = await readBody(req);
    const key = body.key;
    if (['step1_patterns', 'step2_bricks', 'step3_micro_media', 'step4_live_chat'].includes(key)) {
      const prevAll = studentBrain.dailyChecklist.completedCount === 4;
      studentBrain.dailyChecklist[key] =
        typeof body.value === 'boolean' ? body.value : !studentBrain.dailyChecklist[key];
      syncLevelFromBand(studentBrain);
      if (!prevAll && studentBrain.dailyChecklist.completedCount === 4) {
        studentBrain.estimatedBand = Number(Math.min(8.5, studentBrain.estimatedBand + 0.2).toFixed(1));
      }
      saveBrain(studentBrain);
    }
    return sendJson(res, 200, { brain: studentBrain });
  }

  // 5. Proactive Daily AI Notification & Knowledge Diagnosis Briefing
  if (req.method === 'POST' && pathname === '/api/brain/daily-briefing') {
    const day = Number(studentBrain.bootcamp?.currentChainDay || 1);
    const prompt = `You are Gemini 4 Hydrogen — an honest, encouraging, hyper-personalized IELTS Band 8.0 AI Coach giving the student their daily morning/session notification and knowledge diagnosis!
STUDENT COGNITIVE DATA:
- Current Level: ${studentBrain.level}
- Overall Estimated Band: ${studentBrain.estimatedBand} / 8.0
- 4 Skill Bands: ${JSON.stringify(studentBrain.skillBands)}
- Study Day: Day ${day} / 90 (${day <= 7 ? '7-Day Intensive Snowball Grammar Chain' : 'Days 8-90 IELTS 8.0 Free Flight'})
- Detected Weaknesses: ${JSON.stringify(studentBrain.weaknesses.slice(0, 6))}
- Strengths: ${JSON.stringify(studentBrain.strengths.slice(0, 4))}
- Saved Personal Vocab Count: ${studentBrain.personalVocab.length}
- Media Consumed Count: ${studentBrain.mediaHistory.length}
- Today's Checklist Status: ${JSON.stringify(studentBrain.dailyChecklist)}

Give an honest, concrete, motivating Uzbek report:
1) Tell them clearly what their current level and knowledge state are (what they know, what exact gaps are holding them back from Band 8.0 right now).
2) Tell them where they stand on the 3-month (90-day) Band 8.0 track (be honest: reaching Band 8.0 in 90 days requires completing daily active practice consistently, and show them the exact next step today!).
3) Prescribe 4 concrete, tailored missions for TODAY matching the 4 action types ("patterns", "bricks", "media", "chat").

Return JSON ONLY:
{
  "generatedForDay": ${day},
  "pushTitleUz": "🔔 ${day}-Kun AI Bildirishnomasi: Hozirgi darajangiz va bugungi rejangiz tayyor!",
  "knowledgeDiagnosisUz": "3 sentences in Uzbek directly explaining what they currently know, their exact detected weaknesses/strengths, and what Band they currently hold.",
  "paceStatusUz": "3-oylik (90 kunlik) IELTS 8.0 yo'lidagi haqqoniy sur'at va bugungi maqsad (1-2 sentences in Uzbek)",
  "missions": [
    {
      "id": "step1_patterns",
      "actionType": "patterns",
      "titleUz": "Specific Uzbek title for today's Golden Patterns task",
      "detailUz": "Why & how to do it today"
    },
    {
      "id": "step2_bricks",
      "actionType": "bricks",
      "titleUz": "Specific Uzbek title for today's Word Bricks / Snowball sentence task",
      "detailUz": "Why & how to do it today"
    },
    {
      "id": "step3_micro_media",
      "actionType": "media",
      "titleUz": "Specific Uzbek title for today's Micro-Listening / Media task targeting their gap",
      "detailUz": "Why & how to do it today"
    },
    {
      "id": "step4_live_chat",
      "actionType": "chat",
      "titleUz": "Specific Uzbek title for today's Live Speaking / Writing practice",
      "detailUz": "Why & how to do it today"
    }
  ]
}`;

    let parsed = createDefaultBriefing(studentBrain);
    let modelUsed = 'local-brain-fallback';
    try {
      const resAi = await callGemini({
        apiKey,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        jsonMode: true,
        temperature: 0.55
      });
      modelUsed = resAi.modelUsed;
      const aiJson = extractJson(resAi.text);
      if (aiJson) parsed = aiJson;
    } catch (err) {
      console.warn('Daily briefing AI fallback:', err.message);
    }

    studentBrain.dailyBriefing = { ...createDefaultBriefing(studentBrain), ...parsed, generatedForDay: day };
    saveBrain(studentBrain);

    return sendJson(res, 200, {
      briefing: studentBrain.dailyBriefing,
      brain: studentBrain,
      modelUsed
    });
  }

  // ==================== STRICT MODE OVERRIDE ====================
  if (req.method === 'POST' && pathname === '/api/brain/strict-mode') {
    const body = await readBody(req);
    if (['auto', 'assisted', 'semi_strict', 'exam_strict'].includes(body.strictMode)) {
      studentBrain.strictMode = body.strictMode;
      saveBrain(studentBrain);
    }
    return sendJson(res, 200, { brain: studentBrain, effectiveStrictStage: getEffectiveStrictStage(studentBrain) });
  }

  // ==================== IELTS READING & LISTENING 8.5 SIMULATOR ====================
  if (req.method === 'POST' && pathname === '/api/exam/reading-listening') {
    const body = await readBody(req);
    const skill = body.skill === 'listening' ? 'listening' : 'reading';
    const topic = String(body.topic || 'Urbanization, Technology & Climate').trim();

    const prompt = `Create a realistic IELTS Academic ${skill.toUpperCase()} Band 8.5 Practice Exam Section on topic "${topic}" tailored so the student (${studentBrain.level}) learns official IELTS question traps!
Provide a rich ${skill === 'listening' ? 'dialogue/lecture audio script (~240 words with Speaker labels & natural distractors where a speaker corrects themselves)' : '4-paragraph academic passage (~280 words labeled [A], [B], [C], [D])'} AND 10 official IELTS questions covering ALL 4 question types:
- Q1-Q3: "tfng" (True / False / Not Given — options MUST be ["True", "False", "Not Given"])
- Q4-Q5: "matching" (Matching Paragraph/Section A, B, C, D — options ["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D"])
- Q6-Q8: "gapfill" (Summary/Note Completion — "NO MORE THAN TWO WORDS", with exact sentence containing "_____" and "acceptableAnswers" array of 1-3 lowercase variants!)
- Q9-Q10: "mcq" (4-option Multiple Choice A, B, C, D)
Plus 5 "synonymTraps" showing exact Paraphrase pairs (Passage Word <-> Question Paraphrase <-> Uzbek meaning)!

Return JSON ONLY:
{
  "skill": "${skill}",
  "title": "Official-style title",
  "passageOrScript": "Full passage with [A], [B], [C], [D] paragraphs (or full Listening audio script)",
  "questions": [
    {
      "id": 1,
      "type": "tfng",
      "prompt": "Statement to evaluate",
      "options": ["True", "False", "Not Given"],
      "correctIndex": 0,
      "acceptableAnswers": [],
      "explanationUz": "O'zbekcha izoh: matndan qaysi jumla asosida True/False/Not Given ekani"
    },
    {
      "id": 6,
      "type": "gapfill",
      "prompt": "Complete with NO MORE THAN TWO WORDS: The researchers discovered that _____ increased rapidly.",
      "options": [],
      "correctIndex": 0,
      "acceptableAnswers": ["solar output", "solar energy"],
      "explanationUz": "O'zbekcha izoh"
    }
  ],
  "synonymTraps": [
    {
      "passageWord": "word/phrase in text or audio",
      "questionParaphrase": "how the question paraphrased it",
      "uzbek": "o'zbekcha ma'nosi"
    }
  ]
}
Strictly include 10 questions (3 tfng, 2 matching, 3 gapfill, 2 mcq) and 5 synonymTraps.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.55
    });

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.questions)) {
      return sendJson(res, 500, { error: 'Failed to generate IELTS R/L simulator test' });
    }
    return sendJson(res, 200, { ...parsed, modelUsed });
  }

  // ==================== 30-WORD ACADEMIC & SYNONYM TRAP SPEED-SPRINT ====================
  if (req.method === 'POST' && pathname === '/api/vocab/sprint') {
    const body = await readBody(req);
    const theme = String(body.theme || 'Academic Core, Environment, Tech & Research').trim();
    const batch = Number(studentBrain.vocabSprint?.currentBatchDay || 1);

    const prompt = `Generate a high-speed 30-word IELTS Academic & Synonym Trap Sprint (Batch #${batch}) on theme "${theme}" for a student moving from ${studentBrain.level} toward IELTS Reading/Listening 8.5 (target 3,000+ academic words)!
Every item MUST teach a critical IELTS academic word/collocation + its Reading/Listening synonym paraphrase + Uzbek translation + 3 clearly wrong Uzbek distractors for a 60-second Speed Quiz game!

Return JSON ONLY:
{
  "batchNumber": ${batch},
  "themeUz": "Bugungi 30 talik sprint mavzusi",
  "words": [
    {
      "word": "mitigate",
      "synonymTrap": "reduce / alleviate",
      "uzbek": "yumshatmoq / kamaytirmoq",
      "distractorsUz": ["ko'paytirmoq", "taqiqlamoq", "o'lchamoq"]
    }
  ]
}
Include 30 distinct high-value IELTS words in "words". Keep each field crisp and accurate.`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      jsonMode: true,
      temperature: 0.6
    });

    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.words) || parsed.words.length === 0) {
      return sendJson(res, 500, { error: 'Failed to generate 30-word sprint' });
    }
    return sendJson(res, 200, { ...parsed, modelUsed });
  }

  if (req.method === 'POST' && pathname === '/api/vocab/sprint-complete') {
    const body = await readBody(req);
    const learnedCount = Math.max(1, Math.min(30, Number(body.learnedCount || 30)));
    const score = Number(body.score || 0);
    studentBrain.vocabSprint.totalMasteredCount += learnedCount;
    studentBrain.vocabSprint.currentBatchDay += 1;
    if (score > studentBrain.vocabSprint.highScoreCombo) {
      studentBrain.vocabSprint.highScoreCombo = score;
    }
    studentBrain.skillBands.reading = Number(Math.min(8.5, studentBrain.skillBands.reading + 0.1).toFixed(1));
    studentBrain.skillBands.listening = Number(Math.min(8.5, studentBrain.skillBands.listening + 0.1).toFixed(1));
    studentBrain.estimatedBand = Number(
      Math.min(
        8.5,
        (studentBrain.skillBands.speaking +
          studentBrain.skillBands.listening +
          studentBrain.skillBands.reading +
          studentBrain.skillBands.writing) /
          4
      ).toFixed(1)
    );
    saveBrain(studentBrain);
    return sendJson(res, 200, { brain: studentBrain });
  }

  // ==================== WEEKLY NO-HINTS CHECKPOINT EXAM ====================
  if (req.method === 'POST' && pathname === '/api/exam/weekly-checkpoint') {
    const body = await readBody(req);
    const action = body.action === 'submit' ? 'submit' : 'generate';

    if (action === 'generate') {
      const weekNum = studentBrain.weeklyCheckpoints.length + 1;
      const prompt = `Create Weekly Strict IELTS Checkpoint Exam #${weekNum} (ZERO Uzbek hints! Real exam pressure!).
Return JSON ONLY:
{
  "week": ${weekNum},
  "listeningScript": "Short 130-word academic mini-talk with numbers/facts",
  "listeningQuestions": [
    { "prompt": "Gap-fill or MCQ question 1", "options": ["A", "B", "C", "D"], "correctIndex": 0 },
    { "prompt": "Question 2", "options": ["A", "B", "C", "D"], "correctIndex": 1 }
  ],
  "readingPassage": "Short 160-word academic paragraph",
  "readingQuestions": [
    { "prompt": "True/False/Not Given statement 1", "options": ["True", "False", "Not Given"], "correctIndex": 0 },
    { "prompt": "True/False/Not Given statement 2", "options": ["True", "False", "Not Given"], "correctIndex": 2 }
  ],
  "writingPrompt": "Concise IELTS Task 2 opinion question (write 60-120 words)",
  "speakingPrompt": "IELTS Part 2/3 combined prompt (write or speak your full answer)"
}`;
      const { text, modelUsed } = await callGemini({
        apiKey,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        jsonMode: true,
        temperature: 0.55
      });
      const parsed = extractJson(text);
      if (!parsed) return sendJson(res, 500, { error: 'Failed to generate weekly checkpoint' });
      return sendJson(res, 200, { exam: parsed, modelUsed });
    }

    // Submit & strictly grade all 4 skills
    const { exam = {}, answers = {} } = body;
    let lCorrect = 0;
    (exam.listeningQuestions || []).forEach((q, i) => {
      if (Number(answers[`l_${i}`]) === q.correctIndex) lCorrect++;
    });
    let rCorrect = 0;
    (exam.readingQuestions || []).forEach((q, i) => {
      if (Number(answers[`r_${i}`]) === q.correctIndex) rCorrect++;
    });

    const evalPrompt = `Strictly grade this Weekly IELTS Checkpoint Exam (no inflation, honest IELTS Band Descriptors!).
Listening score: ${lCorrect} / ${(exam.listeningQuestions || []).length || 2}
Reading score: ${rCorrect} / ${(exam.readingQuestions || []).length || 2}
Writing prompt: ${exam.writingPrompt || ''}
Student Writing answer: ${answers.writing || '(blank)'}
Speaking prompt: ${exam.speakingPrompt || ''}
Student Speaking answer: ${answers.speaking || '(blank)'}

Return JSON ONLY:
{
  "listening": 5.5,
  "reading": 6.0,
  "writing": 5.0,
  "speaking": 5.0,
  "overall": 5.5,
  "verdictUz": "Haqqoniy o'zbekcha xulosa: hozirgi haqiqiy IELTS darajangiz va nimani zudlik bilan tuzatish kerak",
  "improvementsUz": ["Specific action 1", "Specific action 2"]
}`;

    const { text, modelUsed } = await callGemini({
      apiKey,
      contents: [{ role: 'user', parts: [{ text: evalPrompt }] }],
      jsonMode: true,
      temperature: 0.35
    });

    const graded = extractJson(text) || {
      listening: lCorrect === 2 ? 7.0 : lCorrect === 1 ? 5.5 : 4.0,
      reading: rCorrect === 2 ? 7.0 : rCorrect === 1 ? 5.5 : 4.0,
      writing: 4.5,
      speaking: 4.5,
      overall: 5.0,
      verdictUz: 'Haftalik nazorat topshirildi.',
      improvementsUz: ['Kunlik 30 ta akademik so‘z sprintini bajaring']
    };

    const checkpointRecord = {
      week: exam.week || studentBrain.weeklyCheckpoints.length + 1,
      date: new Date().toISOString().slice(0, 10),
      ...graded
    };
    studentBrain.weeklyCheckpoints.unshift(checkpointRecord);
    studentBrain.skillBands = {
      listening: Number(graded.listening || studentBrain.skillBands.listening),
      reading: Number(graded.reading || studentBrain.skillBands.reading),
      writing: Number(graded.writing || studentBrain.skillBands.writing),
      speaking: Number(graded.speaking || studentBrain.skillBands.speaking)
    };
    studentBrain.estimatedBand = Number(graded.overall || studentBrain.estimatedBand);
    studentBrain.aiMemoryNotes.unshift(
      `🏆 ${checkpointRecord.week}-Haftalik Checkpoint Natijasi: Overall ${checkpointRecord.overall} (L:${checkpointRecord.listening} R:${checkpointRecord.reading} W:${checkpointRecord.writing} S:${checkpointRecord.speaking})`
    );
    studentBrain.aiMemoryNotes = studentBrain.aiMemoryNotes.slice(0, 15);
    saveBrain(studentBrain);

    return sendJson(res, 200, { result: checkpointRecord, brain: studentBrain, modelUsed });
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ipa': 'application/octet-stream',
  '.mobileconfig': 'application/x-apple-aspen-config'
};

function serveStatic(res, pathname) {
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  reqPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
      return;
    }
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    };
    if (ext === '.ipa' || ext === '.mobileconfig' || pathname.startsWith('/downloads/')) {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

async function requestHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, parsedUrl.searchParams);
    } catch (err) {
      console.error('API Error:', pathname, err);
      sendJson(res, 500, { error: err.message || 'Server error' });
    }
    return;
  }

  serveStatic(res, pathname);
}

const server = http.createServer(requestHandler);

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`Gemini 4 Hydrogen Cognitive AI Teacher Server running:`);
  console.log(`  Local:          http://localhost:${PORT}`);
  console.log(`  iPhone 13 Pro:  http://${lanIp}:${PORT}`);
  console.log(`  Primary Model:  ${PRIMARY_MODEL} (Fallbacks: ${MODEL_CHAIN.slice(1).join(', ')})`);
});

const certKeyPath = path.join(__dirname, 'certs', 'server.key');
const certCrtPath = path.join(__dirname, 'certs', 'server.crt');
if (fs.existsSync(certKeyPath) && fs.existsSync(certCrtPath)) {
  const httpsServer = https.createServer(
    { key: fs.readFileSync(certKeyPath), cert: fs.readFileSync(certCrtPath) },
    requestHandler
  );
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    const lanIp = getLanIp();
    console.log(`  HTTPS (Mic):    https://${lanIp}:${HTTPS_PORT}`);
  });
}
