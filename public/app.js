(() => {
  const UI_STORAGE_KEY = 'ielts8_cognitive_ui_v2';

  const DEFAULT_UI = {
    activeTab: 'tutor',
    tutorMode: 'mentor',
    chats: {
      mentor: [],
      speaking: [],
      media_discussion: [],
      mock_exam: []
    },
    currentMedia: null,
    autoVoice: true,
    voiceName: 'Kore',
    customApiKey: '',
    fullscreenDesktop: false
  };

  let ui = loadUi();
  let brain = {
    level: "Elementary (A2 - Boshlang'ich)",
    estimatedBand: 4.0,
    targetBand: 8.0,
    activeFocusUz: "O'quvchi bilan tanishish va kamchiliklarni aniqlash",
    weaknesses: [],
    strengths: [],
    interests: [],
    dynamicRoadmap: [],
    personalVocab: [],
    mediaHistory: [],
    aiMemoryNotes: [],
    bootcamp: {
      currentChainDay: 1,
      completedChainDays: [],
      phase: 'bootcamp_7',
      brokenLinksAlert: null,
      notificationUz: "🔔 1-kun: Gap tuzishning 1-zanjirini jonli amaliyotda boshlaymiz!"
    }
  };
  let chainSkeleton = [];

  let serverConfig = {
    primaryModel: 'gemini-4-hydrogen',
    lanIp: window.location.hostname || '192.168.0.103',
    port: window.location.port || '3000'
  };

  let activeAudio = null;
  let recognition = null;
  let isRecording = false;
  let mockTimerInterval = null;
  let mockSeconds = 0;
  let mediaItems = [];
  let activeMediaSource = 'all';
  let currentCardIndex = 0;
  let activeScenario = 'airport';
  let activeVisionMode = 'handwriting';
  let chatMediaRecorder = null;
  let isXrayRecording = false;
  let shadowMediaRecorder = null;
  let activeShadowRecordIdx = -1;
  let shadowSentences = [];

  const MEM_STORE = {};

  function safeStorageGet(key) {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    } catch (_) {}
    if (key in MEM_STORE) return MEM_STORE[key];
    try {
      if (window.name && window.name.startsWith('IELTS8_MEM:')) {
        const bag = JSON.parse(window.name.slice(11));
        if (bag && key in bag) return bag[key];
      }
    } catch (_) {}
    return null;
  }

  function safeStorageSet(key, val) {
    MEM_STORE[key] = String(val);
    try {
      window.localStorage.setItem(key, String(val));
    } catch (_) {}
    try {
      window.name = 'IELTS8_MEM:' + JSON.stringify(MEM_STORE);
    } catch (_) {}
  }

  function loadUi() {
    try {
      const raw = safeStorageGet(UI_STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_UI);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_UI),
        ...parsed,
        chats: { ...DEFAULT_UI.chats, ...(parsed.chats || {}) }
      };
    } catch (_) {
      return structuredClone(DEFAULT_UI);
    }
  }

  function saveUi() {
    safeStorageSet(UI_STORAGE_KEY, JSON.stringify(ui));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = $('toastEl');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  const FALLBACK_KEY = '';
  const DIRECT_MODELS = [
    'gemini-4-hydrogen',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest'
  ];

  const DEFAULT_CHAIN_SKELETON = [
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

  function getActiveApiKey() {
    return ui.customApiKey && ui.customApiKey.trim().length > 10 ? ui.customApiKey.trim() : FALLBACK_KEY;
  }

  function extractJsonSafe(rawText) {
    if (!rawText) return null;
    try {
      return JSON.parse(rawText);
    } catch (_) {}
    const cleaned = String(rawText).replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {}
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch (_) {}
    }
    return null;
  }

  async function directGeminiJson(promptText, systemText = '', options = {}) {
    const key = getActiveApiKey();
    if (!key) {
      throw new Error('API kalit topilmadi: ⚙️ Sozlamalar -> Google AI Studio API Key ga kiriting.');
    }
    const contents = options.contents || [{ role: 'user', parts: [{ text: promptText }] }];
    const body = {
      contents,
      generationConfig: { responseMimeType: 'application/json', temperature: options.temperature ?? 0.6 }
    };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
    for (const m of DIRECT_MODELS) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (!resp.ok) continue;
        const j = await resp.json();
        const txt = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
        const parsed = extractJsonSafe(txt);
        if (parsed) return { parsed, text: txt, modelUsed: m };
      } catch (_) {}
    }
    throw new Error('Standalone AI ulanishida xatolik (Internet aloqasini tekshiring)');
  }

  function pcm16Base64ToWavBase64(pcmBase64, sampleRate = 24000) {
    const binStr = atob(pcmBase64);
    const dataSize = binStr.length;
    const wav = new Uint8Array(44 + dataSize);
    const view = new DataView(wav.buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) wav[off + i] = s.charCodeAt(i);
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    for (let i = 0; i < dataSize; i++) wav[44 + i] = binStr.charCodeAt(i);
    let out = '';
    const chunk = 0x8000;
    for (let i = 0; i < wav.length; i += chunk) {
      out += String.fromCharCode.apply(null, wav.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  async function directGeminiTts(text, voiceName = 'Kore') {
    const key = getActiveApiKey();
    const safeVoice = ['Kore', 'Puck', 'Aoede', 'Charon', 'Fenrir'].includes(voiceName) ? voiceName : 'Kore';
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(text || '').slice(0, 900) }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } }
          }
        })
      }
    );
    if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);
    const j = await resp.json();
    const inlineData = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) throw new Error('Audio topilmadi');
    const rateMatch = (inlineData.mimeType || '').match(/rate=(\d+)/i);
    const rate = rateMatch ? Number(rateMatch[1]) : 24000;
    return { audioBase64: pcm16Base64ToWavBase64(inlineData.data, rate), mimeType: 'audio/wav', modelUsed: 'gemini-2.5-flash-preview-tts' };
  }

  async function directInternetMediaSearch(query, source = 'all', queriesOverride = null) {
    const qAudio = queriesOverride?.audioQuery || query || 'BBC Learning English';
    const qVideo = queriesOverride?.videoQuery || query || 'English speaking elementary';
    const qArticle = queriesOverride?.articleQuery || query || 'English language';
    const tasks = [];

    if (source === 'all' || source === 'audio') {
      tasks.push(
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(qAudio)}&media=podcastEpisode&limit=4`)
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((j) =>
            (j.results || [])
              .filter((e) => e.episodeUrl)
              .map((e) => ({
                id: `pod_${e.trackId}`,
                mediaType: 'audio',
                sourcePlatform: 'Podcast Audio',
                title: e.trackName || 'English Podcast',
                channel: e.collectionName || 'Podcast',
                duration: e.trackTimeMillis ? `${Math.max(1, Math.round(e.trackTimeMillis / 60000))} min` : 'Audio',
                thumbnail: e.artworkUrl600 || e.artworkUrl160 || '',
                audioUrl: e.episodeUrl,
                url: e.trackViewUrl || e.episodeUrl,
                snippet: (e.shortDescription || e.description || '').slice(0, 180)
              }))
          )
          .catch(() => [])
      );
    }

    if (source === 'all' || source === 'dailymotion' || source === 'youtube') {
      tasks.push(
        fetch(`https://api.dailymotion.com/videos?search=${encodeURIComponent(qVideo)}&fields=id,title,thumbnail_360_url,duration,owner.screenname,description&limit=4`)
          .then((r) => (r.ok ? r.json() : { list: [] }))
          .then((j) =>
            (j.list || []).map((v) => ({
              id: `dm_${v.id}`,
              mediaType: 'video',
              sourcePlatform: 'Dailymotion',
              title: v.title || 'English Video',
              channel: v['owner.screenname'] || 'Dailymotion',
              duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : 'Video',
              thumbnail: v.thumbnail_360_url || '',
              embedUrl: `https://www.dailymotion.com/embed/video/${v.id}?autoplay=1`,
              url: `https://www.dailymotion.com/video/${v.id}`,
              snippet: (v.description || '').replace(/<[^>]+>/g, '').slice(0, 180)
            }))
          )
          .catch(() => [])
      );
    }

    if (source === 'all' || source === 'article') {
      tasks.push(
        fetch(`https://simple.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(qArticle)}&utf8=&format=json&srlimit=3&origin=*`)
          .then((r) => (r.ok ? r.json() : {}))
          .then(async (sj) => {
            const hits = sj?.query?.search || [];
            if (!hits.length) return [];
            const titles = hits.map((h) => h.title).join('|');
            const ej = await fetch(
              `https://simple.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=400&titles=${encodeURIComponent(titles)}&format=json&origin=*`
            )
              .then((r) => (r.ok ? r.json() : {}))
              .catch(() => ({}));
            const pages = Object.values(ej?.query?.pages || {});
            return hits.map((h) => {
              const p = pages.find((x) => x.title === h.title) || {};
              const fullText = (p.extract || h.snippet.replace(/<[^>]+>/g, '')).trim();
              return {
                id: `wiki_${h.pageid}`,
                mediaType: 'article',
                sourcePlatform: 'Simple English Web',
                title: h.title,
                channel: 'Simple English Wikipedia',
                duration: `${Math.max(1, Math.round(fullText.split(/\s+/).length / 130))} min read`,
                thumbnail: p.thumbnail?.source || '',
                url: `https://simple.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
                snippet: fullText.slice(0, 220),
                fullText
              };
            });
          })
          .catch(() => [])
      );
    }

    const settled = await Promise.allSettled(tasks);
    const buckets = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
    const items = [];
    const maxLen = Math.max(0, ...buckets.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const bucket of buckets) {
        if (bucket[i]) items.push(bucket[i]);
      }
    }
    return items;
  }

  function createFreshStandaloneBrain() {
    const b = {
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
          reasonUz: "AI Ustoz avval sizning hozirgi gapirish va fikrlash usulingizni eshitib, shaxsiy yo'l xaritasini tuzib chiqadi.",
          targetGap: 'Diagnostic & Personal Baseline',
          status: 'active',
          theoryUz: "Siz Elementary darajadan boshlayapsiz. Ingliz tilida o'zingiz haqingizda 2-3 oddiy gap yozing yoki ayting.",
          practicePrompt: 'Hello teacher! My name is ... I want to learn English because ...',
          createdByAiAt: new Date().toISOString()
        }
      ],
      personalVocab: [],
      mediaHistory: [],
      aiMemoryNotes: ["O'quvchi Elementary darajadan boshlab 3 oy ichida IELTS Band 8.0 olishni maqsad qilgan."],
      bootcamp: {
        currentChainDay: 1,
        completedChainDays: [],
        phase: 'bootcamp_7',
        brokenLinksAlert: null,
        notificationUz: "🔔 1-kun: Gap tuzishning 1-zanjirini jonli amaliyotda boshlaymiz!"
      },
      dailyChecklist: { step1_patterns: false, step2_bricks: false, step3_micro_media: false, step4_live_chat: false, completedCount: 0 },
      skillBands: { speaking: 4.0, listening: 4.0, reading: 4.0, writing: 4.0 },
      strictMode: 'auto',
      vocabSprint: { totalMasteredCount: 0, currentBatchDay: 1, highScoreCombo: 0 },
      weeklyCheckpoints: [],
      dailyBriefing: null,
      updatedAt: new Date().toISOString()
    };
    syncStandaloneBrain(b);
    return b;
  }

  function syncStandaloneBrain(b) {
    const band = Number(b.estimatedBand || 4.0);
    if (band < 4.8) b.level = "Elementary (A2 - Boshlang'ich)";
    else if (band < 5.5) b.level = "Pre-Intermediate (B1 - O'sib boruvchi)";
    else if (band < 6.5) b.level = "Intermediate (B2 - O'rta daraja)";
    else if (band < 7.5) b.level = "Upper-Intermediate (C1 - Yuqori daraja)";
    else b.level = "Advanced (C2 - IELTS Band 8.0 Daraja)";
    if (!b.dailyChecklist) b.dailyChecklist = { step1_patterns: false, step2_bricks: false, step3_micro_media: false, step4_live_chat: false, completedCount: 0 };
    if (!b.skillBands) b.skillBands = { speaking: band, listening: band, reading: band, writing: band };
    if (!b.vocabSprint) b.vocabSprint = { totalMasteredCount: 0, currentBatchDay: 1, highScoreCombo: 0 };
    if (!Array.isArray(b.weeklyCheckpoints)) b.weeklyCheckpoints = [];
    b.dailyChecklist.completedCount = ['step1_patterns', 'step2_bricks', 'step3_micro_media', 'step4_live_chat'].filter((k) => Boolean(b.dailyChecklist[k])).length;
    const day = Number(b.bootcamp?.currentChainDay || 1);
    b.bootcamp = {
      currentChainDay: day,
      completedChainDays: b.bootcamp?.completedChainDays || [],
      phase: day <= 7 ? 'bootcamp_7' : 'free_flight_8_90',
      brokenLinksAlert: b.bootcamp?.brokenLinksAlert || null,
      notificationUz: b.bootcamp?.brokenLinksAlert
        ? `🔗 Diqqat! ${b.bootcamp.brokenLinksAlert}-kun zanjiri unutildi — hozir tiklaymiz!`
        : day === 1
        ? "🔔 1-kun: Gap tuzish skeletining 1-zanjirini jonli amaliyotda boshlaymiz!"
        : day <= 7
        ? `🔔 ${day}-kun: Yangi grammatikani oldingi kunlar bilan BITTA GAPDA qo'shib gapiramiz!`
        : `🚀 ${day}-kun / 90 (IELTS 8.0 Erkin Parvoz): Sof C1/C2 lug'at va jonli tajriba!`
    };
    if (!b.dailyBriefing) {
      b.dailyBriefing = {
        generatedForDay: day,
        pushTitleUz: `🔔 ${day}-Kun Hisoboti: ${b.level.split('(')[0].trim()} (Band ${band.toFixed(1)})`,
        knowledgeDiagnosisUz: `Hozir siz ${b.level} darajasidasiz (Band ${band.toFixed(1)}). Band 8.0 ga chiqish uchun bugungi 4 ta asosiy mashqni bajaring.`,
        paceStatusUz: `90 kunlik reja: ${day}-kun / 90 • Maqsad: Band 8.0`,
        missions: [
          { id: 'step1_patterns', actionType: 'patterns', titleUz: `${day}-kun Oltin Fe'llar & Qoliplar`, detailUz: 'Darajangizga mos 6 ta asosiy qolipni mashq qiling.' },
          { id: 'step2_bricks', actionType: 'bricks', titleUz: 'Gap Kubiklari bilan 3 ta Gap Yig‘ish', detailUz: "O'zbekcha fikrni inglizcha kubiklarga yig'ing." },
          { id: 'step3_micro_media', actionType: 'media', titleUz: '1 ta Audio/Video Jumlalarini Chaynab Eshitish', detailUz: '0.8x tezlikda tinglab muhokama qiling.' },
          { id: 'step4_live_chat', actionType: 'chat', titleUz: `${day}-kun Zanjirli Jonli Suhbat`, detailUz: 'AI Ustoz bilan yozma yoki ovozli gaplashing.' }
        ]
      };
    }
    b.updatedAt = new Date().toISOString();
    safeStorageSet('ielts8_standalone_brain_v1', JSON.stringify(b));
    brain = b;
    renderAllBrainViews();
  }

  function applyStandaloneUpdates(updates) {
    if (!updates || typeof updates !== 'object') return;
    if (updates.activeFocusUz) brain.activeFocusUz = String(updates.activeFocusUz).trim();
    if (typeof updates.estimatedBandDelta === 'number' && Number.isFinite(updates.estimatedBandDelta)) {
      brain.estimatedBand = Number(Math.max(3.5, Math.min(8.5, Number(brain.estimatedBand || 4.0) + updates.estimatedBandDelta)).toFixed(1));
    }
    const ws = [];
    if (Array.isArray(updates.newWeakness)) ws.push(...updates.newWeakness);
    else if (updates.newWeakness && typeof updates.newWeakness === 'object') ws.push(updates.newWeakness);
    if (Array.isArray(updates.newWeaknesses)) ws.push(...updates.newWeaknesses);
    ws.forEach((nw) => {
      if (!nw?.area) return;
      const ex = (brain.weaknesses || []).find((w) => w.area.toLowerCase() === String(nw.area).toLowerCase());
      if (!ex) {
        brain.weaknesses.unshift({ id: `weak_${Date.now()}`, area: nw.area, detailUz: nw.detailUz || '', targetSkill: nw.targetSkill || 'Speaking', status: 'active' });
        brain.weaknesses = brain.weaknesses.slice(0, 15);
      } else if (nw.detailUz) ex.detailUz = nw.detailUz;
    });
    if (updates.newStrength && !brain.strengths.includes(updates.newStrength)) brain.strengths.unshift(updates.newStrength);
    if (updates.newInterest && !brain.interests.includes(updates.newInterest)) brain.interests.unshift(updates.newInterest);
    if (Array.isArray(updates.newVocab)) {
      updates.newVocab.forEach((v) => {
        if (!v?.band8) return;
        if (!brain.personalVocab.some((x) => x.band8.toLowerCase() === String(v.band8).toLowerCase())) {
          brain.personalVocab.unshift({ id: `voc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, elementary: v.elementary || '', band8: v.band8, uzbek: v.uzbek || '', example: v.example || '', reasonUz: v.reasonUz || 'Standalone AI', mastered: false });
        }
      });
      brain.personalVocab = brain.personalVocab.slice(0, 120);
    }
    if (updates.memoryNoteUz) {
      brain.aiMemoryNotes.unshift(updates.memoryNoteUz);
      brain.aiMemoryNotes = brain.aiMemoryNotes.slice(0, 15);
    }
    syncStandaloneBrain(brain);
  }

  let pcReachableHint = true;

  async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (ui.customApiKey && ui.customApiKey.trim().length > 10) {
      headers['x-api-key'] = ui.customApiKey.trim();
    }
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const isCapacitorNative = Boolean(window.Capacitor?.isNativePlatform?.());
    if (isCapacitorNative && url.startsWith('/api/')) {
      return await standaloneApiFallback(url, options);
    }
    const isEmbeddedOffline = window.location.protocol === 'data:' || window.location.protocol === 'file:';
    const targetUrl = isEmbeddedOffline && url.startsWith('/api/')
      ? `http://${serverConfig.lanIp || '192.168.0.103'}:${serverConfig.port || '3000'}${url}`
      : url;

    if (isEmbeddedOffline && !pcReachableHint && url.startsWith('/api/')) {
      return await standaloneApiFallback(url, options);
    }

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = ctrl && isEmbeddedOffline ? setTimeout(() => ctrl.abort(), 1500) : null;

    try {
      const resp = await fetch(targetUrl, { ...options, headers, ...(ctrl ? { signal: ctrl.signal } : {}) });
      if (tid) clearTimeout(tid);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      if (data.modelUsed) updateModelBadge(data.modelUsed);
      if (data.brain) {
        brain = data.brain;
        safeStorageSet('ielts8_standalone_brain_v1', JSON.stringify(brain));
        renderAllBrainViews();
      }
      return data;
    } catch (err) {
      if (tid) clearTimeout(tid);
      if (isEmbeddedOffline) pcReachableHint = false;
      const noBackend = err instanceof TypeError || err?.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed|abort|HTTP 404|HTTP 405|Unexpected token/i.test(err.message || '');
      if (!noBackend && !isEmbeddedOffline) throw err;
      return await standaloneApiFallback(url, options);
    }
  }

  async function standaloneApiFallback(url, options) {
    try {
      const saved = safeStorageGet('ielts8_standalone_brain_v1');
      if (saved) brain = { ...createFreshStandaloneBrain(), ...JSON.parse(saved) };
      else brain = createFreshStandaloneBrain();
    } catch (_) {
      brain = createFreshStandaloneBrain();
    }
    chainSkeleton = DEFAULT_CHAIN_SKELETON;
    const body = options.body ? JSON.parse(options.body) : {};
    const path = url.split('?')[0];
    const queryStr = url.includes('?') ? url.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);

    if (path === '/api/config') {
      return { primaryModel: 'gemini-4-hydrogen', modelChain: DIRECT_MODELS, lanIp: '192.168.0.103', port: '3000', standaloneMode: true };
    }
    if (path === '/api/brain') {
      syncStandaloneBrain(brain);
      return { brain, chainSkeleton: DEFAULT_CHAIN_SKELETON };
    }
    if (path === '/api/brain/reset') {
      brain = createFreshStandaloneBrain();
      return { brain };
    }
    if (path === '/api/brain/strict-mode') {
      if (['auto', 'assisted', 'semi_strict', 'exam_strict'].includes(body.strictMode)) brain.strictMode = body.strictMode;
      syncStandaloneBrain(brain);
      return { brain };
    }
    if (path === '/api/brain/checklist-toggle') {
      const k = body.key;
      if (['step1_patterns', 'step2_bricks', 'step3_micro_media', 'step4_live_chat'].includes(k)) {
        brain.dailyChecklist[k] = typeof body.value === 'boolean' ? body.value : !brain.dailyChecklist[k];
        syncStandaloneBrain(brain);
      }
      return { brain };
    }
    if (path === '/api/brain/step-complete') {
      const s = (brain.dynamicRoadmap || []).find((x) => x.id === body.stepId);
      if (s) s.status = 'completed';
      syncStandaloneBrain(brain);
      return { brain };
    }
    if (path === '/api/brain/vocab-master') {
      const v = (brain.personalVocab || []).find((x) => x.id === body.id);
      if (v) v.mastered = Boolean(body.mastered);
      syncStandaloneBrain(brain);
      return { brain };
    }
    if (path === '/api/tts') {
      const tts = await directGeminiTts(body.text, body.voiceName || ui.voiceName || 'Kore');
      return tts;
    }
    if (path === '/api/media/search') {
      const items = await directInternetMediaSearch(params.get('q') || 'BBC Learning English', params.get('source') || 'all');
      return { query: params.get('q'), items };
    }
    if (path === '/api/brain/recommend-media') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Student Level: ${brain.level} (Band ${brain.estimatedBand}), Weaknesses: ${JSON.stringify(brain.weaknesses.slice(0, 4))}. Request: "${body.customRequestUz || ''}". Return JSON: { "aiReasoningUz": "...", "queries": { "audioQuery": "2-3 keywords", "videoQuery": "2-3 keywords", "articleQuery": "2 keywords" }, "whyAudioUz": "...", "whyVideoUz": "...", "whyArticleUz": "..." }`
      );
      const items = await directInternetMediaSearch(parsed.queries?.videoQuery || 'English learning', body.mediaFilter || 'all', parsed.queries);
      updateModelBadge(modelUsed);
      return { ...parsed, items, modelUsed };
    }
    if (path === '/api/media/analyze') {
      const item = body.item || {};
      const { parsed, modelUsed } = await directGeminiJson(
        `Analyze internet ${item.mediaType || 'media'} "${item.title}" (${item.fullText || item.snippet || ''}) for student ${brain.level} (Band ${brain.estimatedBand}). Return JSON: { "whyForYouUz": "...", "summaryUz": "...", "summaryEn": "...", "sentenceBreakdown": [{"english":"...","wordByWordUz":"...","band8Upgrade":"...","tipUz":"..."}], "keyPhrases": [{"elementary":"...","band8":"...","uzbek":"...","example":"..."}], "discussionQuestions": ["...","...","..."] }`
      );
      brain.dailyChecklist.step3_micro_media = true;
      syncStandaloneBrain(brain);
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/chat') {
      const day = Number(brain.bootcamp?.currentChainDay || 1);
      const strictStage = brain.strictMode && brain.strictMode !== 'auto' ? brain.strictMode : day <= 14 ? 'assisted' : day <= 45 ? 'semi_strict' : 'exam_strict';
      const msgs = (body.messages || []).slice(-12).map((m) => ({
        role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.text || m.content || '') }]
      }));
      if (!msgs.length) msgs.push({ role: 'user', parts: [{ text: 'Hello teacher! Start our lesson.' }] });
      const sys = `You are Gemini 4 Hydrogen, autonomous cognitive IELTS Teacher for Uzbek student (${brain.level}, Band ${brain.estimatedBand}, Day ${day}/90, StrictMode=${strictStage}). ${
        strictStage === 'exam_strict'
          ? '100% English ONLY! Set uzbekHint="" and nextReplyBricks=[].'
          : 'Adapt to student level, allow mixed Uzbek/English, provide helpful uzbekHint and 6 nextReplyBricks.'
      } Return JSON: { "thoughtUz":"...", "reply":"...", "uzbekHint":"...", "nextReplyBricks":[...], "chainCheck":{"passedSnowball":true,"brokenLinkDay":null,"noteUz":""}, "correction":{"original":"...","corrected":"...","band8Upgrade":"...","explanationUz":"..."} or null, "interactiveWidget":null, "examEvaluation":null, "brainUpdates":null }.`;
      const { parsed, modelUsed } = await directGeminiJson('', sys, { contents: msgs, temperature: 0.72 });
      if (parsed.brainUpdates) applyStandaloneUpdates(parsed.brainUpdates);
      brain.dailyChecklist.step4_live_chat = true;
      syncStandaloneBrain(brain);
      updateModelBadge(modelUsed);
      return { ...parsed, recommendedMedia: [], brain, modelUsed };
    }
    if (path === '/api/bootcamp/lesson') {
      const reqDay = Math.max(1, Math.min(90, Number(body.day || brain.bootcamp?.currentChainDay || 1)));
      const def = DEFAULT_CHAIN_SKELETON[Math.min(6, reqDay - 1)];
      const { parsed, modelUsed } = await directGeminiJson(
        `Create Day ${reqDay}/90 Snowball Grammar & Live Practice experience (${reqDay <= 7 ? def.titleUz + ': ' + def.grammarBlock : 'C1/C2 Free Flight'}). Return JSON: { "day":${reqDay}, "phase":"${reqDay <= 7 ? 'bootcamp_7' : 'free_flight_8_90'}", "titleUz":"...", "notificationBannerUz":"...", "shortFormulaUz":"...", "snowballBridge":{"oldPart":"...","newPart":"...","combinedEnglish":"...","combinedUzbek":"...","explanationUz":"..."}, "liveVocabulary":[{"uzbek":"...","elementary":"...","band8":"...","chainExample":"..."}], "uzbekToEnglishBuilder":{"uzbekThought":"...","hintBlocks":["..."],"modelCombinedEnglish":"...","band8Version":"..."}, "livePracticePrompt":"...", "mediaQuery":"..." }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, modelUsed };
    }
    if (path === '/api/bootcamp/check-builder') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Evaluate Uzbek->English snowball sentence for Day ${body.day || 1}. Thought: "${body.uzbekThought}". Attempt: "${body.studentEnglish}". Return JSON: { "passed":true, "usedLinks":["1-kun"], "missingLinks":[], "correctedCombined":"...", "band8Combined":"...", "feedbackUz":"..." }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/bootcamp/advance') {
      const cd = Number(body.completedDay || brain.bootcamp.currentChainDay || 1);
      if (!brain.bootcamp.completedChainDays.includes(cd)) brain.bootcamp.completedChainDays.push(cd);
      if (cd >= brain.bootcamp.currentChainDay && brain.bootcamp.currentChainDay < 90) brain.bootcamp.currentChainDay = cd + 1;
      brain.estimatedBand = Number(Math.min(8.5, 4.0 + brain.bootcamp.completedChainDays.length * 0.2).toFixed(1));
      brain.dailyChecklist = { step1_patterns: false, step2_bricks: false, step3_micro_media: false, step4_live_chat: false, completedCount: 0 };
      syncStandaloneBrain(brain);
      return { brain };
    }
    if (path === '/api/brick-helper') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Convert mixed Uzbek/English "${body.rawInput}" for ${brain.level} into Word Bricks JSON: { "currentLevelLabel":"${brain.level}", "currentLevelEnglish":"...", "band8English":"...", "orderedBricks":["..."], "shuffledBricks":["..."], "uzbekExplanation":"..." }`
      );
      brain.dailyChecklist.step2_bricks = true;
      syncStandaloneBrain(brain);
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/word/lookup') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Explain English word "${body.word}" in context "${body.contextSentence || ''}" for Uzbek learner. Return JSON: { "word":"${body.word}", "ipa":"", "partOfSpeech":"word", "uzbekMeaning":"...", "tiers":{"elementaryA2":"...","intermediateB2":"...","band8C1":"..."}, "example":"..." }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, modelUsed };
    }
    if (path === '/api/brain/golden-patterns') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Create 6 Level-Adaptive Golden Patterns + 3 MCQ drills for ${brain.level} (Band ${brain.estimatedBand}). Return JSON: { "tierTitleUz":"...", "whyThisTierUz":"...", "patterns":[{"pattern":"...","uzbek":"...","formulaUz":"...","example":"...","band8Upgrade":"..."}], "drills":[{"question":"...","options":["A","B","C"],"correctIndex":0,"explanationUz":"..."}] }`
      );
      brain.dailyChecklist.step1_patterns = true;
      syncStandaloneBrain(brain);
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/brain/daily-briefing') {
      const day = Number(brain.bootcamp?.currentChainDay || 1);
      const { parsed, modelUsed } = await directGeminiJson(
        `Create proactive Uzbek Daily Briefing for Day ${day}/90, ${brain.level}, Band ${brain.estimatedBand}, weaknesses: ${JSON.stringify(brain.weaknesses.slice(0, 4))}. Return JSON: { "generatedForDay":${day}, "pushTitleUz":"...", "knowledgeDiagnosisUz":"...", "paceStatusUz":"...", "missions":[{"id":"step1_patterns","actionType":"patterns","titleUz":"...","detailUz":"..."},{"id":"step2_bricks","actionType":"bricks","titleUz":"...","detailUz":"..."},{"id":"step3_micro_media","actionType":"media","titleUz":"...","detailUz":"..."},{"id":"step4_live_chat","actionType":"chat","titleUz":"...","detailUz":"..."}] }`
      );
      brain.dailyBriefing = parsed;
      syncStandaloneBrain(brain);
      updateModelBadge(modelUsed);
      return { briefing: parsed, brain, modelUsed };
    }
    if (path === '/api/exam/reading-listening') {
      const skill = body.skill === 'listening' ? 'listening' : 'reading';
      const { parsed, modelUsed } = await directGeminiJson(
        `Create 10-question IELTS Academic ${skill} test on "${body.topic || 'Urbanization'}" (3 tfng, 2 matching Paragraph A-D, 3 gapfill NO MORE THAN TWO WORDS with acceptableAnswers, 2 mcq) + 5 synonymTraps. Return JSON: { "skill":"${skill}", "title":"...", "passageOrScript":"...", "questions":[{"id":1,"type":"tfng","prompt":"...","options":["True","False","Not Given"],"correctIndex":0,"acceptableAnswers":[],"explanationUz":"..."}], "synonymTraps":[{"passageWord":"...","questionParaphrase":"...","uzbek":"..."}] }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, modelUsed };
    }
    if (path === '/api/vocab/sprint') {
      const batch = Number(brain.vocabSprint?.currentBatchDay || 1);
      const { parsed, modelUsed } = await directGeminiJson(
        `Generate 30 high-value IELTS Academic words + synonymTrap + Uzbek + 3 distractorsUz on "${body.theme || 'Academic Core'}" (Batch #${batch}). Return JSON: { "batchNumber":${batch}, "themeUz":"...", "words":[{"word":"...","synonymTrap":"...","uzbek":"...","distractorsUz":["a","b","c"]}] }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, modelUsed };
    }
    if (path === '/api/vocab/sprint-complete') {
      brain.vocabSprint.totalMasteredCount = Number(brain.vocabSprint.totalMasteredCount || 0) + Number(body.learnedCount || 30);
      brain.vocabSprint.currentBatchDay = Number(brain.vocabSprint.currentBatchDay || 1) + 1;
      brain.skillBands.reading = Number(Math.min(8.5, brain.skillBands.reading + 0.1).toFixed(1));
      brain.skillBands.listening = Number(Math.min(8.5, brain.skillBands.listening + 0.1).toFixed(1));
      syncStandaloneBrain(brain);
      return { brain };
    }
    if (path === '/api/exam/weekly-checkpoint') {
      if (body.action === 'submit') {
        const { parsed, modelUsed } = await directGeminiJson(
          `Strictly grade Weekly IELTS Checkpoint: Writing="${body.answers?.writing || ''}", Speaking="${body.answers?.speaking || ''}". Return JSON: { "listening":5.5,"reading":6.0,"writing":5.0,"speaking":5.0,"overall":5.5,"verdictUz":"...","improvementsUz":["..."] }`
        );
        const rec = { week: (brain.weeklyCheckpoints || []).length + 1, date: new Date().toISOString().slice(0, 10), ...parsed };
        brain.weeklyCheckpoints.unshift(rec);
        brain.estimatedBand = Number(parsed.overall || brain.estimatedBand);
        syncStandaloneBrain(brain);
        updateModelBadge(modelUsed);
        return { result: rec, brain, modelUsed };
      }
      const { parsed, modelUsed } = await directGeminiJson(
        `Create Weekly Strict IELTS Checkpoint Exam (zero hints). Return JSON: { "week":${(brain.weeklyCheckpoints || []).length + 1}, "listeningScript":"...", "listeningQuestions":[{"prompt":"...","options":["A","B","C"],"correctIndex":0},{"prompt":"...","options":["A","B","C"],"correctIndex":1}], "readingPassage":"...", "readingQuestions":[{"prompt":"...","options":["True","False","Not Given"],"correctIndex":0},{"prompt":"...","options":["True","False","Not Given"],"correctIndex":2}], "writingPrompt":"...", "speakingPrompt":"..." }`
      );
      updateModelBadge(modelUsed);
      return { exam: parsed, modelUsed };
    }
    if (path === '/api/brain/generate-step') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Create personalized AI step lesson for ${brain.level} (${body.focusRequestUz || brain.activeFocusUz}). Return JSON: { "step":{"titleUz":"...","reasonUz":"...","targetGap":"...","theoryUz":"...","practicePrompt":"..."}, "quiz":[{"question":"...","options":["A","B","C"],"correctIndex":0,"explanationUz":"..."}], "vocab":[{"elementary":"...","band8":"...","uzbek":"...","example":"...","reasonUz":"..."}], "mediaSearchQuery":"..." }`
      );
      const stepObj = { id: `step_${Date.now()}`, status: 'active', createdByAiAt: new Date().toISOString(), quiz: parsed.quiz || [], ...parsed.step };
      brain.dynamicRoadmap.push(stepObj);
      applyStandaloneUpdates({ newVocab: parsed.vocab || [] });
      updateModelBadge(modelUsed);
      return { step: stepObj, quiz: parsed.quiz || [], vocab: parsed.vocab || [], mediaItems: [], brain, modelUsed };
    }
    if (path === '/api/brain/vocab-generate') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Generate 6 Band 8 vocab cards for "${body.topic || brain.activeFocusUz}". Return JSON: { "words":[{"elementary":"...","band8":"...","uzbek":"...","example":"...","reasonUz":"..."}] }`
      );
      applyStandaloneUpdates({ newVocab: parsed.words || [] });
      updateModelBadge(modelUsed);
      return { added: (parsed.words || []).length, brain, modelUsed };
    }
    if (path === '/api/writing-eval') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Grade IELTS Writing for ${brain.level}. Prompt: "${body.prompt || ''}". Essay: "${body.essay}". Return JSON: { "overallBand":5.5, "criteria":{"taskResponse":5.5,"coherenceCohesion":5.5,"lexicalResource":5.0,"grammar":5.0}, "feedbackUz":"...", "corrections":[{"mistake":"...","fix":"...","whyUz":"..."}], "band8Rewrite":"...", "detectedWeakness":{"area":"...","detailUz":"...","targetSkill":"Writing"} }`
      );
      if (parsed.detectedWeakness) applyStandaloneUpdates({ newWeakness: parsed.detectedWeakness });
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/shadowing/generate') {
      const { parsed, modelUsed } = await directGeminiJson(
        `Create 3 progressive Shadowing sentences (${brain.level} -> Band 8) on "${body.customFocus || 'Fluency'}". Return JSON: { "focusTitleUz":"...", "sentences":[{"levelLabel":"1. Oson","sentence":"...","stressGuide":"...","ipa":"...","uzbek":"...","tipUz":"..."}] }`
      );
      updateModelBadge(modelUsed);
      return { ...parsed, modelUsed };
    }
    if (path === '/api/audio/xray') {
      const { parsed, modelUsed } = await directGeminiJson('', 'Evaluate pronunciation of this audio for IELTS student.', {
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Analyze pronunciation (${body.targetSentence || 'free speech'}). Return JSON: { "transcript":"...", "pronunciationScore":75, "estimatedPronunciationBand":6.0, "rhythmAndIntonationUz":"...", "problemWords":[{"word":"...","issueUz":"...","ipa":"..."}], "band8Upgrade":"...", "detectedWeakness":null }` },
              { inlineData: { mimeType: String(body.mimeType || 'audio/webm').split(';')[0], data: body.audioBase64 } }
            ]
          }
        ]
      });
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/vision/analyze') {
      const { parsed, modelUsed } = await directGeminiJson('', 'Analyze student photo/handwriting for IELTS coaching.', {
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Mode: ${body.visionMode}. Note: ${body.userNote || ''}. Return JSON: { "extractedTextOrScene":"...", "overallBand":5.5, "feedbackUz":"...", "band8Version":"...", "vocabFromImage":[{"elementary":"...","band8":"...","uzbek":"...","example":"..."}], "speakingQuestion":"...", "detectedWeakness":null }` },
              { inlineData: { mimeType: String(body.mimeType || 'image/jpeg').split(';')[0], data: body.imageBase64 } }
            ]
          }
        ]
      });
      updateModelBadge(modelUsed);
      return { ...parsed, brain, modelUsed };
    }
    if (path === '/api/visual/generate') {
      if (body.visualType === 'task1_chart') {
        const { parsed, modelUsed } = await directGeminiJson(
          `Generate IELTS Task 1 bar/line chart data JSON: { "chartTitle":"...", "chartType":"bar", "unit":"%", "categories":["2010","2015","2020","2025"], "series":[{"name":"A","color":"#0A84FF","values":[20,35,55,70]},{"name":"B","color":"#30D158","values":[60,50,40,30]}], "promptText":"...", "band8OverviewTipUz":"...", "keyVocab":["surge","decline"] }`
        );
        updateModelBadge(modelUsed);
        return { visualType: 'task1_chart', ...parsed, modelUsed };
      }
      const { parsed, modelUsed } = await directGeminiJson(
        `Create visual mnemonic SVG (viewBox="0 0 320 170", dark bg #0e172b) for "${body.wordObj?.band8 || 'Fluency'}". Return JSON: { "memoryAssociationUz":"...", "svgCode":"<svg viewBox='0 0 320 170' xmlns='http://www.w3.org/2000/svg'>...</svg>" }`
      );
      updateModelBadge(modelUsed);
      return { visualType: 'mnemonic', ...parsed, modelUsed };
    }
    throw new Error('Standalone endpoint topilmadi: ' + path);
  }

  function updateModelBadge(modelName) {
    const badge = $('modelBadge');
    if (!badge) return;
    badge.textContent =
      modelName === 'gemini-4-hydrogen' ? '⚡ Gemini 4 Hydrogen' : `⚡ ${modelName} (Zaxira)`;
  }

  // ==================== AUDIO & SPEECH ====================
  function stopAllAudio() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function speakWithWebSpeech(text, rate = 1.0) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#]/g, '').trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'en-US';
    utter.rate = rate;
    const voices = window.speechSynthesis.getVoices();
    const pref =
      voices.find((v) => /Samantha|Daniel|Karen|Google UK English|Google US English/i.test(v.name)) ||
      voices.find((v) => v.lang && v.lang.startsWith('en'));
    if (pref) utter.voice = pref;
    window.speechSynthesis.speak(utter);
  }

  async function speakText(text, rate = 1.0) {
    const clean = String(text || '').replace(/[*_`#]/g, '').trim();
    if (!clean) return;
    stopAllAudio();

    if (rate !== 1.0 || clean.length > 850) {
      speakWithWebSpeech(clean, rate);
      return;
    }

    try {
      const data = await apiFetch('/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: clean.slice(0, 750), voiceName: ui.voiceName || 'Kore' })
      });
      if (data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudio = audio;
        await audio.play();
        return;
      }
    } catch (_) {}
    speakWithWebSpeech(clean, rate);
  }

  let micFallbackRecorder = null;
  let isMicFallbackRecording = false;

  async function toggleSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = $('btnMic');
    const input = $('chatInput');

    if (!SR) {
      if (isMicFallbackRecording && micFallbackRecorder) {
        micFallbackRecorder.stop();
        return;
      }
      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const chunks = [];
          micFallbackRecorder = new MediaRecorder(stream);
          micFallbackRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          micFallbackRecorder.onstop = async () => {
            isMicFallbackRecording = false;
            micBtn.classList.remove('recording');
            stream.getTracks().forEach((t) => t.stop());
            const mime = micFallbackRecorder.mimeType || 'audio/mp4';
            const blob = new Blob(chunks, { type: mime });
            showToast('🎙️ Ovoz matnga aylantirilmoqda...');
            try {
              const audioBase64 = await blobToBase64(blob);
              const xray = await apiFetch('/api/audio/xray', {
                method: 'POST',
                body: JSON.stringify({ audioBase64, mimeType: mime, mode: 'chat_voice' })
              });
              if (xray.transcript) {
                input.value = (input.value ? input.value.trim() + ' ' : '') + xray.transcript;
                autoResizeInput();
                updateLengthGateDisplay();
              }
            } catch (err) {
              showToast('Ovoz xatosi: ' + err.message);
            }
          };
          isMicFallbackRecording = true;
          micBtn.classList.add('recording');
          micFallbackRecorder.start();
          showToast('🎙️ Gapiring! Tugagach yana 🎙️ bosing.');
          return;
        } catch (_) {}
      }
      input.focus();
      showToast(`🎙️ iPhone klaviaturadagi 🎙️ tugmasini bosing (yoki https://${serverConfig.lanIp || '192.168.0.103'}:3443 da oching)`);
      return;
    }
    if (isRecording && recognition) {
      recognition.stop();
      return;
    }
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;

    const baseText = input.value ? input.value.trim() + ' ' : '';

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      showToast('🎙️ Inglizcha gapiring...');
    };
    recognition.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      input.value = baseText + transcript;
      autoResizeInput();
    };
    recognition.onerror = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    };
    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    };
    recognition.start();
  }

  // ==================== NAVIGATION ====================
  const TAB_TITLES = {
    tutor: ['Jonli AI Ustoz', 'Gemini 4 Hydrogen • Shaxsiy Ong'],
    media: ['Media & Audio', 'Internet Podkastlar, Video & Maqolalar'],
    brain: ['AI Xotirasi', 'Kamchiliklaringiz & Dinamik Yo‘lingiz'],
    lab: ['Mashqxona', 'Shaxsiy Band 8 Lug‘at & Writing Tahlil']
  };

  function switchTab(tabId) {
    ui.activeTab = tabId;
    saveUi();

    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    $(`tab-${tabId}`)?.classList.add('active');

    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });

    const [t, s] = TAB_TITLES[tabId] || TAB_TITLES.tutor;
    $('headerTitle').textContent = t;
    $('headerSubtitle').textContent = s;
  }

  // ==================== BRAIN VIEWS (TUTOR HEADER & AI MEMORY TAB) ====================
  function renderAllBrainViews() {
    const bandStr = Number(brain.estimatedBand || 4.0).toFixed(1);
    const wCount = (brain.weaknesses || []).length;
    const rCount = (brain.dynamicRoadmap || []).length;

    // Tutor top status card
    $('brainFocusSummary').textContent = brain.activeFocusUz || 'Muloqot orqali darajangiz aniqlanmoqda...';
    $('tutorBandPill').textContent = bandStr;
    $('brainWeaknessCount').textContent = `🔍 ${wCount} ta kamchilik`;
    $('brainRoadmapCount').textContent = `🗺️ ${rCount} ta shaxsiy dars`;

    // AI Memory Tab
    $('memLevelTitle').textContent = `${brain.level || 'Elementary'} → 8.0`;
    $('memFocusText').textContent = brain.activeFocusUz || '';
    $('memBandScore').textContent = bandStr;
    $('memWeakLen').textContent = `${wCount} ta`;
    $('memRoadmapLen').textContent = `${rCount} ta`;

    const wEl = $('weaknessesList');
    if (wCount === 0) {
      wEl.innerHTML = `<div class="card-block"><p class="hint-text" style="margin:0;">Hali kamchiliklar qayd etilmadi. Jonli Ustoz bilan inglizcha gaplashing yoki Writing bo'limida matn yozing — Gemini 4 Hydrogen har bir kamchiligingizni avtomatik aniqlab shu yerga qo'shadi.</p></div>`;
    } else {
      wEl.innerHTML = brain.weaknesses
        .map(
          (w, idx) => `
        <div class="weakness-card">
          <div class="row-between">
            <strong style="font-size:13.5px; color:#ffb340;">⚠️ ${escapeHtml(w.area)}</strong>
            <span class="badge-mini">${escapeHtml(w.targetSkill || 'Speaking')}</span>
          </div>
          <p style="margin:0; font-size:12.5px; color:#dbe5ff;">${escapeHtml(w.detailUz)}</p>
          <button class="ios-btn secondary compact" data-fixweak="${idx}" type="button">
            ⚡ Shu kamchilik ustida ishlash (Dars + Media)
          </button>
        </div>
      `
        )
        .join('');
      wEl.querySelectorAll('[data-fixweak]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const w = brain.weaknesses[Number(btn.dataset.fixweak)];
          if (w) {
            openDynamicStepModal(
              null,
              `Mening "${w.area}" (${w.detailUz}) kamchiligimni tuzatish uchun maxsus shaxsiy dars, mashq va internetdan mos audio/video topib bering.`
            );
          }
        });
      });
    }

    const rEl = $('dynamicRoadmapList');
    rEl.innerHTML = (brain.dynamicRoadmap || [])
      .map(
        (step, idx) => `
      <div class="day-card ${step.status === 'completed' ? 'completed' : 'current'}" data-stepid="${escapeHtml(step.id)}">
        <div class="day-badge">${step.status === 'completed' ? '✓' : idx + 1}</div>
        <div class="day-info">
          <strong>${escapeHtml(step.titleUz)}</strong>
          <small>${escapeHtml(step.reasonUz || step.targetGap)}</small>
        </div>
        <span class="day-band-tag">${step.status === 'completed' ? 'Tayyor' : 'O‘qish'}</span>
      </div>
    `
      )
      .join('');
    rEl.querySelectorAll('.day-card').forEach((c) => {
      c.addEventListener('click', () => openDynamicStepModal(c.dataset.stepid, null));
    });

    const notesEl = $('aiNotesList');
    notesEl.innerHTML = (brain.aiMemoryNotes || [])
      .map((n) => `<li>${escapeHtml(n)}</li>`)
      .join('');

    renderBootcampCard();
    applyStrictModeUi();
    updateLengthGateDisplay();
    if ($('sprintTotalWords')) $('sprintTotalWords').textContent = brain.vocabSprint?.totalMasteredCount || 0;
    if ($('sprintComboBadge')) $('sprintComboBadge').textContent = `Rekord: ${brain.vocabSprint?.highScoreCombo || 0}`;
    renderPersonalVocab();
  }

  // ==================== STRICT MODE, LENGTH GATE, R&L 8.5 SIMULATOR, 30-WORD SPRINT & WEEKLY CHECKPOINT ====================
  function getEffectiveStrictStage() {
    const pref = brain.strictMode || 'auto';
    if (['assisted', 'semi_strict', 'exam_strict'].includes(pref)) return pref;
    const day = Number(brain.bootcamp?.currentChainDay || 1);
    if (day <= 14) return 'assisted';
    if (day <= 45) return 'semi_strict';
    return 'exam_strict';
  }

  function applyStrictModeUi() {
    const pref = brain.strictMode || 'auto';
    const stage = getEffectiveStrictStage();
    document.querySelectorAll('#strictModeBar [data-strict]').forEach((b) => {
      b.classList.toggle('active', b.dataset.strict === pref);
    });
    const ind = $('strictStageIndicator');
    if (ind) {
      ind.textContent =
        stage === 'exam_strict'
          ? '🔴 Exam Mode'
          : stage === 'semi_strict'
          ? '🟡 Bosqich 2'
          : '🟢 Bosqich 1 (1–14k)';
    }
    const bricksBar = $('replyBricksBar');
    if (bricksBar) {
      bricksBar.classList.toggle('hidden', stage === 'exam_strict');
    }
  }

  function getMinRequiredWords() {
    const stage = getEffectiveStrictStage();
    if (stage === 'exam_strict') return 22;
    if (stage === 'semi_strict') return 14;
    return 8;
  }

  function updateLengthGateDisplay() {
    const inp = $('chatInput');
    const bar = $('lengthGateBar');
    const txt = $('lengthGateText');
    if (!inp || !bar || !txt) return;
    const words = inp.value.trim().split(/\s+/).filter(Boolean).length;
    const minW = getMinRequiredWords();
    const ok = words >= minW;
    txt.textContent = ok
      ? `✅ ${words}/${minW} so‘z — Yetarli!`
      : `📏 ${words}/${minW} so‘z • Sabab + Misol`;
    bar.classList.toggle('ok', ok);
  }

  let lengthGateOverrideOnce = '';

  let rlCurrentSkill = 'reading';
  let rlCurrentTest = null;
  let rlTimerSec = 0;
  let rlTimerInt = null;

  function ieltsRaw40ToBand(raw40) {
    if (raw40 >= 39) return 9.0;
    if (raw40 >= 37) return 8.5;
    if (raw40 >= 35) return 8.0;
    if (raw40 >= 32) return 7.5;
    if (raw40 >= 30) return 7.0;
    if (raw40 >= 26) return 6.5;
    if (raw40 >= 23) return 6.0;
    if (raw40 >= 18) return 5.5;
    if (raw40 >= 15) return 5.0;
    return 4.5;
  }

  async function generateRlExam() {
    const btn = $('btnGenRlExam');
    btn.disabled = true;
    btn.textContent = '⏳...';
    const box = $('rlExamContainer');
    box.classList.remove('hidden');
    box.innerHTML = '⏳ Rasmiy IELTS 8.5 Reading/Listening testi (T/F/NG, Matching, Gap-Fill, MCQ) tuzilmoqda...';

    try {
      const topic = $('rlTopicInput').value.trim() || 'Urbanization & Climate';
      const data = await apiFetch('/api/exam/reading-listening', {
        method: 'POST',
        body: JSON.stringify({ skill: rlCurrentSkill, topic })
      });
      rlCurrentTest = data;
      clearInterval(rlTimerInt);
      rlTimerSec = 0;
      rlTimerInt = setInterval(() => {
        rlTimerSec++;
        $('rlTimerText').textContent = `⏱️ ${String(Math.floor(rlTimerSec / 60)).padStart(2, '0')}:${String(rlTimerSec % 60).padStart(2, '0')}`;
      }, 1000);

      $('rlAudioControlBar').classList.toggle('hidden', rlCurrentSkill !== 'listening');

      const qHtml = (data.questions || [])
        .map((q, qi) => {
          const typeLabel =
            q.type === 'tfng'
              ? 'True / False / Not Given'
              : q.type === 'matching'
              ? 'Matching Headings'
              : q.type === 'gapfill'
              ? 'Gap-Fill (NO MORE THAN 2 WORDS)'
              : 'Multiple Choice';
          if (q.type === 'gapfill') {
            return `
              <div class="card-block" style="margin-top:8px;">
                <span class="badge-mini">Q${qi + 1} • ${typeLabel}</span>
                <p style="font-size:13px; margin:6px 0;">${escapeHtml(q.prompt)}</p>
                <input type="text" class="gap-fill-input" data-rlgap="${qi}" placeholder="Javobni yozing (1-2 so'z)..." />
                <div class="hint-text hidden" id="rlExp-${qi}" style="margin-top:5px;"></div>
              </div>`;
          }
          return `
            <div class="card-block" style="margin-top:8px;">
              <span class="badge-mini">Q${qi + 1} • ${typeLabel}</span>
              <p style="font-size:13px; margin:6px 0;">${escapeHtml(q.prompt)}</p>
              ${(q.options || [])
                .map(
                  (opt, oi) =>
                    `<button class="quiz-option" data-rlqi="${qi}" data-rloi="${oi}" type="button">${escapeHtml(opt)}</button>`
                )
                .join('')}
              <div class="hint-text hidden" id="rlExp-${qi}" style="margin-top:5px;"></div>
            </div>`;
        })
        .join('');

      const trapHtml = (data.synonymTraps || [])
        .map(
          (t) =>
            `<div class="sprint-word-row"><div><strong>${escapeHtml(t.passageWord)}</strong> ↔ <span style="color:#67e888;">${escapeHtml(t.questionParaphrase)}</span></div><small class="hint-text">${escapeHtml(t.uzbek)}</small></div>`
        )
        .join('');

      box.innerHTML = `
        <h3 style="margin:0 0 8px;">${escapeHtml(data.title)}</h3>
        ${
          rlCurrentSkill === 'reading'
            ? `<div style="font-size:12.5px; line-height:1.55; white-space:pre-line; background:rgba(255,255,255,0.04); padding:10px; border-radius:12px; max-height:240px; overflow-y:auto;">${escapeHtml(data.passageOrScript)}</div>`
            : `<details style="margin-bottom:8px;"><summary class="hint-text" style="cursor:pointer;">📜 Tinglab bo‘lgach Audio Matnini (Transcript) ko‘rish</summary><div style="font-size:12px; margin-top:6px; white-space:pre-line;">${escapeHtml(data.passageOrScript)}</div></details>`
        }
        ${qHtml}
        <button id="btnGradeRlExam" class="ios-btn success full" style="margin-top:10px;" type="button">📊 40-Ballik IELTS Band Tekshirish</button>
        <div id="rlResultSummary" class="card-block hidden" style="margin-top:10px;"></div>
        ${trapHtml ? `<div style="margin-top:12px;"><strong style="font-size:13px;">🔑 Imtihondagi Sinonim Tuzoqlari (Paraphrase):</strong>${trapHtml}</div>` : ''}
      `;

      const selectedIdx = new Array((data.questions || []).length).fill(-1);
      box.querySelectorAll('[data-rlqi]').forEach((b) => {
        b.addEventListener('click', () => {
          const qi = Number(b.dataset.rlqi);
          const oi = Number(b.dataset.rloi);
          selectedIdx[qi] = oi;
          box.querySelectorAll(`[data-rlqi="${qi}"]`).forEach((x) => x.classList.remove('correct'));
          b.classList.add('correct');
        });
      });

      $('btnGradeRlExam')?.addEventListener('click', () => {
        clearInterval(rlTimerInt);
        let correct = 0;
        const total = (data.questions || []).length || 10;
        (data.questions || []).forEach((q, qi) => {
          const exp = $(`rlExp-${qi}`);
          let isOk = false;
          if (q.type === 'gapfill') {
            const inp = box.querySelector(`[data-rlgap="${qi}"]`);
            const val = (inp?.value || '').trim().toLowerCase();
            const acc = (q.acceptableAnswers || []).map((a) => String(a).trim().toLowerCase());
            isOk = Boolean(val && acc.includes(val));
            if (inp) inp.style.borderColor = isOk ? '#30D158' : '#FF453A';
            if (exp) {
              exp.innerHTML = `${isOk ? '✅ To‘g‘ri!' : `❌ Javob: <strong>${escapeHtml((q.acceptableAnswers || []).join(' / '))}</strong>`} — ${escapeHtml(q.explanationUz)}`;
              exp.classList.remove('hidden');
            }
          } else {
            isOk = selectedIdx[qi] === q.correctIndex;
            const btns = box.querySelectorAll(`[data-rlqi="${qi}"]`);
            btns.forEach((x, idx) => {
              x.classList.remove('correct', 'wrong');
              if (idx === q.correctIndex) x.classList.add('correct');
              else if (idx === selectedIdx[qi] && !isOk) x.classList.add('wrong');
            });
            if (exp) {
              exp.textContent = `${isOk ? '✅ To‘g‘ri!' : '❌ Xato.'} ${q.explanationUz}`;
              exp.classList.remove('hidden');
            }
          }
          if (isOk) correct++;
        });

        const scaled40 = Math.round((correct / total) * 40);
        const band = ieltsRaw40ToBand(scaled40);
        const sum = $('rlResultSummary');
        sum.classList.remove('hidden');
        sum.innerHTML = `
          <strong style="font-size:15px; color:#67e888;">🏅 Natija: ${correct} / ${total} (${scaled40} / 40 shkalada) → Band ${band.toFixed(1)}</strong>
          <p class="hint-text" style="margin:5px 0 0;">Band 8.5 uchun 40 tadan kamida 37 ta to‘g‘ri kerak. Pastdagi Sinonim Tuzoqlarini albatta eslab qoling!</p>
        `;
      });
    } catch (err) {
      box.textContent = 'Test yaratishda xatolik: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Yaratish';
    }
  }

  let currentSprintWords = [];
  let sprintTimerInt = null;

  async function generateSprint() {
    const btn = $('btnGenSprint');
    btn.disabled = true;
    btn.textContent = '⏳...';
    const tbl = $('sprintTableBox');
    tbl.classList.remove('hidden');
    tbl.innerHTML = '⏳ 30 ta IELTS akademik so‘z va sinonim tuzoqlar tuzilmoqda...';
    try {
      const theme = $('sprintThemeInput').value.trim();
      const data = await apiFetch('/api/vocab/sprint', {
        method: 'POST',
        body: JSON.stringify({ theme })
      });
      currentSprintWords = data.words || [];
      renderSprintTable(data.themeUz);
      startSprintQuiz();
    } catch (err) {
      tbl.textContent = 'Xatolik: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ 30 So‘z Yaratish';
    }
  }

  function renderSprintTable(themeUz = '') {
    const tbl = $('sprintTableBox');
    tbl.classList.remove('hidden');
    tbl.innerHTML =
      `<div class="row-between"><strong>📚 ${escapeHtml(themeUz || 'Bugungi 30 ta So‘z')}</strong><button id="btnRestartQuiz" class="mini-link-btn green" type="button">🎮 Speed-Quiz Boshlash</button></div>` +
      currentSprintWords
        .map(
          (w, i) => `
        <div class="sprint-word-row">
          <div>
            <strong>${i + 1}. ${escapeHtml(w.word)}</strong> <small style="color:#67e888;">(= ${escapeHtml(w.synonymTrap)})</small>
            <div class="hint-text">🇺🇿 ${escapeHtml(w.uzbek)}</div>
          </div>
          <button class="speak-mini-btn" data-spspk="${escapeHtml(w.word)}" type="button">🔊</button>
        </div>`
        )
        .join('');
    $('btnRestartQuiz')?.addEventListener('click', startSprintQuiz);
    tbl.querySelectorAll('[data-spspk]').forEach((b) => {
      b.addEventListener('click', () => speakText(b.dataset.spspk));
    });
  }

  function startSprintQuiz() {
    if (!currentSprintWords.length) return;
    const box = $('sprintGameBox');
    box.classList.remove('hidden');
    let qIdx = 0;
    let score = 0;
    let sec = 60;
    clearInterval(sprintTimerInt);

    const renderQ = () => {
      if (qIdx >= currentSprintWords.length || sec <= 0) {
        clearInterval(sprintTimerInt);
        box.innerHTML = `
          <strong style="color:#67e888; font-size:15px;">🏁 Sprint Yakunlandi! Ball: ${score} / ${currentSprintWords.length}</strong>
          <p class="hint-text" style="margin:6px 0;">${currentSprintWords.length} ta akademik so‘z o‘zlashtirish statistikangizga qo‘shilmoqda!</p>
        `;
        apiFetch('/api/vocab/sprint-complete', {
          method: 'POST',
          body: JSON.stringify({ learnedCount: currentSprintWords.length, score })
        }).catch(() => {});
        return;
      }
      const w = currentSprintWords[qIdx];
      const opts = [w.uzbek, ...(w.distractorsUz || ['boshqa', 'noto‘g‘ri', 'bilmadim']).slice(0, 3)].sort(
        () => Math.random() - 0.5
      );
      box.innerHTML = `
        <div class="row-between">
          <span class="badge-mini">⚡ SPEED-QUIZ ${qIdx + 1}/${currentSprintWords.length}</span>
          <strong id="sprintClock" style="color:#ffb340;">⏱️ ${sec}s • Ball: ${score}</strong>
        </div>
        <h2 style="margin:10px 0 4px; text-align:center;">${escapeHtml(w.word)}</h2>
        <p class="hint-text" style="text-align:center; margin:0 0 8px;">Sinonim tuzoq: ${escapeHtml(w.synonymTrap)}</p>
        ${opts.map((o) => `<button class="quiz-option" data-sqopt="${escapeHtml(o)}" type="button">${escapeHtml(o)}</button>`).join('')}
      `;
      box.querySelectorAll('[data-sqopt]').forEach((b) => {
        b.addEventListener('click', () => {
          if (b.dataset.sqopt === w.uzbek) score++;
          qIdx++;
          renderQ();
        });
      });
    };

    sprintTimerInt = setInterval(() => {
      sec--;
      const clk = $('sprintClock');
      if (clk) clk.textContent = `⏱️ ${sec}s • Ball: ${score}`;
      if (sec <= 0) renderQ();
    }, 1000);
    renderQ();
  }

  async function openWeeklyCheckpointModal() {
    $('weeklyExamModal').classList.remove('hidden');
    const body = $('weeklyExamBody');
    body.innerHTML = '⏳ Haftalik Qattiqqo‘l Imtihon (Yordamsiz 4-Skill) tuzilmoqda...';
    try {
      const data = await apiFetch('/api/exam/weekly-checkpoint', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' })
      });
      const ex = data.exam;
      $('weeklyExamTitle').textContent = `${ex.week}-Haftalik Qattiqqo‘l Imtihon`;

      const historyHtml = (brain.weeklyCheckpoints || [])
        .map(
          (h) =>
            `<div class="hint-text">• ${h.week}-hafta (${h.date}): Overall <strong>${h.overall}</strong> (L:${h.listening} R:${h.reading} W:${h.writing} S:${h.speaking})</div>`
        )
        .join('');

      body.innerHTML = `
        <div class="chain-notif alert">🔒 Qattiqqo‘l Rejim: O‘zbekcha yordam va kubiklar o‘chirilgan. Haqiqiy darajangizni ko‘rsating!</div>
        ${historyHtml ? `<div class="card-block"><strong>📊 Oldingi Haftalik Natijalar:</strong>${historyHtml}</div>` : ''}
        <div class="card-block">
          <div class="row-between"><strong>1. 🎧 Listening (1 marta eshiting)</strong><button class="mini-link-btn green" id="btnWkPlayL" type="button">🔊 Play</button></div>
          ${(ex.listeningQuestions || [])
            .map(
              (q, i) => `
            <p style="font-size:12.5px; margin:8px 0 4px;">${escapeHtml(q.prompt)}</p>
            ${(q.options || []).map((o, oi) => `<button class="quiz-option" data-wkl="${i}" data-wko="${oi}" type="button">${escapeHtml(o)}</button>`).join('')}`
            )
            .join('')}
        </div>
        <div class="card-block">
          <strong>2. 📖 Reading</strong>
          <p style="font-size:12px; line-height:1.45; margin:6px 0;">${escapeHtml(ex.readingPassage)}</p>
          ${(ex.readingQuestions || [])
            .map(
              (q, i) => `
            <p style="font-size:12.5px; margin:8px 0 4px;">${escapeHtml(q.prompt)}</p>
            ${(q.options || []).map((o, oi) => `<button class="quiz-option" data-wkr="${i}" data-wko="${oi}" type="button">${escapeHtml(o)}</button>`).join('')}`
            )
            .join('')}
        </div>
        <div class="card-block">
          <strong>3. ✍️ Writing</strong>
          <p class="hint-text" style="margin:4px 0;">${escapeHtml(ex.writingPrompt)}</p>
          <textarea id="wkWritingAns" class="ios-textarea" style="min-height:80px;" placeholder="Write in English only..."></textarea>
        </div>
        <div class="card-block">
          <strong>4. 🗣️ Speaking Response</strong>
          <p class="hint-text" style="margin:4px 0;">${escapeHtml(ex.speakingPrompt)}</p>
          <textarea id="wkSpeakingAns" class="ios-textarea" style="min-height:70px;" placeholder="Write your full spoken response..."></textarea>
        </div>
        <button id="btnSubmitWeeklyExam" class="ios-btn primary full" type="button">🏅 Imtihonni Topshirish & Baholash</button>
        <div id="wkExamResult" class="card-block hidden"></div>
      `;

      const ans = {};
      $('btnWkPlayL')?.addEventListener('click', () => speakText(ex.listeningScript));
      body.querySelectorAll('[data-wkl]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = b.dataset.wkl;
          ans[`l_${i}`] = Number(b.dataset.wko);
          body.querySelectorAll(`[data-wkl="${i}"]`).forEach((x) => x.classList.remove('correct'));
          b.classList.add('correct');
        });
      });
      body.querySelectorAll('[data-wkr]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = b.dataset.wkr;
          ans[`r_${i}`] = Number(b.dataset.wko);
          body.querySelectorAll(`[data-wkr="${i}"]`).forEach((x) => x.classList.remove('correct'));
          b.classList.add('correct');
        });
      });

      $('btnSubmitWeeklyExam')?.addEventListener('click', async () => {
        ans.writing = $('wkWritingAns').value.trim();
        ans.speaking = $('wkSpeakingAns').value.trim();
        const resBox = $('wkExamResult');
        resBox.classList.remove('hidden');
        resBox.innerHTML = '⏳ Qattiq IELTS mezonida baholanmoqda...';
        try {
          const sub = await apiFetch('/api/exam/weekly-checkpoint', {
            method: 'POST',
            body: JSON.stringify({ action: 'submit', exam: ex, answers: ans })
          });
          const r = sub.result;
          resBox.innerHTML = `
            <strong style="font-size:16px; color:#67e888;">🏆 Rasmiy Haftalik Natija: Overall Band ${r.overall}</strong>
            <div class="eval-grid">
              <div class="eval-stat"><span>Listening</span><strong>${r.listening}</strong></div>
              <div class="eval-stat"><span>Reading</span><strong>${r.reading}</strong></div>
              <div class="eval-stat"><span>Writing</span><strong>${r.writing}</strong></div>
              <div class="eval-stat"><span>Speaking</span><strong>${r.speaking}</strong></div>
            </div>
            <p style="font-size:12.5px; margin:4px 0;">${escapeHtml(r.verdictUz)}</p>
          `;
        } catch (err) {
          resBox.textContent = 'Baholash xatosi: ' + err.message;
        }
      });
    } catch (err) {
      body.innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    }
  }

  function scheduleWakeUpNotifications() {
    const lastTs = Number(safeStorageGet('ielts8_last_study_ts') || Date.now());
    safeStorageSet('ielts8_last_study_ts', String(Date.now()));
    const hoursAway = (Date.now() - lastTs) / (1000 * 60 * 60);
    if (hoursAway >= 12) {
      showPushNotification({
        pushTitleUz: '⚠️ Diqqat! 12+ soat mashq qilindingiz yo‘q!',
        knowledgeDiagnosisUz: 'Band 8.0 sur’atidan ortda qolmaslik uchun hozir kamida 1 ta 30-so‘z sprinti yoki 1 ta Listening test bajaring!'
      });
    }
  }

  // ==================== 7-DAY SNOWBALL GRAMMAR CHAIN & 8-90 FREE FLIGHT ====================
  function renderBootcampCard() {
    const bc = brain.bootcamp || { currentChainDay: 1, completedChainDays: [], phase: 'bootcamp_7' };
    const cur = Number(bc.currentChainDay || 1);
    const done = bc.completedChainDays || [];

    const badge = $('bootcampPhaseBadge');
    if (badge) badge.textContent = cur <= 7 ? `${cur}/7 Kun • Zanjir` : `${cur}/90 • Erkin Parvoz`;

    const notif = $('chainNotificationBanner');
    if (notif) {
      notif.textContent = bc.notificationUz || "🔔 1-kun: Gap tuzishning 1-zanjirini jonli amaliyotda boshlaymiz!";
      notif.classList.toggle('alert', Boolean(bc.brokenLinksAlert));
    }

    const row = $('chainLinksRow');
    if (row) {
      const pills = [1, 2, 3, 4, 5, 6, 7].map((d) => {
        const isDone = done.includes(d);
        const isBroken = Number(bc.brokenLinksAlert) === d;
        const isActive = cur === d && !isBroken;
        const cls = isBroken ? 'broken' : isActive ? 'active' : isDone ? 'done' : '';
        const icon = isBroken ? '⚠️ ' : isDone ? '✓ ' : '';
        return `<button class="chain-pill ${cls}" data-chainday="${d}" type="button">${icon}${d}-Kun</button>`;
      });
      const freeActive = cur >= 8;
      pills.push(
        `<button class="chain-pill ${freeActive ? 'active' : ''}" data-chainday="${Math.max(8, cur)}" type="button">🚀 8–90 Parvoz</button>`
      );
      row.innerHTML = pills.join('');
      row.querySelectorAll('[data-chainday]').forEach((btn) => {
        btn.addEventListener('click', () => openBootcampModal(Number(btn.dataset.chainday)));
      });
    }

    const dc = brain.dailyChecklist || {};
    [
      ['chkStep1', dc.step1_patterns, '1. 🧱 Qoliplar'],
      ['chkStep2', dc.step2_bricks, '2. 🧩 Kubiklar'],
      ['chkStep3', dc.step3_micro_media, '3. ✂️ Media'],
      ['chkStep4', dc.step4_live_chat, '4. 🗣️ Suhbat']
    ].forEach(([elId, isDone, label]) => {
      const btn = $(elId);
      if (btn) {
        btn.classList.toggle('done', Boolean(isDone));
        btn.textContent = isDone ? `✓ ${label.slice(3)}` : label;
      }
    });
  }

  // ==================== 5 LEVEL-ADAPTIVE SCAFFOLDING FEATURES ====================
  function renderReplyBricks(bricks) {
    const list = $('replyBricksList');
    if (!list) return;
    const arr =
      Array.isArray(bricks) && bricks.length > 0
        ? bricks
        : ['My name is', 'I want to', 'because', 'Yesterday', 'Currently', 'In my opinion'];
    list.innerHTML = '';
    arr.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brick-chip';
      btn.textContent = b;
      btn.addEventListener('click', () => {
        const inp = $('chatInput');
        inp.value = inp.value.trim() ? `${inp.value.trim()} ${b}` : b;
        autoResizeInput();
        inp.focus();
      });
      list.appendChild(btn);
    });
  }

  function appendClickableText(container, text, contextSentence) {
    const cleanText = String(text || '').replace(/\*\*([\s\S]*?)\*\*/g, '$1').replace(/__([\s\S]*?)__/g, '$1');
    const tokens = cleanText.split(/(\b[A-Za-z][A-Za-z'-]{1,}\b)/g);
    tokens.forEach((tok) => {
      if (/^[A-Za-z][A-Za-z'-]{1,}$/.test(tok)) {
        const sp = document.createElement('span');
        sp.className = 'tap-word';
        sp.textContent = tok;
        sp.title = "Tarjimasini ko'rish uchun bosing";
        sp.addEventListener('click', (e) => {
          e.stopPropagation();
          openWordLookup(tok, contextSentence || cleanText);
        });
        container.appendChild(sp);
      } else {
        container.appendChild(document.createTextNode(tok));
      }
    });
  }

  async function openWordLookup(word, contextSentence) {
    $('wordLookupModal').classList.remove('hidden');
    $('lookupWordTitle').textContent = word;
    $('wordLookupBody').innerHTML = '<div class="card-block">⏳ Tarjima va daraja variantlari yuklanmoqda...</div>';
    try {
      const data = await apiFetch('/api/word/lookup', {
        method: 'POST',
        body: JSON.stringify({ word, contextSentence })
      });
      const t = data.tiers || {};
      $('wordLookupBody').innerHTML = `
        <div class="card-block">
          <div class="row-between">
            <strong style="font-size:17px;">${escapeHtml(data.word)} <small class="hint-text">${escapeHtml(data.ipa || '')}</small></strong>
            <button class="speak-mini-btn" id="btnSpeakLookup" type="button">🔊 Eshitish</button>
          </div>
          <p style="margin:6px 0 4px; font-size:14px; color:#9ed0ff;"><strong>🇺🇿 Ma'nosi:</strong> ${escapeHtml(data.uzbekMeaning)} <small>(${escapeHtml(data.partOfSpeech || '')})</small></p>
          <p style="margin:4px 0 0; font-size:12.5px; color:var(--text-secondary);">💬 ${escapeHtml(data.example)}</p>
        </div>
        <div class="card-block">
          <span class="badge-mini">📈 BARCHA DARAJALARDA QANDAY AYTILADI:</span>
          <div style="margin-top:6px; font-size:12.5px; display:flex; flex-direction:column; gap:4px;">
            <div>🟢 <strong>Elementary (A2):</strong> ${escapeHtml(t.elementaryA2)}</div>
            <div>🔵 <strong>Intermediate (B2):</strong> ${escapeHtml(t.intermediateB2)}</div>
            <div style="color:#67e888;">🌟 <strong>IELTS Band 8.0:</strong> ${escapeHtml(t.band8C1)}</div>
          </div>
        </div>
        <button class="ios-btn success full" id="btnSaveLookupWord" type="button">➕ Shaxsiy Lug‘atga Qo‘shish</button>
      `;
      $('btnSpeakLookup')?.addEventListener('click', () => speakText(data.word));
      $('btnSaveLookupWord')?.addEventListener('click', () => {
        brain.personalVocab.unshift({
          id: `lk_${Date.now()}`,
          elementary: t.elementaryA2 || data.word,
          band8: t.band8C1 || data.word,
          uzbek: data.uzbekMeaning,
          example: data.example || '',
          reasonUz: `Bosib tarjima qilingan so'z (${brain.level})`,
          mastered: false
        });
        renderPersonalVocab();
        $('wordLookupModal').classList.add('hidden');
        showToast(`✅ "${t.band8C1 || data.word}" lug‘atga saqlandi!`);
      });
    } catch (err) {
      $('wordLookupBody').innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    }
  }

  function openBrickHelperModal() {
    $('brickModalLevelBadge').textContent = `🧩 GAP KUBIKLARI • ${brain.level}`;
    $('brickHelperModal').classList.remove('hidden');
  }

  async function buildBricksFromMixedThought() {
    const raw = $('brickRawInput').value.trim();
    if (!raw) {
      showToast('O‘zbekcha yoki aralash fikr yozing!');
      return;
    }
    const ws = $('brickWorkspace');
    ws.classList.remove('hidden');
    ws.innerHTML = '⏳ Gemini fikringizni darajangizga mos kubiklarga bo‘lmoqda...';
    try {
      const data = await apiFetch('/api/brick-helper', {
        method: 'POST',
        body: JSON.stringify({ rawInput: raw })
      });
      const assembled = [];
      const shuffled = [...(data.shuffledBricks || data.orderedBricks || [])];

      ws.innerHTML = `
        <span class="badge-mini">1. KUBIKLARNI BOSIB GAPNI YIG‘ING (${escapeHtml(data.currentLevelLabel)}):</span>
        <div id="brickTargetLine" style="min-height:42px; padding:8px; margin:8px 0; border-radius:10px; background:rgba(255,255,255,0.06); border:1px dashed rgba(255,255,255,0.22); font-size:13.5px; color:#fff;"></div>
        <div id="brickPool" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
        <div class="row-between" style="gap:6px; margin-top:10px;">
          <button id="btnClearBricks" class="ios-btn secondary compact" type="button">🔄 Tozalash</button>
          <button id="btnCheckBricks" class="ios-btn success compact" type="button">✅ Tekshirish</button>
          <button id="btnSendBricksToChat" class="ios-btn primary compact" type="button">📤 Chatga yuborish</button>
        </div>
        <div id="brickRevealBox" class="card-block hidden" style="margin-top:8px;"></div>
      `;

      const poolEl = $('brickPool');
      const targetEl = $('brickTargetLine');

      shuffled.forEach((bText) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'brick-chip';
        chip.textContent = bText;
        chip.addEventListener('click', () => {
          if (chip.classList.contains('used')) return;
          chip.classList.add('used');
          assembled.push(bText);
          targetEl.textContent = assembled.join(' ');
        });
        poolEl.appendChild(chip);
      });

      $('btnClearBricks')?.addEventListener('click', () => {
        assembled.length = 0;
        targetEl.textContent = '';
        poolEl.querySelectorAll('.brick-chip').forEach((c) => c.classList.remove('used'));
      });

      $('btnCheckBricks')?.addEventListener('click', () => {
        const userStr = assembled.join(' ').trim();
        const rev = $('brickRevealBox');
        rev.classList.remove('hidden');
        const matched = userStr.toLowerCase() === String(data.currentLevelEnglish).toLowerCase().replace(/[.!?]+$/, '');
        rev.innerHTML = `
          <strong style="color:${matched ? '#67e888' : '#ffd085'};">${matched ? '✅ To‘liq to‘g‘ri yig‘dingiz!' : '💡 Solishtirib ko‘ring:'}</strong>
          <div style="font-size:12.5px; margin-top:4px;"><strong>Sizning darajangiz:</strong> ${escapeHtml(data.currentLevelEnglish)}</div>
          <div style="font-size:12.5px; color:#67e888; margin-top:3px;"><strong>🌟 Band 8.0:</strong> ${escapeHtml(data.band8English)}</div>
          <small class="hint-text" style="display:block; margin-top:4px;">${escapeHtml(data.uzbekExplanation)}</small>
        `;
      });

      $('btnSendBricksToChat')?.addEventListener('click', () => {
        const txt = assembled.join(' ').trim() || data.currentLevelEnglish;
        $('brickHelperModal').classList.add('hidden');
        switchTab('tutor');
        sendChatMessage(txt);
      });
    } catch (err) {
      ws.textContent = 'Xatolik: ' + err.message;
    }
  }

  async function openGoldenPatternsModal() {
    $('goldenPatternsModal').classList.remove('hidden');
    $('goldenBadge').textContent = `🧱 OLTIN QOLIPLAR • ${brain.level}`;
    $('goldenTitle').textContent = 'Yuklanmoqda...';
    $('goldenBody').innerHTML = '<div class="card-block">⏳ Sizning hozirgi darajangizga mos Oltin Fe‘llar va Qoliplar tayyorlanmoqda...</div>';

    try {
      const data = await apiFetch('/api/brain/golden-patterns', {
        method: 'POST',
        body: JSON.stringify({})
      });
      $('goldenTitle').textContent = data.tierTitleUz || 'Oltin Qoliplar';

      const patHtml = (data.patterns || [])
        .map(
          (p) => `
        <div class="vocab-item" style="align-items:flex-start;">
          <div class="vocab-item-main">
            <strong>${escapeHtml(p.pattern)}</strong>
            <span>🇺🇿 ${escapeHtml(p.uzbek)} • ${escapeHtml(p.formulaUz)}</span>
            <small style="color:#9ed0ff; display:block; margin-top:2px;">💬 ${escapeHtml(p.example)}</small>
            <small style="color:#67e888; display:block;">🌟 Band 8: ${escapeHtml(p.band8Upgrade)}</small>
          </div>
          <button class="speak-mini-btn" data-gpspk="${escapeHtml(p.example)}" type="button">🔊</button>
        </div>`
        )
        .join('');

      const drillHtml = (data.drills || [])
        .map(
          (d, di) => `
        <div class="card-block">
          <strong style="font-size:13px;">${di + 1}. ${escapeHtml(d.question)}</strong>
          <div>
            ${(d.options || [])
              .map((opt, oi) => `<button class="quiz-option" data-gdi="${di}" data-goi="${oi}" type="button">${escapeHtml(opt)}</button>`)
              .join('')}
          </div>
          <p class="hint-text hidden" id="gpExp-${di}" style="margin:6px 0 0; color:#67e888;">💡 ${escapeHtml(d.explanationUz)}</p>
        </div>`
        )
        .join('');

      $('goldenBody').innerHTML = `
        <div class="hint-box">🎯 ${escapeHtml(data.whyThisTierUz)}</div>
        ${patHtml}
        <strong style="font-size:13.5px; margin-top:4px;">⚡ Tezkor Mustahkamlash Mashqlari:</strong>
        ${drillHtml}
      `;

      const body = $('goldenBody');
      body.querySelectorAll('[data-gpspk]').forEach((b) => {
        b.addEventListener('click', () => speakText(b.dataset.gpspk));
      });
      body.querySelectorAll('.quiz-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const di = Number(btn.dataset.gdi);
          const oi = Number(btn.dataset.goi);
          const q = data.drills[di];
          body.querySelectorAll(`[data-gdi="${di}"]`).forEach((b) => b.classList.remove('correct', 'wrong'));
          if (oi === q.correctIndex) btn.classList.add('correct');
          else {
            btn.classList.add('wrong');
            body.querySelectorAll(`[data-gdi="${di}"]`)[q.correctIndex]?.classList.add('correct');
          }
          $(`gpExp-${di}`)?.classList.remove('hidden');
        });
      });
    } catch (err) {
      $('goldenBody').innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== PROACTIVE DAILY AI NOTIFICATION & KNOWLEDGE BRIEFING ====================
  function showPushNotification(briefing) {
    const b = briefing || brain.dailyBriefing;
    if (!b) return;
    $('pushNotifTitle').textContent = b.pushTitleUz || '🔔 Bugungi darajangiz va rejangiz tayyor!';
    $('pushNotifBody').textContent = b.knowledgeDiagnosisUz || '';
    const banner = $('iosPushBanner');
    banner.classList.remove('hidden');
    clearTimeout(showPushNotification._t);
    showPushNotification._t = setTimeout(() => {
      banner.classList.add('hidden');
    }, 10000);
  }

  function renderBriefingContent(briefing) {
    const b = briefing || brain.dailyBriefing || {};
    const sb = brain.skillBands || { speaking: 4.0, listening: 4.0, reading: 4.0, writing: 4.0 };
    const dc = brain.dailyChecklist || {};
    const curDay = Number(brain.bootcamp?.currentChainDay || 1);

    const skillRow = (label, val) => {
      const pct = Math.min(100, Math.max(10, Math.round((Number(val || 4) / 8.5) * 100)));
      return `
        <div class="skill-bar-row">
          <span class="skill-bar-label">${label}</span>
          <div class="skill-bar-track"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
          <strong class="skill-bar-val">${Number(val || 4).toFixed(1)}</strong>
        </div>`;
    };

    const missionsHtml = (b.missions || [])
      .map((m, idx) => {
        const done = Boolean(dc[m.id]);
        return `
          <div class="mission-card ${done ? 'done' : ''}">
            <div style="flex:1; min-width:0;">
              <strong style="font-size:13px; color:${done ? '#7ef29d' : '#fff'};">${done ? '✅' : `${idx + 1}.`} ${escapeHtml(m.titleUz)}</strong>
              <p class="hint-text" style="margin:3px 0 0;">${escapeHtml(m.detailUz)}</p>
            </div>
            <button class="mini-link-btn ${done ? '' : 'green'}" data-maction="${escapeHtml(m.actionType)}" type="button">
              ${done ? 'Qayta' : 'Bajarish'}
            </button>
          </div>`;
      })
      .join('');

    $('briefingModalTitle').textContent = `${curDay}-Kun / 90 • Band ${Number(brain.estimatedBand || 4).toFixed(1)}`;
    $('dailyBriefingBody').innerHTML = `
      <div class="card-block">
        <div class="row-between">
          <span class="badge-mini">📊 HOZIRGI DARAJANGIZ</span>
          <strong style="color:#67e888;">${escapeHtml(brain.level)}</strong>
        </div>
        ${skillRow('🗣️ Speaking', sb.speaking)}
        ${skillRow('🎧 Listening', sb.listening)}
        ${skillRow('📖 Reading', sb.reading)}
        ${skillRow('✍️ Writing', sb.writing)}
      </div>

      <div class="thought-card">
        <div class="row-between" style="margin-bottom:4px;">
          <strong>🧠 AI Sizning Bilimingiz Haqida:</strong>
          <button class="speak-mini-btn" id="btnRefreshBriefing" type="button">🔄 Yangilash</button>
        </div>
        <div>${escapeHtml(b.knowledgeDiagnosisUz)}</div>
        <div style="margin-top:6px; color:#8df0a4;">📈 ${escapeHtml(b.paceStatusUz)}</div>
      </div>

      <div class="section-head" style="margin-top:2px;">
        <h3>🎯 Bugungi 4 ta Shaxsiy Vazifa</h3>
        <span class="hint-text">${dc.completedCount || 0} / 4 bajarildi</span>
      </div>
      ${missionsHtml}
    `;

    const body = $('dailyBriefingBody');
    $('btnRefreshBriefing')?.addEventListener('click', () => openDailyBriefingModal(true));
    body.querySelectorAll('[data-maction]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.maction;
        $('dailyBriefingModal').classList.add('hidden');
        if (act === 'patterns') openGoldenPatternsModal();
        else if (act === 'bricks') openBrickHelperModal();
        else if (act === 'media') switchTab('media');
        else {
          switchTab('tutor');
          $('btnStartSnowballChat').click();
        }
      });
    });
  }

  async function openDailyBriefingModal(forceRefresh = false) {
    $('iosPushBanner').classList.add('hidden');
    $('dailyBriefingModal').classList.remove('hidden');

    if (!forceRefresh && brain.dailyBriefing) {
      renderBriefingContent(brain.dailyBriefing);
      return;
    }

    $('dailyBriefingBody').innerHTML =
      '<div class="card-block">⏳ Gemini 4 Hydrogen sizning barcha xatolaringiz, lug‘atingiz va 4 ta IELTS ko‘nikmangizni tahlil qilib, bugungi shaxsiy hisobot va rejani tuzmoqda...</div>';
    try {
      const data = await apiFetch('/api/brain/daily-briefing', {
        method: 'POST',
        body: JSON.stringify({})
      });
      renderBriefingContent(data.briefing);
    } catch (err) {
      renderBriefingContent(brain.dailyBriefing);
      showToast('Hisobot yangilashda xatolik: ' + err.message);
    }
  }

  async function openBootcampModal(targetDay = null) {
    const bc = brain.bootcamp || { currentChainDay: 1 };
    const day = targetDay || Number(bc.currentChainDay || 1);

    $('bootcampModal').classList.remove('hidden');
    $('bootcampModalBadge').textContent =
      day <= 7 ? `⚡ 7-KUNLIK GRAMMATIKA ZANJIRI • ${day}-KUN` : `🚀 IELTS 8.0 ERKIN PARVOZ • ${day}-KUN`;
    $('bootcampModalTitle').textContent = 'Jonli Zanjir Tajribasi Tayyorlanmoqda...';
    $('bootcampModalBody').innerHTML =
      '<div class="card-block">⏳ Gemini 4 Hydrogen bugungi qisqa formula, Eski+Yangi zanjirli ko‘prik, o‘zbekchadan gap yig‘ish mashqi va lug‘atni tayyorlayapti...</div>';

    try {
      const data = await apiFetch('/api/bootcamp/lesson', {
        method: 'POST',
        body: JSON.stringify({ day })
      });

      $('bootcampModalTitle').textContent = data.titleUz;
      const sb = data.snowballBridge || {};
      const builder = data.uzbekToEnglishBuilder || {};
      const vocabHtml = (data.liveVocabulary || [])
        .map(
          (v) => `
        <div class="vocab-item" style="margin-top:6px;">
          <div class="vocab-item-main">
            <strong>✅ ${escapeHtml(v.band8)}</strong>
            <span>Oddiy: ${escapeHtml(v.elementary)} • 🇺🇿 ${escapeHtml(v.uzbek)}</span>
            <small style="color:#9ed0ff;">💬 ${escapeHtml(v.chainExample)}</small>
          </div>
          <button class="speak-mini-btn" data-bcspeak="${escapeHtml(v.chainExample || v.band8)}" type="button">🔊</button>
        </div>`
        )
        .join('');

      const daySwitcherHtml = [1, 2, 3, 4, 5, 6, 7, 8]
        .map(
          (d) =>
            `<button class="chain-pill ${d === (day <= 7 ? day : 8) ? 'active' : ''}" data-bcswitch="${d}" type="button">${d <= 7 ? `${d}-Kun` : '🚀 8–90'}</button>`
        )
        .join('');

      $('bootcampModalBody').innerHTML = `
        <div class="chain-links-row">${daySwitcherHtml}</div>
        <div class="chain-notif">${escapeHtml(data.notificationBannerUz)}</div>

        <div class="card-block">
          <span class="badge-mini">1. TEZKOR FORMULA (QURUQ MA'RUZASIZ)</span>
          <div style="white-space:pre-line; font-size:13px; line-height:1.45; margin-top:6px;">${escapeHtml(data.shortFormulaUz)}</div>
        </div>

        <div class="snowball-bridge">
          <span class="badge-mini">2. 🔗 ESKI + YANGI ZANJIR KO'PRIGI (SNOWBALL)</span>
          <div><strong>Eski poydevor:</strong> ${escapeHtml(sb.oldPart)}</div>
          <div><strong>Bugungi qatlam:</strong> ${escapeHtml(sb.newPart)}</div>
          <div style="background:rgba(48,209,88,0.12); padding:8px; border-radius:10px; border:1px solid rgba(48,209,88,0.35);">
            <strong style="color:#67e888;">🌟 Bitta Zanjirli Gap:</strong><br/>
            <span style="font-size:13.5px; font-weight:600;">${escapeHtml(sb.combinedEnglish)}</span>
            <div style="font-size:12px; color:#cdd7f0; margin-top:3px;">🇺🇿 ${escapeHtml(sb.combinedUzbek)}</div>
          </div>
          <small style="color:var(--text-secondary);">💡 ${escapeHtml(sb.explanationUz)}</small>
          <button class="speak-mini-btn" id="btnSpeakBridge" style="align-self:flex-start;" type="button">🔊 Zanjir gapni eshitish</button>
        </div>

        <div class="card-block">
          <span class="badge-mini">3. 🧱 AMALIY TAJRIBA: FIKRNI INGLIZCHAGA YIG'ISH</span>
          <p style="font-size:13px; margin:6px 0;"><strong>🇺🇿 Fikr:</strong> ${escapeHtml(builder.uzbekThought)}</p>
          <small class="hint-text">Kalitlar: ${(builder.hintBlocks || []).map(escapeHtml).join(' • ')}</small>
          <textarea id="bcBuilderInput" class="ios-textarea" style="min-height:74px; margin-top:8px;" placeholder="Eski + yangi qoidani bitta gapga qo'shib yozing..."></textarea>
          <button id="btnCheckBuilder" class="ios-btn primary full" type="button">✅ Zanjirni Tekshirish</button>
          <div id="bcBuilderResult" class="card-block hidden" style="margin-top:8px;"></div>
        </div>

        <div class="card-block">
          <span class="badge-mini">4. 📚 BUGUNGI ZANJIR LUG'ATI (BAND 8)</span>
          ${vocabHtml}
        </div>

        <button id="btnBcStartLiveChat" class="ios-btn gradient full" type="button">
          🗣️ AI Ustoz Bilan Jonli Zanjirli Suhbatni Boshlash
        </button>

        <button id="btnCompleteChainDay" class="ios-btn success full" type="button">
          🏆 ${day}-Kunni Yakunlash va Keyingi Zanjirni Ochish
        </button>
      `;

      const body = $('bootcampModalBody');
      body.querySelectorAll('[data-bcswitch]').forEach((b) => {
        b.addEventListener('click', () => openBootcampModal(Number(b.dataset.bcswitch)));
      });
      body.querySelectorAll('[data-bcspeak]').forEach((b) => {
        b.addEventListener('click', () => speakText(b.dataset.bcspeak));
      });
      $('btnSpeakBridge')?.addEventListener('click', () => speakText(sb.combinedEnglish));

      $('btnCheckBuilder')?.addEventListener('click', async () => {
        const ans = $('bcBuilderInput').value.trim();
        if (ans.length < 5) {
          showToast('Inglizcha gap yozing!');
          return;
        }
        const resBox = $('bcBuilderResult');
        resBox.classList.remove('hidden');
        resBox.innerHTML = '⏳ Zanjir tekshirilmoqda...';
        try {
          const chk = await apiFetch('/api/bootcamp/check-builder', {
            method: 'POST',
            body: JSON.stringify({ day, uzbekThought: builder.uzbekThought, studentEnglish: ans })
          });
          resBox.innerHTML = `
            <strong style="color:${chk.passed ? '#67e888' : '#ffb340'};">
              ${chk.passed ? '✅ Ajoyib! Eski + Yangi zanjir to‘g‘ri ulandi!' : '⚠️ Bir qismi yetishmadi — keling to‘g‘rilaymiz:'}
            </strong>
            <div style="font-size:12.5px; margin-top:5px;"><strong>To'g'ri:</strong> ${escapeHtml(chk.correctedCombined)}</div>
            <div style="font-size:12.5px; color:#67e888; margin-top:3px;"><strong>🌟 Band 8.0:</strong> ${escapeHtml(chk.band8Combined)}</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">💡 ${escapeHtml(chk.feedbackUz)}</div>
          `;
        } catch (err) {
          resBox.textContent = 'Xatolik: ' + err.message;
        }
      });

      $('btnBcStartLiveChat')?.addEventListener('click', () => {
        $('bootcampModal').classList.add('hidden');
        switchTab('tutor');
        setTutorMode('mentor');
        sendChatMessage(
          `Men hozir ${day}-kun Grammatika Zanjiri ("${data.titleUz}") amaliyotini boshlayapman. Qoidani quruq tushuntirmasdan, darhol menga savol bering va oldingi kunlar bilan qo'shib gapirishimni tekshiring: "${data.livePracticePrompt}"`
        );
      });

      $('btnCompleteChainDay')?.addEventListener('click', async () => {
        const res = await apiFetch('/api/bootcamp/advance', {
          method: 'POST',
          body: JSON.stringify({ completedDay: day })
        });
        $('bootcampModal').classList.add('hidden');
        showToast(res.brain?.bootcamp?.notificationUz || '🎉 Keyingi zanjir ochildi!');
      });
    } catch (err) {
      $('bootcampModalBody').innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== DYNAMIC AI STEP MODAL ====================
  async function openDynamicStepModal(stepId = null, focusRequestUz = null) {
    $('stepModal').classList.remove('hidden');
    $('stepModalBadge').textContent = 'GEMINI 4 HYDROGEN SHAXSIY DARSI';
    $('stepModalTitle').textContent = 'AI Dars Tayyorlamoqda...';
    $('stepModalBody').innerHTML =
      '<div class="card-block">⏳ Gemini 4 Hydrogen sizning xotirangiz va kamchiliklaringizni tahlil qilib, maxsus dars, test, lug‘at va internetdagi audio/videoni shakllantiryapti...</div>';

    try {
      const data = await apiFetch('/api/brain/generate-step', {
        method: 'POST',
        body: JSON.stringify({ stepId, focusRequestUz })
      });

      const step = data.step;
      $('stepModalTitle').textContent = step.titleUz;

      const quizHtml = (data.quiz || [])
        .map(
          (q, qi) => `
        <div class="card-block">
          <strong style="font-size:13px;">${qi + 1}. ${escapeHtml(q.question)}</strong>
          <div>
            ${(q.options || [])
              .map(
                (opt, oi) =>
                  `<button class="quiz-option" data-sqi="${qi}" data-soi="${oi}" type="button">${escapeHtml(opt)}</button>`
              )
              .join('')}
          </div>
          <p class="hint-text hidden" id="stepQuizExp-${qi}" style="margin-top:6px; color:#67e888;">💡 ${escapeHtml(q.explanationUz)}</p>
        </div>
      `
        )
        .join('');

      const mediaHtml = (data.mediaItems || [])
        .map(
          (m, mi) => `
        <div class="chat-video-card" style="margin-top:6px;">
          <img src="${escapeHtml(m.thumbnail || '/icon.svg')}" alt="" />
          <div class="chat-video-info">
            <span class="platform-tag ${escapeHtml(m.mediaType)}">${escapeHtml(m.sourcePlatform)}</span>
            <strong>${escapeHtml(m.title)}</strong>
          </div>
          <button class="mini-link-btn green" data-openstepmedia="${mi}" type="button">Ochish</button>
        </div>
      `
        )
        .join('');

      $('stepModalBody').innerHTML = `
        <div class="thought-card">
          <strong>🧠 Nega AI aynan shu darsni tuzdi:</strong> ${escapeHtml(step.reasonUz)}
        </div>
        <div class="card-block">
          <span class="badge-mini">NAZARIYA & FORMULA</span>
          <div style="white-space:pre-line; font-size:13px; line-height:1.5; margin-top:6px;">${escapeHtml(step.theoryUz)}</div>
        </div>
        ${
          step.practicePrompt
            ? `<div class="card-block">
                 <span class="badge-mini">AMALIY TOPSHIRIQ</span>
                 <p style="font-size:13px; margin:6px 0 8px;">${escapeHtml(step.practicePrompt)}</p>
                 <button id="btnPracticeStepInChat" class="ios-btn primary full" type="button">👨‍🏫 AI Ustoz bilan jonli bajarish</button>
               </div>`
            : ''
        }
        ${quizHtml}
        ${mediaHtml ? `<div class="card-block"><span class="badge-mini">INTERNETDAN MOS AUDIO / VIDEO</span>${mediaHtml}</div>` : ''}
        <button id="btnMarkStepComplete" class="ios-btn success full" type="button">
          ✅ Ushbu shaxsiy bosqichni yakunlash (+Band)
        </button>
      `;

      const body = $('stepModalBody');
      body.querySelectorAll('.quiz-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const qi = Number(btn.dataset.sqi);
          const oi = Number(btn.dataset.soi);
          const q = data.quiz[qi];
          body.querySelectorAll(`[data-sqi="${qi}"]`).forEach((b) => b.classList.remove('correct', 'wrong'));
          if (oi === q.correctIndex) btn.classList.add('correct');
          else {
            btn.classList.add('wrong');
            body.querySelectorAll(`[data-sqi="${qi}"]`)[q.correctIndex]?.classList.add('correct');
          }
          $(`stepQuizExp-${qi}`)?.classList.remove('hidden');
        });
      });

      body.querySelectorAll('[data-openstepmedia]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = data.mediaItems[Number(btn.dataset.openstepmedia)];
          if (!item) return;
          $('stepModal').classList.add('hidden');
          switchTab('media');
          openMediaInStudio(item);
        });
      });

      $('btnPracticeStepInChat')?.addEventListener('click', () => {
        $('stepModal').classList.add('hidden');
        switchTab('tutor');
        setTutorMode('mentor');
        sendChatMessage(`Men "${step.titleUz}" shaxsiy darsini boshlayapman. Mana topshiriq: ${step.practicePrompt}. Keling mashq qilaylik!`);
      });

      $('btnMarkStepComplete')?.addEventListener('click', async () => {
        await apiFetch('/api/brain/step-complete', {
          method: 'POST',
          body: JSON.stringify({ stepId: step.id })
        });
        $('stepModal').classList.add('hidden');
        showToast('🎉 Shaxsiy bosqich bajarildi! Band ko‘tarildi.');
      });
    } catch (err) {
      $('stepModalBody').innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== TAB 1: JONLI USTOZ CHAT ====================
  const MODE_WELCOMES = {
    mentor:
      "Assalomu alaykum! Men **Gemini 4 Hydrogen** — sizning jonli AI ingliz tili ustozingizman. Bu yerda tayyor shablon darslar yo'q: siz yozgan yoki gapirgan har bir so'zdan real darajangiz va kamchiliklaringizni tushunib, keyingi darslar, mashqlar va internetdagi mos audio/videolarni aynan siz uchun shakllantiraman. Qani, ingliz tilida o'zingiz haqingizda 2-3 oddiy gap yozing, 🎧 bosib talaffuzingizni eshittiring yoki 📸 rasm yuboring!",
    speaking:
      "Hello! Let's speak freely in English! Even if you are at Elementary level, speak without fear. Tap 🎧 to send your real voice for Pronunciation X-Ray, or type/speak normally!",
    roleplay:
      "Welcome to Live Roleplay Theater! Choose a real-life scenario above (Airport, Cafe, Job Interview, or IELTS Part 3 Debate) and start speaking — I will play the character and secretly coach you to Band 8.0!",
    media_discussion:
      "Bu yerda siz internetdan eshitgan podkast (MP3 audio), ko'rgan video yoki o'qigan maqolangiz haqida jonli suhbatlashamiz! Istasangiz hozir «Media & Audio» bo'limidan biror material oching yoki menga topib berishimni ayting.",
    mock_exam:
      "Good morning. I am your IELTS Speaking Examiner. Let's start Part 1: What do you do in your daily life, and why did you decide to prepare for IELTS?"
  };

  function setTutorMode(mode) {
    ui.tutorMode = mode;
    saveUi();

    document.querySelectorAll('#tutorModeSwitcher .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    $('roleplayBar')?.classList.toggle('hidden', mode !== 'roleplay');

    const banner = $('mediaContextBanner');
    if (mode === 'media_discussion' && ui.currentMedia) {
      banner.classList.remove('hidden');
      $('bannerMediaBadge').textContent = ui.currentMedia.sourcePlatform || 'MEDIA';
      $('bannerMediaTitle').textContent = ui.currentMedia.title;
    } else {
      banner.classList.add('hidden');
    }

    $('mockTimerBar').classList.toggle('hidden', mode !== 'mock_exam');

    if (!ui.chats[mode] || ui.chats[mode].length === 0) {
      ui.chats[mode] = [{ role: 'model', reply: MODE_WELCOMES[mode] || MODE_WELCOMES.mentor }];
      saveUi();
    }
    renderChatMessages();
  }

  function renderChatMessages() {
    const container = $('chatMessages');
    const msgs = ui.chats[ui.tutorMode] || [];
    container.innerHTML = '';

    msgs.forEach((m) => {
      const row = document.createElement('div');
      row.className = `msg-row ${m.role === 'user' ? 'user' : 'model'}`;

      if (m.role !== 'user' && m.thoughtUz) {
        const th = document.createElement('div');
        th.className = 'thought-card';
        th.innerHTML = `<strong>🧠 AI Ongi Tahlili:</strong> ${escapeHtml(m.thoughtUz)}`;
        row.appendChild(th);
      }

      if (m.role !== 'user' && m.stealthCheck && m.stealthCheck.testedItem) {
        const sc = m.stealthCheck;
        const stCard = document.createElement('div');
        stCard.className = `stealth-card ${sc.passed ? 'passed' : ''}`;
        stCard.innerHTML = `<strong>🕵️ Yashirin Xotira Tekshiruvi (${escapeHtml(sc.testedItem)}):</strong> ${sc.passed ? '✅ O‘tdingiz!' : '⚠️ Qayta mashq'} — ${escapeHtml(sc.feedbackUz)}`;
        row.appendChild(stCard);
      }

      if (m.role !== 'user' && m.chainCheck && (m.chainCheck.snowballModelSentence || m.chainCheck.feedbackUz)) {
        const cc = m.chainCheck;
        const chCard = document.createElement('div');
        chCard.className = `chain-check-card ${cc.passedSnowball && !cc.brokenLinkDay ? 'ok' : ''}`;
        chCard.innerHTML = `
          <div class="row-between">
            <strong>🔗 Grammatika Zanjiri (${escapeHtml(cc.activeDay || brain.bootcamp?.currentChainDay || 1)}-kun)</strong>
            <span class="badge-mini">${cc.brokenLinkDay ? `⚠️ ${cc.brokenLinkDay}-kun uzildi` : cc.passedSnowball ? '✅ Zanjir ulandi' : '⚡ Mashq'}</span>
          </div>
          ${cc.snowballModelSentence ? `<div style="color:#67e888;"><strong>🌟 Eski+Yangi Namuna:</strong> ${escapeHtml(cc.snowballModelSentence)}</div>` : ''}
          ${cc.feedbackUz ? `<div style="color:var(--text-secondary);">${escapeHtml(cc.feedbackUz)}</div>` : ''}
        `;
        if (cc.brokenLinkDay) {
          const fixBtn = document.createElement('button');
          fixBtn.className = 'mini-link-btn green';
          fixBtn.type = 'button';
          fixBtn.style.alignSelf = 'flex-start';
          fixBtn.textContent = `⚡ ${cc.brokenLinkDay}-kun zanjirini hozir tiklash`;
          fixBtn.addEventListener('click', () => openBootcampModal(Number(cc.brokenLinkDay)));
          chCard.appendChild(fixBtn);
        }
        row.appendChild(chCard);
      }

      if (m.xrayReport) {
        const xr = m.xrayReport;
        const xCard = document.createElement('div');
        xCard.className = 'xray-card';
        const probHtml = (xr.problemWords || [])
          .map((pw) => `<div>• <strong>${escapeHtml(pw.word)}</strong> ${escapeHtml(pw.ipa || '')}: ${escapeHtml(pw.issueUz)}</div>`)
          .join('');
        xCard.innerHTML = `
          <div class="row-between">
            <strong>🎧 Talaffuz Rentgeni: ${escapeHtml(xr.pronunciationScore)}%</strong>
            <span class="badge-mini">Band ~${escapeHtml(xr.estimatedPronunciationBand)}</span>
          </div>
          <div>${escapeHtml(xr.rhythmAndIntonationUz)}</div>
          ${probHtml}
        `;
        row.appendChild(xCard);
      }

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      const bubbleText = String(m.reply || m.text || '').replace(/\*\*([\s\S]*?)\*\*/g, '$1');
      if (m.role !== 'user' && getEffectiveStrictStage() !== 'exam_strict') {
        appendClickableText(bubble, bubbleText, bubbleText);
      } else {
        bubble.textContent = bubbleText;
      }

      if (m.uzbekHint) {
        const hint = document.createElement('div');
        hint.className = 'msg-uz-hint';
        const cleanHint = String(m.uzbekHint).replace(/\*\*([\s\S]*?)\*\*/g, '$1').replace(/__([\s\S]*?)__/g, '$1');
        hint.textContent = `🇺🇿 ${cleanHint}`;
        bubble.appendChild(hint);
      }

      if (m.role !== 'user' && (m.reply || m.text)) {
        const metaBar = document.createElement('div');
        metaBar.className = 'msg-meta-bar';
        const spk = document.createElement('button');
        spk.className = 'speak-mini-btn';
        spk.type = 'button';
        spk.textContent = '🔊 Eshitish';
        spk.addEventListener('click', () => speakText(m.reply || m.text));
        metaBar.appendChild(spk);
        bubble.appendChild(metaBar);
      }

      row.appendChild(bubble);

      if (m.correction && (m.correction.corrected || m.correction.band8Upgrade)) {
        const cCard = document.createElement('div');
        cCard.className = 'correction-card';
        cCard.innerHTML = `
          ${m.correction.original ? `<div class="corr-line-old">❌ ${escapeHtml(m.correction.original)}</div>` : ''}
          ${m.correction.corrected ? `<div class="corr-line-fix">✅ To'g'ri: ${escapeHtml(m.correction.corrected)}</div>` : ''}
          ${m.correction.band8Upgrade ? `<div class="corr-line-b8">🌟 Band 8.0: ${escapeHtml(m.correction.band8Upgrade)}</div>` : ''}
          ${m.correction.explanationUz ? `<div class="corr-line-uz">💡 ${escapeHtml(m.correction.explanationUz)}</div>` : ''}
        `;
        if (m.correction.band8Upgrade) {
          const playB8 = document.createElement('button');
          playB8.className = 'speak-mini-btn';
          playB8.type = 'button';
          playB8.textContent = '🔊 Band 8 talaffuzini eshitish';
          playB8.style.alignSelf = 'flex-start';
          playB8.addEventListener('click', () => speakText(m.correction.band8Upgrade));
          cCard.appendChild(playB8);
        }
        row.appendChild(cCard);
      }

      if (m.interactiveWidget && Array.isArray(m.interactiveWidget.options)) {
        const w = m.interactiveWidget;
        const wCard = document.createElement('div');
        wCard.className = 'widget-card';
        wCard.innerHTML = `
          <span class="badge-mini">🧩 AI YARATGAN JONLI MASHQ</span>
          <strong style="display:block; margin-top:4px;">${escapeHtml(w.promptUz)}</strong>
          <div>
            ${w.options
              .map((opt, oi) => `<button class="quiz-option" data-woi="${oi}" type="button">${escapeHtml(opt)}</button>`)
              .join('')}
          </div>
          <p class="hint-text hidden" style="margin:6px 0 0; color:#67e888;">💡 ${escapeHtml(w.explanationUz)}</p>
        `;
        const expEl = wCard.querySelector('.hint-text');
        wCard.querySelectorAll('.quiz-option').forEach((btn) => {
          btn.addEventListener('click', () => {
            const oi = Number(btn.dataset.woi);
            wCard.querySelectorAll('.quiz-option').forEach((b) => b.classList.remove('correct', 'wrong'));
            if (oi === w.correctIndex) btn.classList.add('correct');
            else {
              btn.classList.add('wrong');
              wCard.querySelectorAll('.quiz-option')[w.correctIndex]?.classList.add('correct');
            }
            expEl?.classList.remove('hidden');
          });
        });
        row.appendChild(wCard);
      }

      if (m.examEvaluation) {
        const ev = m.examEvaluation;
        const evCard = document.createElement('div');
        evCard.className = 'correction-card';
        evCard.innerHTML = `
          <strong style="color:#67e888;">🏅 IELTS Speaking Bahosi: Band ${escapeHtml(ev.overallBand)}</strong>
          <div class="eval-grid">
            <div class="eval-stat"><span>Fluency</span><strong>${escapeHtml(ev.fluency)}</strong></div>
            <div class="eval-stat"><span>Lexical</span><strong>${escapeHtml(ev.lexical)}</strong></div>
            <div class="eval-stat"><span>Grammar</span><strong>${escapeHtml(ev.grammar)}</strong></div>
            <div class="eval-stat"><span>Pronunciation</span><strong>${escapeHtml(ev.pronunciation)}</strong></div>
          </div>
          <div class="corr-line-uz">${escapeHtml(ev.feedbackUz)}</div>
        `;
        row.appendChild(evCard);
      }

      if (Array.isArray(m.recommendedMedia) && m.recommendedMedia.length > 0) {
        const mList = document.createElement('div');
        mList.className = 'chat-video-list';
        m.recommendedMedia.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'chat-video-card';
          card.innerHTML = `
            <img src="${escapeHtml(item.thumbnail || '/icon.svg')}" alt="" />
            <div class="chat-video-info">
              <span class="platform-tag ${escapeHtml(item.mediaType)}">${escapeHtml(item.sourcePlatform)}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.whyRecommendedUz || item.channel)}</small>
            </div>
            <button class="mini-link-btn green" type="button">Ochish</button>
          `;
          card.querySelector('button').addEventListener('click', () => {
            switchTab('media');
            openMediaInStudio(item);
          });
          mList.appendChild(card);
        });
        row.appendChild(mList);
      }

      container.appendChild(row);
    });

    container.scrollTop = msgs.length <= 1 ? 0 : container.scrollHeight;
  }

  async function sendChatMessage(overrideText = null) {
    const input = $('chatInput');
    const text = (overrideText !== null ? overrideText : input.value).trim();
    if (!text) return;

    // 📏 Length Gate Enforcement on manual user replies (skip questions ending with '?' or second-tap override)
    if (overrideText === null && !text.endsWith('?')) {
      const words = text.split(/\s+/).filter(Boolean).length;
      const minW = getMinRequiredWords();
      if (words < minW && lengthGateOverrideOnce !== text) {
        lengthGateOverrideOnce = text;
        showToast(`📏 To‘xtang! Kamida ${minW} ta so‘z yozing ("because..." va "for example..." qo‘shing, yoki qayta bosing).`);
        return;
      }
    }
    lengthGateOverrideOnce = '';

    if (overrideText === null) {
      input.value = '';
      autoResizeInput();
      updateLengthGateDisplay();
    }

    const mode = ui.tutorMode;
    if (!ui.chats[mode]) ui.chats[mode] = [];
    ui.chats[mode].push({ role: 'user', text });
    renderChatMessages();

    const container = $('chatMessages');
    const typing = document.createElement('div');
    typing.className = 'msg-row model';
    typing.innerHTML = `<div class="msg-bubble">🧠 Gemini 4 Hydrogen fikrlayapti va tahlil qilyapti...</div>`;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;

    try {
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          context: { media: ui.currentMedia, scenario: activeScenario },
          messages: ui.chats[mode].map((m) => ({
            role: m.role === 'user' ? 'user' : 'model',
            text: m.text || m.reply || ''
          }))
        })
      });

      typing.remove();
      ui.chats[mode].push({
        role: 'model',
        thoughtUz: data.thoughtUz,
        chainCheck: data.chainCheck,
        stealthCheck: data.stealthCheck,
        reply: data.reply,
        uzbekHint: data.uzbekHint,
        correction: data.correction,
        interactiveWidget: data.interactiveWidget,
        examEvaluation: data.examEvaluation,
        recommendedMedia: data.recommendedMedia || []
      });
      saveUi();
      renderChatMessages();
      renderReplyBricks(data.nextReplyBricks);

      if (ui.autoVoice && data.reply) speakText(data.reply);
    } catch (err) {
      typing.remove();
      ui.chats[mode].push({ role: 'model', reply: `Xatolik yuz berdi: ${err.message}` });
      renderChatMessages();
    }
  }

  function autoResizeInput() {
    const el = $('chatInput');
    el.style.height = 'auto';
    el.style.height = `${Math.min(84, el.scrollHeight)}px`;
  }

  // ==================== TAB 2: MULTI-SOURCE INTERNET MEDIA & AUDIO ====================
  function renderMediaGrid(items) {
    const grid = $('mediaGrid');
    $('mediaCountBadge').textContent = `${items.length} ta`;
    if (items.length === 0) {
      grid.innerHTML = `<div class="card-block"><p class="hint-text" style="margin:0;">Hozircha bu manbadan natija topilmadi. Boshqa so‘z yozing yoki AI tavsiya tugmasini bosing.</p></div>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (it, idx) => `
      <div class="video-card" data-midx="${idx}">
        <div class="video-thumb-wrap">
          <img src="${escapeHtml(it.thumbnail || '/icon.svg')}" alt="" />
          ${it.duration ? `<span class="video-duration">${escapeHtml(it.duration)}</span>` : ''}
        </div>
        <div class="video-card-body">
          <div>
            <span class="platform-tag ${escapeHtml(it.mediaType)}">${escapeHtml(it.sourcePlatform)}</span>
            <strong>${escapeHtml(it.title)}</strong>
          </div>
          <small>${escapeHtml(it.whyRecommendedUz || it.channel || '')}</small>
        </div>
      </div>
    `
      )
      .join('');

    grid.querySelectorAll('.video-card').forEach((card) => {
      card.addEventListener('click', () => {
        const item = items[Number(card.dataset.midx)];
        if (item) openMediaInStudio(item);
      });
    });
  }

  async function searchInternetMedia(query) {
    const q = (query || '').trim() || 'BBC Learning English elementary';
    $('mediaCountBadge').textContent = 'Izlanmoqda...';
    try {
      const data = await apiFetch(
        `/api/media/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(activeMediaSource)}`
      );
      mediaItems = data.items || [];
      $('mediaGridHeading').textContent = `"${q}" natijalari`;
      renderMediaGrid(mediaItems);
    } catch (err) {
      showToast('Qidirishda xatolik: ' + err.message);
    }
  }

  async function recommendMediaByWeakness() {
    const btn = $('btnAiRecommendMedia');
    btn.disabled = true;
    btn.textContent = '🧠 AI kamchiliklaringizga mos audio/video izlayapti...';
    try {
      const custom = $('mediaSearchInput').value.trim();
      const data = await apiFetch('/api/brain/recommend-media', {
        method: 'POST',
        body: JSON.stringify({ customRequestUz: custom, mediaFilter: activeMediaSource })
      });
      const rBox = $('aiMediaReasoningBox');
      rBox.classList.remove('hidden');
      rBox.innerHTML = `<strong>🧠 Gemini 4 Hydrogen Nima Uchun Bularni Topdi:</strong><br/>${escapeHtml(data.aiReasoningUz)}`;

      mediaItems = data.items || [];
      $('mediaGridHeading').textContent = 'Kamchiliklaringiz uchun AI topgan materiallar';
      renderMediaGrid(mediaItems);
    } catch (err) {
      showToast('Tavsiya olishda xatolik: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🧠 Kamchiliklarim asosida Internetdan Audio & Video topib ber';
    }
  }

  async function openMediaInStudio(item) {
    const studio = $('activeMediaStudio');
    studio.classList.remove('hidden');

    $('studioPlatformBadge').textContent = item.sourcePlatform || item.mediaType;
    $('studioMediaTitle').textContent = item.title;
    $('studioMediaChannel').textContent = item.channel || '';
    $('studioExternalLink').href = item.url || '#';

    // Reset all sub-players
    $('audioPlayerWrap').classList.add('hidden');
    $('videoEmbedWrap').classList.add('hidden');
    $('articleReaderWrap').classList.add('hidden');
    $('podcastAudioEl').pause();
    $('mediaEmbedFrame').src = '';

    if (item.mediaType === 'audio') {
      $('audioPlayerWrap').classList.remove('hidden');
      $('audioCoverImg').src = item.thumbnail || '/icon.svg';
      $('audioTitleSmall').textContent = item.title;
      $('audioSubSmall').textContent = item.channel || 'Internet Podcast MP3';
      $('podcastAudioEl').src = item.audioUrl;
    } else if (item.mediaType === 'article') {
      $('articleReaderWrap').classList.remove('hidden');
      const artBox = $('articleBodyText');
      artBox.innerHTML = '';
      appendClickableText(artBox, item.fullText || item.snippet || '', item.title);
    } else {
      $('videoEmbedWrap').classList.remove('hidden');
      $('mediaEmbedFrame').src = item.embedUrl || '';
    }

    ui.currentMedia = { ...item };
    saveUi();
    studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await analyzeActiveMedia(item);
  }

  async function analyzeActiveMedia(item) {
    const box = $('mediaAnalysisContent');
    box.innerHTML = '⏳ Gemini 4 Hydrogen ushbu materialni sizning kamchiliklaringizga bog‘lab tahlil qilmoqda...';
    try {
      const data = await apiFetch('/api/media/analyze', {
        method: 'POST',
        body: JSON.stringify({ item })
      });
      ui.currentMedia = { ...item, ...data };
      saveUi();

      const phrasesHtml = (data.keyPhrases || [])
        .map(
          (p, pi) => `
        <div class="vocab-item" style="margin-top:6px;">
          <div class="vocab-item-main">
            <strong>${escapeHtml(p.band8)}</strong>
            <span>${escapeHtml(p.elementary)} • 🇺🇿 ${escapeHtml(p.uzbek)}</span>
          </div>
          <button class="mini-link-btn" data-addmp="${pi}" type="button">+ Lug‘at</button>
        </div>
      `
        )
        .join('');

      const qHtml = (data.discussionQuestions || [])
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join('');

      const microHtml = (data.sentenceBreakdown || [])
        .map(
          (s, si) => `
        <div class="micro-sentence-card">
          <div style="font-size:13px; font-weight:600;">${si + 1}. ${escapeHtml(s.english)}</div>
          <div style="font-size:11.5px; color:#9ed0ff;">✂️ ${escapeHtml(s.wordByWordUz)}</div>
          <div style="font-size:11.5px; color:#67e888;">🌟 Band 8: ${escapeHtml(s.band8Upgrade)}</div>
          <div style="display:flex; gap:6px; margin-top:3px;">
            <button class="mini-link-btn" data-microslow="${si}" type="button">🐢 0.8x Sekin</button>
            <button class="mini-link-btn green" data-micronorm="${si}" type="button">🔊 1.0x Normal</button>
          </div>
        </div>
      `
        )
        .join('');

      box.innerHTML = `
        <p style="margin:0 0 6px; color:#8df0a4;"><strong>🎯 Nima uchun sizga foydali:</strong> ${escapeHtml(data.whyForYouUz)}</p>
        <p style="margin:0 0 6px;"><strong>🇺🇿 Xulosa:</strong> ${escapeHtml(data.summaryUz)}</p>
        <p style="margin:0 0 8px; color:var(--text-secondary);"><strong>🇬🇧 English:</strong> ${escapeHtml(data.summaryEn)}</p>
        ${microHtml ? `<strong>✂️ Jumlama-Jumla Chaynab Eshitish (Micro-Listening):</strong>${microHtml}` : ''}
        ${phrasesHtml ? `<strong style="display:block; margin-top:8px;">📚 Muhim Band 8 iboralar:</strong>${phrasesHtml}` : ''}
        ${qHtml ? `<strong style="display:block; margin-top:8px;">💬 Suhbat savollari:</strong><ol style="margin:4px 0 0; padding-left:18px;">${qHtml}</ol>` : ''}
      `;

      box.querySelectorAll('[data-microslow]').forEach((b) => {
        b.addEventListener('click', () => {
          const s = data.sentenceBreakdown[Number(b.dataset.microslow)];
          if (s) speakText(s.english, 0.8);
        });
      });
      box.querySelectorAll('[data-micronorm]').forEach((b) => {
        b.addEventListener('click', () => {
          const s = data.sentenceBreakdown[Number(b.dataset.micronorm)];
          if (s) speakText(s.english, 1.0);
        });
      });

      box.querySelectorAll('[data-addmp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = data.keyPhrases[Number(btn.dataset.addmp)];
          if (!p) return;
          brain.personalVocab.unshift({
            id: `med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            elementary: p.elementary,
            band8: p.band8,
            uzbek: p.uzbek,
            example: p.example || '',
            reasonUz: `${item.title} materialidan olindi`,
            mastered: false
          });
          renderPersonalVocab();
          btn.textContent = '✓ Qo‘shildi';
          btn.disabled = true;
          showToast('🧠 Shaxsiy lug‘atga qo‘shildi!');
        });
      });
    } catch (err) {
      box.textContent = `Tahlil yuklanmadi (${err.message}). Materialni eshitib/ko'rib suhbatni boshlashingiz mumkin.`;
    }
  }

  function startMediaDiscussion() {
    if (!ui.currentMedia) {
      showToast('Avval biror audio, video yoki maqolani tanlang!');
      return;
    }
    ui.chats.media_discussion = [];
    saveUi();
    switchTab('tutor');
    setTutorMode('media_discussion');
    sendChatMessage(
      `Men hozir "${ui.currentMedia.title}" (${ui.currentMedia.sourcePlatform}) materialini ko'rdim/eshitdim. Keling shu haqida ingliz tilida suhbatlashamiz — menga birinchi savolni bering!`
    );
  }

  // ==================== TAB 4: PERSONAL VOCAB & WRITING ====================
  function renderPersonalVocab() {
    const deck = brain.personalVocab || [];
    const masteredCount = deck.filter((v) => v.mastered).length;
    if (currentCardIndex >= deck.length) currentCardIndex = 0;

    if (deck.length === 0) {
      $('vocabCounterText').textContent = '0 / 0';
      $('vocabMasteredText').textContent = 'AI suhbatlaringizdan so‘z yig‘iladi';
      $('fcElementary').textContent = 'Hali shaxsiy so‘z yo‘q';
      $('fcUzbek').textContent = '"So‘z shakllantir" tugmasini bosing';
      $('fcBand8').textContent = '-';
      $('fcExample').textContent = '-';
      $('fcReason').textContent = '';
      $('vocabList').innerHTML = '';
      return;
    }

    const card = deck[currentCardIndex];
    $('vocabCounterText').textContent = `${currentCardIndex + 1} / ${deck.length}`;
    $('vocabMasteredText').textContent = `${masteredCount} ta o‘zlashtirildi`;
    $('fcElementary').textContent = card.elementary || '-';
    $('fcUzbek').textContent = card.uzbek || '';
    $('fcBand8').textContent = card.band8;
    $('fcExample').textContent = card.example || '';
    $('fcReason').textContent = card.reasonUz || '';

    $('vocabList').innerHTML = deck
      .map(
        (w) => `
      <div class="vocab-item">
        <div class="vocab-item-main">
          <strong>${w.mastered ? '✅ ' : ''}${escapeHtml(w.band8)}</strong>
          <span>${escapeHtml(w.elementary)} → 🇺🇿 ${escapeHtml(w.uzbek)}</span>
        </div>
        <button class="speak-mini-btn" data-vspeak="${escapeHtml(w.band8)}" type="button">🔊</button>
      </div>
    `
      )
      .join('');

    $('vocabList').querySelectorAll('[data-vspeak]').forEach((b) => {
      b.addEventListener('click', () => speakText(b.dataset.vspeak));
    });
  }

  async function generatePersonalVocab() {
    const btn = $('btnGenPersonalVocab');
    btn.disabled = true;
    btn.textContent = '⏳...';
    try {
      const topic = $('vocabTopicInput').value.trim();
      const data = await apiFetch('/api/brain/vocab-generate', {
        method: 'POST',
        body: JSON.stringify({ topic })
      });
      currentCardIndex = 0;
      showToast(`✨ ${data.added} ta shaxsiy Band 8 so‘z shakllantirildi!`);
    } catch (err) {
      showToast('Xatolik: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🧠 So‘z shakllantir';
    }
  }

  async function evaluateWriting() {
    const essay = $('essayInput').value.trim();
    if (essay.length < 10) {
      showToast('Kamida 1-2 ta gap yozing!');
      return;
    }
    const btn = $('btnEvalWriting');
    btn.disabled = true;
    btn.textContent = '⏳ Gemini 4 Hydrogen tekshirmoqda...';
    const resBox = $('writingResultBox');
    resBox.classList.remove('hidden');
    resBox.innerHTML = '⏳ Matningiz tahlil qilinmoqda va kamchiliklar xotiraga saqlanmoqda...';

    try {
      const data = await apiFetch('/api/writing-eval', {
        method: 'POST',
        body: JSON.stringify({
          taskType: 'Personal Writing & IELTS Eval',
          prompt: $('writingPromptInput').value,
          essay
        })
      });

      const c = data.criteria || {};
      const corrHtml = (data.corrections || [])
        .map(
          (it) => `
        <div class="correction-card" style="margin-top:6px;">
          <div class="corr-line-old">❌ ${escapeHtml(it.mistake)}</div>
          <div class="corr-line-b8">✅ ${escapeHtml(it.fix)}</div>
          <div class="corr-line-uz">💡 ${escapeHtml(it.whyUz)}</div>
        </div>
      `
        )
        .join('');

      resBox.innerHTML = `
        <div class="row-between">
          <strong style="color:#67e888; font-size:15px;">🏅 Taxminiy Baho: Band ${escapeHtml(data.overallBand)}</strong>
          ${data.detectedWeakness?.area ? `<span class="badge-mini">⚠️ ${escapeHtml(data.detectedWeakness.area)}</span>` : ''}
        </div>
        <div class="eval-grid">
          <div class="eval-stat"><span>Task</span><strong>${escapeHtml(c.taskResponse)}</strong></div>
          <div class="eval-stat"><span>Coherence</span><strong>${escapeHtml(c.coherenceCohesion)}</strong></div>
          <div class="eval-stat"><span>Lexical</span><strong>${escapeHtml(c.lexicalResource)}</strong></div>
          <div class="eval-stat"><span>Grammar</span><strong>${escapeHtml(c.grammar)}</strong></div>
        </div>
        <p style="font-size:13px; line-height:1.45;"><strong>🇺🇿 Xulosa:</strong> ${escapeHtml(data.feedbackUz)}</p>
        ${corrHtml}
        ${
          data.band8Rewrite
            ? `<div class="card-block" style="margin-top:8px; background:rgba(48,209,88,0.08);">
                 <div class="row-between">
                   <strong style="color:#67e888;">🌟 Band 8.0 Model Variant</strong>
                   <button class="speak-mini-btn" id="btnSpeakRw" type="button">🔊 Eshitish</button>
                 </div>
                 <p style="font-size:12.5px; line-height:1.5; margin:6px 0 0;">${escapeHtml(data.band8Rewrite)}</p>
               </div>`
            : ''
        }
      `;
      $('btnSpeakRw')?.addEventListener('click', () => speakText(data.band8Rewrite));
    } catch (err) {
      resBox.textContent = 'Xatolik: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Tekshirish & Kamchiliklarni Aniqlash';
    }
  }

  // ==================== FEATURE 1, 2, 3, 6: AUDIO X-RAY, VISION, SHADOWING, MNEMONICS & CHARTS ====================
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        resolve(res.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function resizeImageFileToBase64(file, maxDim = 1024) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', previewUrl: dataUrl });
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  let pendingIosCaptureContext = { mode: 'chat_voice', targetSentence: '', shadowIdx: -1 };

  async function processAudioXrayResult(xray, ctx) {
    if (ctx.mode === 'shadowing') {
      const box = $('shadowingResultBox');
      if (box) {
        box.classList.remove('hidden');
        const probs = (xray.problemWords || [])
          .map((pw) => `<div style="margin-top:4px;">• <strong>${escapeHtml(pw.word)}</strong> ${escapeHtml(pw.ipa || '')}: ${escapeHtml(pw.issueUz)}</div>`)
          .join('');
        box.innerHTML = `
          <div class="row-between">
            <strong style="color:#67e888; font-size:15px;">🔁 Shadowing Balli: ${escapeHtml(xray.pronunciationScore)}%</strong>
            <span class="badge-mini">Pronunciation Band ${escapeHtml(xray.estimatedPronunciationBand)}</span>
          </div>
          <p style="font-size:12.5px; margin:6px 0;"><strong>Siz aytdingiz:</strong> "${escapeHtml(xray.transcript)}"</p>
          <p style="font-size:12.5px; margin:0; color:#dbe5ff;">${escapeHtml(xray.rhythmAndIntonationUz)}</p>
          ${probs}
        `;
      }
      return;
    }

    const mode = ui.tutorMode;
    if (!ui.chats[mode]) ui.chats[mode] = [];
    ui.chats[mode].push({
      role: 'model',
      xrayReport: xray,
      reply: `Eshitdim: "${xray.transcript || '...'}"`,
      correction: xray.band8Upgrade
        ? {
            original: xray.transcript,
            corrected: xray.transcript,
            band8Upgrade: xray.band8Upgrade,
            explanationUz: xray.rhythmAndIntonationUz
          }
        : null
    });
    saveUi();
    renderChatMessages();
    if (xray.transcript) {
      await sendChatMessage(xray.transcript);
    }
  }

  async function handleIosAudioFallbackFile(file, ctx = pendingIosCaptureContext) {
    if (!file) return;
    showToast('🎧 Ovozingiz tahlil qilinmoqda...');
    const btn = ctx.mode === 'shadowing' && ctx.shadowIdx >= 0 ? $(`btnShRec-${ctx.shadowIdx}`) : null;
    if (btn) {
      btn.textContent = '⏳ Tahlil...';
      btn.disabled = true;
    }
    try {
      const audioBase64 = await blobToBase64(file);
      const mimeType = file.type || (file.name?.endsWith('.mov') ? 'video/quicktime' : 'audio/mp4');
      const xray = await apiFetch('/api/audio/xray', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64,
          mimeType,
          targetSentence: ctx.targetSentence || '',
          mode: ctx.mode || 'chat_voice'
        })
      });
      await processAudioXrayResult(xray, ctx);
    } catch (err) {
      showToast('Audio tahlil xatosi: ' + err.message);
    } finally {
      if (btn) {
        btn.textContent = '🎙️ Qaytarib aytish';
        btn.disabled = false;
      }
    }
  }

  async function toggleChatAudioXray() {
    const btn = $('btnAudioXray');
    if (isXrayRecording && chatMediaRecorder) {
      chatMediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      pendingIosCaptureContext = { mode: 'chat_voice', targetSentence: '', shadowIdx: -1 };
      if ($('iosAudioCaptureInput')) {
        showToast('🎙️ iPhone ovoz/video yozish oynasidan gapirib yuboring...');
        $('iosAudioCaptureInput').click();
      } else {
        showToast(`Mikrofon uchun https://${serverConfig.lanIp || '192.168.0.103'}:3443 da oching.`);
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      chatMediaRecorder = new MediaRecorder(stream);
      chatMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      chatMediaRecorder.onstop = async () => {
        isXrayRecording = false;
        btn.classList.remove('recording');
        stream.getTracks().forEach((t) => t.stop());
        const mime = chatMediaRecorder.mimeType || (MediaRecorder.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm');
        const blob = new Blob(chunks, { type: mime });
        showToast('🎧 Ovozingiz tahlil qilinmoqda...');
        try {
          const audioBase64 = await blobToBase64(blob);
          const xray = await apiFetch('/api/audio/xray', {
            method: 'POST',
            body: JSON.stringify({ audioBase64, mimeType: mime, mode: 'chat_voice' })
          });
          await processAudioXrayResult(xray, { mode: 'chat_voice', targetSentence: '' });
        } catch (err) {
          showToast('Audio tahlil xatosi: ' + err.message);
        }
      };
      isXrayRecording = true;
      btn.classList.add('recording');
      chatMediaRecorder.start();
      showToast('🎧 Gapiring! Tugagach yana bosing.');
    } catch (err) {
      pendingIosCaptureContext = { mode: 'chat_voice', targetSentence: '', shadowIdx: -1 };
      if ($('iosAudioCaptureInput')) {
        showToast('🎙️ iPhone diktofon/kamera orqali ovoz yuboring...');
        $('iosAudioCaptureInput').click();
      } else {
        showToast('Mikrofon ruxsati berilmadi: ' + err.message);
      }
    }
  }

  async function handleChatCameraUpload(file) {
    if (!file) return;
    showToast('📸 Rasm tahlil qilinmoqda...');
    try {
      const { base64, mimeType } = await resizeImageFileToBase64(file);
      const data = await apiFetch('/api/vision/analyze', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          visionMode: 'handwriting',
          userNote: $('chatInput').value.trim()
        })
      });
      const mode = ui.tutorMode;
      if (!ui.chats[mode]) ui.chats[mode] = [];
      ui.chats[mode].push({ role: 'user', text: '📸 [Rasm yuborildi]' });
      ui.chats[mode].push({
        role: 'model',
        reply: `📸 Rasm tahlili:\n${data.extractedTextOrScene}\n\n${data.speakingQuestion || ''}`,
        uzbekHint: data.feedbackUz,
        correction: data.band8Version
          ? {
              original: data.extractedTextOrScene,
              corrected: data.band8Version,
              band8Upgrade: data.band8Version,
              explanationUz: data.feedbackUz
            }
          : null
      });
      saveUi();
      renderChatMessages();
    } catch (err) {
      showToast('Rasm tahlili xatosi: ' + err.message);
    }
  }

  async function generateShadowing() {
    const btn = $('btnGenShadowing');
    btn.disabled = true;
    btn.textContent = '⏳...';
    const list = $('shadowingList');
    list.innerHTML = '<div class="card-block">⏳ Gemini 4 Hydrogen sizning darajangiz uchun 3 ta Shadowing jumlasini tuzmoqda...</div>';
    try {
      const customFocus = $('shadowFocusInput').value.trim();
      const data = await apiFetch('/api/shadowing/generate', {
        method: 'POST',
        body: JSON.stringify({ customFocus })
      });
      shadowSentences = data.sentences || [];
      renderShadowingList(data.focusTitleUz);
    } catch (err) {
      list.innerHTML = `<div class="card-block">Xatolik: ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yaratish';
    }
  }

  function renderShadowingList(focusTitleUz = '') {
    const list = $('shadowingList');
    list.innerHTML =
      (focusTitleUz ? `<div class="hint-box">🎯 ${escapeHtml(focusTitleUz)}</div>` : '') +
      shadowSentences
        .map(
          (s, idx) => `
        <div class="shadow-card">
          <span class="badge-mini">${escapeHtml(s.levelLabel)}</span>
          <strong style="font-size:14px;">${escapeHtml(s.sentence)}</strong>
          <div class="stress-line">🎵 Urg'u: ${escapeHtml(s.stressGuide)}</div>
          <small class="hint-text">🇺🇿 ${escapeHtml(s.uzbek)} • 💡 ${escapeHtml(s.tipUz)}</small>
          <div class="row-between" style="gap:8px; margin-top:4px;">
            <button class="ios-btn secondary compact" data-shplay="${idx}" type="button">🔊 Eshitish</button>
            <button class="ios-btn primary compact" data-shrec="${idx}" id="btnShRec-${idx}" type="button">🎙️ Qaytarib aytish</button>
          </div>
        </div>
      `
        )
        .join('');

    list.querySelectorAll('[data-shplay]').forEach((b) => {
      b.addEventListener('click', () => {
        const s = shadowSentences[Number(b.dataset.shplay)];
        if (s) speakText(s.sentence);
      });
    });
    list.querySelectorAll('[data-shrec]').forEach((b) => {
      b.addEventListener('click', () => toggleShadowRecord(Number(b.dataset.shrec)));
    });
  }

  async function toggleShadowRecord(idx) {
    const btn = $(`btnShRec-${idx}`);
    if (activeShadowRecordIdx === idx && shadowMediaRecorder) {
      shadowMediaRecorder.stop();
      return;
    }
    const target = shadowSentences[idx];
    if (!target) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      pendingIosCaptureContext = { mode: 'shadowing', targetSentence: target.sentence, shadowIdx: idx };
      if ($('iosAudioCaptureInput')) {
        showToast('🎙️ Jumlani o‘qib audio/video yuboring...');
        $('iosAudioCaptureInput').click();
      } else {
        showToast('Bu qurilmada audio yozish qo‘llab-quvvatlanmaydi.');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      shadowMediaRecorder = new MediaRecorder(stream);
      shadowMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      shadowMediaRecorder.onstop = async () => {
        activeShadowRecordIdx = -1;
        if (btn) {
          btn.textContent = '⏳ Tahlil...';
          btn.disabled = true;
        }
        stream.getTracks().forEach((t) => t.stop());
        const mime = shadowMediaRecorder.mimeType || (MediaRecorder.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : 'audio/webm');
        const blob = new Blob(chunks, { type: mime });
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await apiFetch('/api/audio/xray', {
            method: 'POST',
            body: JSON.stringify({
              audioBase64,
              mimeType: mime,
              targetSentence: target.sentence,
              mode: 'shadowing'
            })
          });
          await processAudioXrayResult(res, { mode: 'shadowing', targetSentence: target.sentence, shadowIdx: idx });
        } catch (err) {
          showToast('Tahlil xatosi: ' + err.message);
        } finally {
          if (btn) {
            btn.textContent = '🎙️ Qaytarib aytish';
            btn.disabled = false;
          }
        }
      };
      activeShadowRecordIdx = idx;
      if (btn) btn.textContent = '⏹️ To‘xtatish';
      shadowMediaRecorder.start();
    } catch (err) {
      pendingIosCaptureContext = { mode: 'shadowing', targetSentence: target.sentence, shadowIdx: idx };
      if ($('iosAudioCaptureInput')) {
        $('iosAudioCaptureInput').click();
      } else {
        showToast('Mikrofon xatosi: ' + err.message);
      }
    }
  }

  async function handleLabVisionFile(file) {
    if (!file) return;
    const box = $('visionResultBox');
    box.classList.remove('hidden');
    box.innerHTML = '⏳ Gemini Vision rasmni o‘qib tahlil qilmoqda...';
    try {
      const { base64, mimeType, previewUrl } = await resizeImageFileToBase64(file);
      const prev = $('visionPreviewImg');
      prev.src = previewUrl;
      prev.classList.remove('hidden');

      const data = await apiFetch('/api/vision/analyze', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          visionMode: activeVisionMode,
          userNote: $('visionNoteInput').value.trim()
        })
      });

      const vHtml = (data.vocabFromImage || [])
        .map(
          (v) => `
        <div class="vocab-item" style="margin-top:6px;">
          <div class="vocab-item-main">
            <strong>${escapeHtml(v.band8)}</strong>
            <span>${escapeHtml(v.elementary)} • 🇺🇿 ${escapeHtml(v.uzbek)}</span>
          </div>
          <button class="speak-mini-btn" data-visspk="${escapeHtml(v.band8)}" type="button">🔊</button>
        </div>`
        )
        .join('');

      box.innerHTML = `
        <div class="row-between">
          <strong>📸 Visual Tahlil Natijasi</strong>
          ${data.overallBand ? `<span class="badge-mini">Band ${escapeHtml(data.overallBand)}</span>` : ''}
        </div>
        <p style="font-size:12.5px; margin:6px 0;"><strong>Ko'rilgan/O'qilgan matn:</strong> ${escapeHtml(data.extractedTextOrScene)}</p>
        <p style="font-size:12.5px; margin:6px 0; color:#9ed0ff;"><strong>🇺🇿 Ustoz izohi:</strong> ${escapeHtml(data.feedbackUz)}</p>
        ${
          data.band8Version
            ? `<div class="card-block" style="background:rgba(48,209,88,0.08);">
                 <strong style="color:#67e888;">🌟 Band 8.0 Versiya:</strong>
                 <p style="font-size:12.5px; margin:5px 0 0;">${escapeHtml(data.band8Version)}</p>
               </div>`
            : ''
        }
        ${vHtml}
        <button class="ios-btn primary full" id="btnDiscussVisionInChat" style="margin-top:10px;" type="button">
          👨‍🏫 AI Ustoz bilan shu rasm haqida suhbatlashish
        </button>
      `;

      box.querySelectorAll('[data-visspk]').forEach((b) => {
        b.addEventListener('click', () => speakText(b.dataset.visspk));
      });
      $('btnDiscussVisionInChat')?.addEventListener('click', () => {
        switchTab('tutor');
        setTutorMode('speaking');
        sendChatMessage(
          `I analyzed an image (${data.extractedTextOrScene}). Ask me this question and discuss with me: "${data.speakingQuestion}"`
        );
      });
    } catch (err) {
      box.textContent = 'Xatolik: ' + err.message;
    }
  }

  async function generateVisualMnemonic() {
    const card = (brain.personalVocab || [])[currentCardIndex];
    if (!card) {
      showToast('Avval biror shaxsiy so‘z yarating!');
      return;
    }
    const box = $('mnemonicBox');
    box.classList.remove('hidden');
    box.innerHTML = '🎨 AI ushbu ibora uchun esda qoluvchi vizual rasm chizmoqda...';
    try {
      const data = await apiFetch('/api/visual/generate', {
        method: 'POST',
        body: JSON.stringify({ visualType: 'mnemonic', wordObj: card })
      });
      box.innerHTML = `
        <span class="badge-mini">🎨 VIZUAL XOTIRA RASMI</span>
        <div class="mnemonic-svg-wrap" style="margin:8px 0;">${data.svgCode || ''}</div>
        <p style="font-size:12.5px; margin:0; color:#dbe5ff;">💡 ${escapeHtml(data.memoryAssociationUz)}</p>
      `;
    } catch (err) {
      box.textContent = 'Rasm chizishda xatolik: ' + err.message;
    }
  }

  function renderChartSvg(data) {
    const W = 320;
    const H = 175;
    const padL = 32;
    const padB = 28;
    const padT = 26;
    const padR = 14;
    const cats = data.categories || [];
    const series = data.series || [];
    const allVals = series.flatMap((s) => s.values || [0]);
    const maxVal = Math.max(10, ...allVals) * 1.15;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let shapes = '';
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      const val = Math.round(maxVal * (1 - g / 4));
      shapes += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
      shapes += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="#8b99bb" font-size="8">${val}</text>`;
    }

    if (data.chartType === 'line') {
      series.forEach((s) => {
        const pts = cats
          .map((_, i) => {
            const x = padL + (cats.length > 1 ? (plotW * i) / (cats.length - 1) : plotW / 2);
            const y = padT + plotH - ((s.values[i] || 0) / maxVal) * plotH;
            return `${x},${y}`;
          })
          .join(' ');
        shapes += `<polyline fill="none" stroke="${s.color || '#0A84FF'}" stroke-width="2.5" points="${pts}"/>`;
        cats.forEach((_, i) => {
          const x = padL + (cats.length > 1 ? (plotW * i) / (cats.length - 1) : plotW / 2);
          const y = padT + plotH - ((s.values[i] || 0) / maxVal) * plotH;
          shapes += `<circle cx="${x}" cy="${y}" r="3.5" fill="${s.color || '#0A84FF'}"/>`;
        });
      });
      cats.forEach((c, i) => {
        const x = padL + (cats.length > 1 ? (plotW * i) / (cats.length - 1) : plotW / 2);
        shapes += `<text x="${x}" y="${H - 10}" text-anchor="middle" fill="#cdd7f0" font-size="9">${escapeHtml(c)}</text>`;
      });
    } else {
      const groupW = plotW / Math.max(1, cats.length);
      const barW = Math.min(22, (groupW - 10) / Math.max(1, series.length));
      cats.forEach((c, ci) => {
        const gx = padL + ci * groupW + (groupW - barW * series.length) / 2;
        series.forEach((s, si) => {
          const val = s.values[ci] || 0;
          const bh = (val / maxVal) * plotH;
          const x = gx + si * barW;
          const y = padT + plotH - bh;
          shapes += `<rect x="${x}" y="${y}" width="${barW - 2}" height="${bh}" rx="3" fill="${s.color || '#0A84FF'}"/>`;
        });
        shapes += `<text x="${padL + ci * groupW + groupW / 2}" y="${H - 10}" text-anchor="middle" fill="#cdd7f0" font-size="9">${escapeHtml(c)}</text>`;
      });
    }

    const legend = series
      .map(
        (s, i) =>
          `<rect x="${padL + i * 120}" y="6" width="8" height="8" rx="2" fill="${s.color || '#0A84FF'}"/><text x="${padL + 12 + i * 120}" y="13" fill="#fff" font-size="8.5">${escapeHtml(s.name)}</text>`
      )
      .join('');

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="12" fill="#0d1527"/>${legend}${shapes}</svg>`;
  }

  async function generateTask1Chart() {
    const btn = $('btnGenTask1Chart');
    btn.disabled = true;
    btn.textContent = '⏳...';
    const box = $('task1ChartBox');
    box.classList.remove('hidden');
    box.innerHTML = '📊 Gemini yangi IELTS Task 1 grafik chizmoqda...';
    try {
      const data = await apiFetch('/api/visual/generate', {
        method: 'POST',
        body: JSON.stringify({ visualType: 'task1_chart' })
      });
      $('writingPromptInput').value = data.promptText || data.chartTitle;
      box.innerHTML = `
        <strong style="display:block; font-size:13px; margin-bottom:6px;">${escapeHtml(data.chartTitle)} (${escapeHtml(data.unit || '')})</strong>
        ${renderChartSvg(data)}
        <p style="font-size:12px; color:#9ed0ff; margin:8px 0 4px;">💡 <strong>Band 8 Overview:</strong> ${escapeHtml(data.band8OverviewTipUz)}</p>
        <small class="hint-text">Kalit fe'llar: ${(data.keyVocab || []).map(escapeHtml).join(', ')}</small>
      `;
    } catch (err) {
      box.textContent = 'Grafik yaratishda xatolik: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '📊 AI Task 1 Grafik Chizish';
    }
  }

  // ==================== PURE-JS QR CODE GENERATOR (VERSION 3, ECC L) ====================
  function createQrSvg(text) {
    const bytes = new TextEncoder().encode(text);
    const size = 29;
    const dataCodewords = 55;
    const eccCodewords = 15;

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(Math.min(bytes.length, 53), 8);
    for (let i = 0; i < Math.min(bytes.length, 53); i++) pushBits(bytes[i], 8);
    pushBits(0, Math.min(4, dataCodewords * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const pads = [0xec, 0x11];
    let pIdx = 0;
    while (data.length < dataCodewords) data.push(pads[pIdx++ % 2]);

    const gfExp = new Uint8Array(512);
    const gfLog = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
    const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]]);

    let gen = [1];
    for (let i = 0; i < eccCodewords; i++) {
      const next = new Array(gen.length + 1).fill(0);
      const factor = gfExp[i];
      for (let j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];
        next[j + 1] ^= gfMul(gen[j], factor);
      }
      gen = next;
    }

    const msg = [...data, ...new Array(eccCodewords).fill(0)];
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
    const allBytes = [...data, ...msg.slice(data.length)];

    const mat = Array.from({ length: size }, () => new Array(size).fill(null));
    const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFunc = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mat[r][c] = val ? 1 : 0;
        isFunc[r][c] = true;
      }
    };
    const drawFinder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const inB = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          setFunc(r0 + r, c0 + c, inB && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) setFunc(22 + r, 22 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    setFunc(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) setFunc(8, i, false);
      if (!isFunc[i][8]) setFunc(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      setFunc(8, size - 1 - i, false);
      setFunc(size - 1 - i, 8, false);
    }

    const allBits = [];
    for (const b of allBytes) for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
    for (let i = 0; i < 7; i++) allBits.push(0);

    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (!isFunc[row][c]) {
            const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
            mat[row][c] = (row + c) % 2 === 0 ? bit ^ 1 : bit;
          }
        }
      }
      upward = !upward;
    }

    const fmt = 0x77c4;
    const fmtBit = (pos) => (fmt >> (14 - pos)) & 1;
    const c1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    c1.forEach(([r, c], idx) => (mat[r][c] = fmtBit(idx)));
    for (let i = 0; i < 7; i++) mat[size - 1 - i][8] = fmtBit(i);
    for (let i = 0; i < 8; i++) mat[8][size - 8 + i] = fmtBit(7 + i);

    const scale = 5;
    const quiet = 4;
    const dim = (size + quiet * 2) * scale;
    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mat[r][c] === 1) rects += `<rect x="${(c + quiet) * scale}" y="${(r + quiet) * scale}" width="${scale}" height="${scale}" fill="#090D16"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="${dim}" height="${dim}" fill="#ffffff"/>${rects}</svg>`;
  }

  function openQrModal() {
    const lanUrl = `http://${serverConfig.lanIp}:${serverConfig.port}`;
    $('lanUrlText').textContent = lanUrl;
    $('qrCanvasWrap').innerHTML = createQrSvg(lanUrl);
    $('qrModal').classList.remove('hidden');
  }

  function updateClock() {
    const now = new Date();
    const el = $('iosClock');
    if (el) el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function wireEvents() {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
    });

    $('btnToggleFrame').addEventListener('click', () => {
      ui.fullscreenDesktop = !ui.fullscreenDesktop;
      document.body.classList.toggle('fullscreen-mode', ui.fullscreenDesktop);
      $('btnToggleFrame').textContent = ui.fullscreenDesktop ? '📱 iPhone 13 Pro ramkasi' : "🖥️ To'liq ekran";
      saveUi();
    });
    if (ui.fullscreenDesktop) {
      document.body.classList.add('fullscreen-mode');
      $('btnToggleFrame').textContent = '📱 iPhone 13 Pro ramkasi';
    }

    $('btnOpenQr').addEventListener('click', openQrModal);
    $('btnHeaderQr').addEventListener('click', openQrModal);
    $('btnCloseQr').addEventListener('click', () => $('qrModal').classList.add('hidden'));
    $('btnCopyLanUrl').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('lanUrlText').textContent);
        showToast('✅ Manzil nusxalandi!');
      } catch (_) {}
    });

    const openSettings = () => {
      $('settingApiKey').value = ui.customApiKey || '';
      $('settingVoice').value = ui.voiceName || 'Kore';
      $('settingAutoVoice').checked = ui.autoVoice;
      $('settingsModal').classList.remove('hidden');
    };
    $('btnSettingsDesktop').addEventListener('click', openSettings);
    $('btnHeaderSettings').addEventListener('click', openSettings);
    $('btnCloseSettings').addEventListener('click', () => $('settingsModal').classList.add('hidden'));
    $('btnSaveSettings').addEventListener('click', () => {
      ui.customApiKey = $('settingApiKey').value.trim();
      ui.voiceName = $('settingVoice').value;
      ui.autoVoice = $('settingAutoVoice').checked;
      $('btnAutoVoice').classList.toggle('active', ui.autoVoice);
      saveUi();
      $('settingsModal').classList.add('hidden');
      showToast('✅ Sozlamalar saqlandi!');
    });
    $('btnResetBrain').addEventListener('click', async () => {
      await apiFetch('/api/brain/reset', { method: 'POST' });
      ui.chats = structuredClone(DEFAULT_UI.chats);
      saveUi();
      setTutorMode('mentor');
      $('settingsModal').classList.add('hidden');
      showToast('🧠 AI xotirasi yangilandi!');
    });

    // Tutor tab events
    $('btnGenNextStep').addEventListener('click', () => openDynamicStepModal(null, null));
    $('btnBrainBuildLesson').addEventListener('click', () => openDynamicStepModal(null, null));
    $('btnCloseStepModal').addEventListener('click', () => $('stepModal').classList.add('hidden'));

    $('btnOpenBriefing').addEventListener('click', () => openDailyBriefingModal(true));
    $('btnHeaderBriefing').addEventListener('click', () => openDailyBriefingModal(false));
    $('btnPushOpenBriefing').addEventListener('click', () => openDailyBriefingModal(false));
    $('btnDismissPush').addEventListener('click', () => $('iosPushBanner').classList.add('hidden'));
    $('btnCloseBriefingModal').addEventListener('click', () => $('dailyBriefingModal').classList.add('hidden'));
    $('chainNotificationBanner').style.cursor = 'pointer';
    $('chainNotificationBanner').addEventListener('click', () => openDailyBriefingModal(false));

    $('btnOpenBootcampDay').addEventListener('click', () => openBootcampModal());
    $('btnToggleTutorDrawer')?.addEventListener('click', () => {
      const dr = $('tutorDashboardDrawer');
      if (!dr) return;
      const isHidden = dr.classList.toggle('hidden');
      const btn = $('btnToggleTutorDrawer');
      if (btn) {
        btn.setAttribute('aria-expanded', String(!isHidden));
        btn.textContent = isHidden ? 'Reja & Rejim ▾' : 'Yopish ▴';
      }
    });
    $('btnCloseBootcampModal').addEventListener('click', () => $('bootcampModal').classList.add('hidden'));
    $('chkStep1').addEventListener('click', openGoldenPatternsModal);
    $('chkStep2').addEventListener('click', openBrickHelperModal);
    $('chkStep3').addEventListener('click', () => switchTab('media'));
    $('chkStep4').addEventListener('click', () => $('chatInput').focus());
    $('btnOpenBrickModal').addEventListener('click', openBrickHelperModal);
    $('btnCloseBrickModal').addEventListener('click', () => $('brickHelperModal').classList.add('hidden'));
    $('btnBuildBricks').addEventListener('click', buildBricksFromMixedThought);
    $('btnCloseGoldenModal').addEventListener('click', () => $('goldenPatternsModal').classList.add('hidden'));
    $('btnCloseLookupModal').addEventListener('click', () => $('wordLookupModal').classList.add('hidden'));
    $('btnStartSnowballChat').addEventListener('click', () => {
      const cur = brain.bootcamp?.currentChainDay || 1;
      setTutorMode('mentor');
      sendChatMessage(
        cur <= 7
          ? `Keling ${cur}-kun Grammatika Zanjiri bo'yicha jonli suhbat qilaylik! Oldingi ${cur > 1 ? `1–${cur - 1}` : '1'}-kun qoliplari bilan bugungi ${cur}-kunni bitta gapda qo'shib gapirishim uchun menga hayotiy savol bering.`
          : `Men ${cur}-kun Erkin Parvoz rejimida IELTS Band 8.0 suhbat boshlayapman! Menga kuchli C1/C2 savol bering va 7 kunlik grammatik zanjirimni ham tekshiring.`
      );
    });

    document.querySelectorAll('#tutorModeSwitcher .seg-btn').forEach((b) => {
      b.addEventListener('click', () => setTutorMode(b.dataset.mode));
    });
    document.querySelectorAll('#roleplayBar .filter-pill').forEach((b) => {
      b.addEventListener('click', () => {
        activeScenario = b.dataset.scenario;
        document.querySelectorAll('#roleplayBar .filter-pill').forEach((x) => x.classList.toggle('active', x.dataset.scenario === activeScenario));
        ui.chats.roleplay = [];
        setTutorMode('roleplay');
        sendChatMessage(`Let's start the "${b.textContent.trim()}" roleplay scenario! Start in character right now.`);
      });
    });

    $('btnBackToMedia').addEventListener('click', () => switchTab('media'));
    $('btnSendChat').addEventListener('click', () => sendChatMessage());
    $('chatInput').addEventListener('input', () => {
      autoResizeInput();
      updateLengthGateDisplay();
    });

    document.querySelectorAll('#strictModeBar [data-strict]').forEach((b) => {
      b.addEventListener('click', async () => {
        await apiFetch('/api/brain/strict-mode', {
          method: 'POST',
          body: JSON.stringify({ strictMode: b.dataset.strict })
        });
        showToast(`🔒 Rejim: ${b.textContent.trim()}`);
      });
    });
    $('btnOpenWeeklyExam')?.addEventListener('click', openWeeklyCheckpointModal);
    $('btnCloseWeeklyExam')?.addEventListener('click', () => $('weeklyExamModal').classList.add('hidden'));
    $('btnEnableWakeReminder')?.addEventListener('click', async () => {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification('IELTS 8 AI Ustoz', { body: '🔔 Uyg‘otuvchi eslatmalar faollashtirildi!' });
          showToast('🔔 Eslatmalar yoqildi!');
        } else {
          showToast('Brauzer ruxsat bermadi — .ipa versiyada iOS Push avtomatik ishlaydi.');
        }
      }
    });
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    $('btnMic').addEventListener('click', toggleSpeechRecognition);
    $('btnAudioXray').addEventListener('click', toggleChatAudioXray);
    $('iosAudioCaptureInput')?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) handleIosAudioFallbackFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btnCameraChat').addEventListener('click', () => $('chatCameraInput').click());
    $('chatCameraInput').addEventListener('change', (e) => {
      if (e.target.files?.[0]) handleChatCameraUpload(e.target.files[0]);
      e.target.value = '';
    });
    $('btnAutoVoice').classList.toggle('active', ui.autoVoice);
    $('btnAutoVoice').addEventListener('click', () => {
      ui.autoVoice = !ui.autoVoice;
      $('btnAutoVoice').classList.toggle('active', ui.autoVoice);
      if (!ui.autoVoice) stopAllAudio();
      saveUi();
    });
    document.querySelectorAll('#chatQuickChips .chip-btn').forEach((b) => {
      b.addEventListener('click', () => sendChatMessage(b.dataset.prompt));
    });

    $('btnMockTimerToggle').addEventListener('click', () => {
      if (mockTimerInterval) {
        clearInterval(mockTimerInterval);
        mockTimerInterval = null;
        $('btnMockTimerToggle').textContent = '▶️ Davom';
      } else {
        $('btnMockTimerToggle').textContent = '⏸️ Pauza';
        mockTimerInterval = setInterval(() => {
          mockSeconds++;
          $('mockTimerDisplay').textContent = `${String(Math.floor(mockSeconds / 60)).padStart(2, '0')}:${String(mockSeconds % 60).padStart(2, '0')}`;
        }, 1000);
      }
    });
    $('btnFinishMock').addEventListener('click', () => {
      sendChatMessage('Please finish our mock IELTS Speaking exam and give my full 4-criteria Band Score evaluation + update my weaknesses.');
    });

    // Media & Audio tab events
    $('btnAiRecommendMedia').addEventListener('click', recommendMediaByWeakness);
    $('btnSearchMedia').addEventListener('click', () => searchInternetMedia($('mediaSearchInput').value));
    $('mediaSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchInternetMedia($('mediaSearchInput').value);
    });
    document.querySelectorAll('#mediaSourceRow .filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeMediaSource = btn.dataset.src;
        document.querySelectorAll('#mediaSourceRow .filter-pill').forEach((b) => {
          b.classList.toggle('active', b.dataset.src === activeMediaSource);
        });
        searchInternetMedia($('mediaSearchInput').value || 'English learning elementary');
      });
    });

    $('btnAudioBack15').addEventListener('click', () => {
      const a = $('podcastAudioEl');
      if (a) a.currentTime = Math.max(0, a.currentTime - 15);
    });
    $('btnAudioFwd15').addEventListener('click', () => {
      const a = $('podcastAudioEl');
      if (a) a.currentTime = a.currentTime + 15;
    });
    document.querySelectorAll('[data-ar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rate = Number(btn.dataset.ar);
        $('podcastAudioEl').playbackRate = rate;
        document.querySelectorAll('[data-ar]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    $('btnReadArticleAloud').addEventListener('click', () => {
      speakText($('articleBodyText').textContent);
    });
    $('btnDiscussMedia').addEventListener('click', startMediaDiscussion);
    $('btnReanalyzeMedia').addEventListener('click', () => {
      if (ui.currentMedia) analyzeActiveMedia(ui.currentMedia);
    });

    // Lab tab events
    document.querySelectorAll('#labSubSwitcher .filter-pill').forEach((b) => {
      b.addEventListener('click', () => {
        const target = b.dataset.lab;
        document.querySelectorAll('#labSubSwitcher .filter-pill').forEach((x) => x.classList.toggle('active', x.dataset.lab === target));
        $('lab-vocab').classList.toggle('hidden', target !== 'vocab');
        $('lab-rl-sim').classList.toggle('hidden', target !== 'rl-sim');
        $('lab-sprint').classList.toggle('hidden', target !== 'sprint');
        $('lab-shadowing').classList.toggle('hidden', target !== 'shadowing');
        $('lab-vision').classList.toggle('hidden', target !== 'vision');
        $('lab-writing').classList.toggle('hidden', target !== 'writing');
      });
    });

    $('btnRlReading').addEventListener('click', () => {
      rlCurrentSkill = 'reading';
      $('btnRlReading').classList.add('active');
      $('btnRlListening').classList.remove('active');
    });
    $('btnRlListening').addEventListener('click', () => {
      rlCurrentSkill = 'listening';
      $('btnRlListening').classList.add('active');
      $('btnRlReading').classList.remove('active');
    });
    $('btnGenRlExam').addEventListener('click', generateRlExam);
    $('btnPlayRlAudio').addEventListener('click', () => {
      if (rlCurrentTest?.passageOrScript) speakText(rlCurrentTest.passageOrScript);
    });
    $('btnGenSprint').addEventListener('click', generateSprint);

    $('btnVisualMnemonic').addEventListener('click', (e) => {
      e.stopPropagation();
      generateVisualMnemonic();
    });
    $('btnGenShadowing').addEventListener('click', generateShadowing);
    $('btnVisHandwriting').addEventListener('click', () => {
      activeVisionMode = 'handwriting';
      $('btnVisHandwriting').classList.add('active');
      $('btnVisScene').classList.remove('active');
    });
    $('btnVisScene').addEventListener('click', () => {
      activeVisionMode = 'scene_speaking';
      $('btnVisScene').classList.add('active');
      $('btnVisHandwriting').classList.remove('active');
    });
    $('btnPickVisionImage').addEventListener('click', () => $('visionFileInput').click());
    $('visionFileInput').addEventListener('change', (e) => {
      if (e.target.files?.[0]) handleLabVisionFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btnGenTask1Chart').addEventListener('click', generateTask1Chart);

    $('flashcardEl').addEventListener('click', () => $('flashcardEl').classList.toggle('flipped'));
    $('btnSpeakCard').addEventListener('click', (e) => {
      e.stopPropagation();
      const card = (brain.personalVocab || [])[currentCardIndex];
      if (card) speakText(`${card.band8}. ${card.example || ''}`);
    });
    $('btnCardNext').addEventListener('click', () => {
      const deck = brain.personalVocab || [];
      if (!deck.length) return;
      $('flashcardEl').classList.remove('flipped');
      currentCardIndex = (currentCardIndex + 1) % deck.length;
      renderPersonalVocab();
    });
    $('btnCardRepeat').addEventListener('click', () => {
      const deck = brain.personalVocab || [];
      if (!deck.length) return;
      $('flashcardEl').classList.remove('flipped');
      currentCardIndex = (currentCardIndex + 1) % deck.length;
      renderPersonalVocab();
    });
    $('btnCardKnown').addEventListener('click', async () => {
      const deck = brain.personalVocab || [];
      const card = deck[currentCardIndex];
      if (!card) return;
      await apiFetch('/api/brain/vocab-master', {
        method: 'POST',
        body: JSON.stringify({ id: card.id, mastered: true })
      });
      $('flashcardEl').classList.remove('flipped');
      currentCardIndex = (currentCardIndex + 1) % deck.length;
      showToast('✅ Ajoyib! O‘zlashtirildi.');
    });
    $('btnGenPersonalVocab').addEventListener('click', generatePersonalVocab);

    $('essayInput').addEventListener('input', () => {
      const words = $('essayInput').value.trim().split(/\s+/).filter(Boolean).length;
      $('wordCountBadge').textContent = `${words} so'z`;
    });
    $('btnEvalWriting').addEventListener('click', evaluateWriting);
  }

  async function bootstrap() {
    updateClock();
    setInterval(updateClock, 15000);
    chainSkeleton = DEFAULT_CHAIN_SKELETON;
    wireEvents();

    if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    try {
      const [cfg, br] = await Promise.all([apiFetch('/api/config'), apiFetch('/api/brain')]);
      serverConfig = { ...serverConfig, ...cfg };
      if (cfg.runtimeKey && !ui.customApiKey) {
        ui.customApiKey = cfg.runtimeKey;
        saveUi();
      }
      updateModelBadge(cfg.primaryModel || 'gemini-4-hydrogen');
      if (br.brain) brain = br.brain;
      if (Array.isArray(br.chainSkeleton) && br.chainSkeleton.length) chainSkeleton = br.chainSkeleton;
    } catch (_) {}

    renderAllBrainViews();
    renderReplyBricks([]);
    setTutorMode(ui.tutorMode || 'mentor');
    switchTab(ui.activeTab || 'tutor');
    searchInternetMedia('BBC Learning English elementary speaking');
    scheduleWakeUpNotifications();
  }

  bootstrap();
})();
