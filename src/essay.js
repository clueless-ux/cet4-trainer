/* ==========================================================================
   Essay 写作诊断引擎（离线规则式，不依赖网络）
   - 逐句找错：拼写 / 语法 / 搭配 / 标点 / 口语词
   - 简单句 → 高级句 改写建议（可勾选）
   - 四级 15 分制评分 + 自动评语
   - 生成「改写后全文」
   对外：Essay.analyze(text, {prompt, title}) / Essay.html(report) / Essay.rewrite(report, opts)
   ========================================================================== */
(function () {
  const STOP = new Set(("a an the and or but if so because as of to in on at by for with from into about than then that this these those it its is are was were be been being do does did have has had will would can could should may might must not no nor i you he she we they them his her their our your my me us who whom which what when where why how all any both each few more most other some such only own same too very s t just don now also there here much many").split(" "));

  // 学术替换（口语/低分表达 → 书面表达）
  const WORD_UP = [
    [/\ba lot of\b/gi, "a considerable amount of", "口语化，写作里换成 a considerable amount of / numerous"],
    [/\blots of\b/gi, "numerous", "口语表达"],
    [/\bvery good\b/gi, "excellent", "very + 形容词是低分表达，用更精确的单词"],
    [/\bvery bad\b/gi, "detrimental", "very + 形容词是低分表达"],
    [/\bvery important\b/gi, "of vital importance", "very important 太常见，可换 of vital importance / crucial"],
    [/\bvery big\b/gi, "enormous", "very + 形容词是低分表达"],
    [/\bmore and more\b/gi, "a growing number of", "more and more 是口语，书面用 a growing number of / increasingly"],
    [/\bgood for\b/gi, "beneficial to", "good for 太笼统"],
    [/\bbad for\b/gi, "harmful to", "bad for 太笼统"],
    [/\bthink about\b/gi, "consider", "口语动词短语"],
    [/\bget better\b/gi, "improve", "口语表达"],
    [/\bfind out\b/gi, "discover", "口语动词短语"],
    [/\bdeal with\b/gi, "address", "deal with 偏口语，议论文用 address / tackle"],
    [/\bin my opinion\b/gi, "from my perspective", "可换成 from my perspective / as far as I am concerned（避免全文重复）"],
    [/\bI think\b/g, "In my view,", "I think 全文出现多次会显得句式单一；也可用 It seems to me that…"],
    [/\bthings\b/gi, "factors", "things 太笼统，用 factors / aspects"]
  ];

  // 中式搭配 / 高频错误
  const COLLOC = [
    [/\b(learn|learns|learned|learning)\s+(a\s+|some\s+)?knowledge\b/gi, m => {
      const v = String(m[1]).toLowerCase();
      const b = /s$/.test(v) ? "acquires" : /ed$/.test(v) ? "acquired" : /ing$/.test(v) ? "acquiring" : "acquire";
      return b + " knowledge";
    }, "knowledge 不与 learn 搭配，用 acquire / gain knowledge"],
    [/\bdiscuss\s+about\b/gi, "discuss", "discuss 是及物动词，后面不加 about"],
    [/\baccording\s+to\s+me\b/gi, "in my view", "according to 不用于第一人称观点"],
    [/\bopen\s+the\s+(light|lights|TV|television|computer|air conditioner)\b/gi, "turn on the $1", "开关电器用 turn on / turn off"],
    [/\bclose\s+the\s+(light|lights|TV|television|computer)\b/gi, "turn off the $1", "开关电器用 turn on / turn off"],
    [/\bin\s+the\s+other\s+hand\b/gi, "on the other hand", "固定搭配是 on the other hand"],
    [/\bwith\s+the\s+development\s+of\s+the\s+society\b/gi, "with the development of society", "society 前一般不加 the；这句本身也过于套话"],
    [/\bpay\s+attention\s+on\b/gi, "pay attention to", "固定搭配 pay attention to"],
    [/\bconsist\s+of\b/gi, "consist of", ""],
    [/\bcontact\s+with\b/gi, "contact", "contact 作动词时及物，不加 with"],
    [/\bmarry\s+with\b/gi, "marry", "marry 是及物动词"],
    [/\breach\s+to\b/gi, "reach", "reach 作及物动词时不加 to"],
    [/\benter\s+into\s+the\s+room\b/gi, "enter the room", "enter 是及物动词"],
    [/\bhow\s+to\s+say\b/gi, "how to put it", "how to say 是中式表达"],
    [/\bthe\s+reason\s+is\s+because\b/gi, "the reason is that", "the reason is because 是重复；用 the reason is that"],
    [/\bdespite\s+of\b/gi, "despite", "despite 后不加 of（in spite of 才加）"],
    [/\bbecause\s+of\s+the\s+reason\s+that\b/gi, "because", "冗余表达"]
  ];

  const BE = "is|are|was|were|am|be|been|being";
  const V1 = "go|goes|went|do|does|did|have|has|had|make|makes|made|take|takes|took|think|thinks|thought|believe|believes|say|says|said|know|knows|knew|want|wants|need|needs|like|likes|get|gets|got|come|comes|came|become|becomes|became|seem|seems|show|shows|showed|help|helps|helped|use|uses|used|play|plays|played|study|studies|studied|work|works|worked|live|lives|lived|feel|feels|felt|find|finds|found|give|gives|gave|read|reads|write|writes|wrote|see|sees|saw";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ---------- 分词与拼写 ---------- */
  function tokens(s) {
    const out = [];
    const re = /[A-Za-z][A-Za-z'’\-]*/g;
    let m;
    while ((m = re.exec(s))) out.push({ w: m[0], i: m.index });
    return out;
  }

  function isCJK(s) { return /[\u2e80-\u9fff]/.test(s); }

  // Damerau-Levenshtein（短词，带提前退出）
  function dist(a, b, cap) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > cap) return cap + 1;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      let best = cur[0];
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          cur[j] = Math.min(cur[j], prev[j - 2] + 1);
        if (cur[j] < best) best = cur[j];
      }
      if (best > cap) return cap + 1;
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  let DICT_WORDS = null;
  function dictWords() {
    if (DICT_WORDS) return DICT_WORDS;
    DICT_WORDS = [];
    try {
      const D = dictInit();
      D.forEach((v, k) => { if (k.length > 2) DICT_WORDS.push(k); });
    } catch (e) { }
    return DICT_WORDS;
  }

  /* ---------- 高频错拼 → 正确词（优先于距离算法，避免给出 relieVe 这类离谱建议） ---------- */
  const MISSPELL = {
    recieve: "receive", recieved: "received", recieving: "receiving",
    beleive: "believe", beleived: "believed", belive: "believe",
    enviroment: "environment", enviromental: "environmental",
    seperate: "separate", seperated: "separated", definately: "definitely", definatly: "definitely",
    occured: "occurred", occuring: "occurring", untill: "until", becuase: "because", becasue: "because",
    wich: "which", thier: "their", goverment: "government", tommorow: "tomorrow", tommorrow: "tomorrow",
    adress: "address", concious: "conscious", existance: "existence", independant: "independent",
    neccessary: "necessary", necessery: "necessary", occassion: "occasion", perfomance: "performance",
    priviledge: "privilege", reccomend: "recommend", recomend: "recommend", sucess: "success",
    wierd: "weird", arguement: "argument", calender: "calendar", embarass: "embarrass",
    foriegn: "foreign", freind: "friend", grammer: "grammar", happend: "happened",
    knowlege: "knowledge", libary: "library", maintian: "maintain", neice: "niece",
    occurence: "occurrence", persue: "pursue", phenonmenon: "phenomenon", posession: "possession",
    prefered: "preferred", refered: "referred", responsability: "responsibility", secratary: "secretary",
    strenght: "strength", succesful: "successful", suprise: "surprise", tendancy: "tendency",
    threshhold: "threshold", ture: "true", useing: "using", writting: "writing", begining: "beginning",
    comming: "coming", runing: "running", studing: "studying", tryed: "tried", carrer: "career",
    collage: "college", competion: "competition", concering: "concerning", developement: "development",
    efficent: "efficient", equiptment: "equipment", excercise: "exercise", existant: "existent",
    familar: "familiar", finaly: "finally", immediatly: "immediately", imporve: "improve",
    incidently: "incidentally", knowledgable: "knowledgeable", liesure: "leisure", literiture: "literature",
    managment: "management", millenium: "millennium", noticable: "noticeable", occurance: "occurrence",
    oppurtunity: "opportunity", payed: "paid", peice: "piece", posible: "possible", practicle: "practical",
    preceed: "proceed", publically: "publicly", quater: "quarter", questionaire: "questionnaire",
    realy: "really", refering: "referring", relevent: "relevant", religous: "religious",
    remeber: "remember", saftey: "safety", schedual: "schedule", similer: "similar",
    sincerly: "sincerely", speach: "speech", stategy: "strategy", strenghen: "strengthen",
    sufficent: "sufficient", suprised: "surprised", techonology: "technology", therfore: "therefore",
    thourough: "thorough", transfered: "transferred", uniquley: "uniquely", usualy: "usually",
    vacum: "vacuum", wether: "whether", withing: "within", wroten: "written"
  };

  /* ---------- 拼写白名单：只判「这个词是不是个真词」，与释义词典分开 ---------- */
  const TECH_EXTRA = ("wifi wi-fi smartphone smartphones selfie selfies blog blogs blogger podcast podcasts ebook ebooks online offline email emails website websites webpage webpages username login logout upload download streaming chatbot chatbots laptop laptops tablet tablets bluetooth hotspot touchscreen webcam screenshot screenshots courseware mooc moocs").split(" ");
  let _spellSet = null;
  function spellSet() {
    if (_spellSet) return _spellSet;
    _spellSet = new Set(TECH_EXTRA);
    let raw = "";
    try {
      if (typeof SPELL_RAW !== "undefined" && SPELL_RAW) raw = SPELL_RAW;
      else if (typeof window !== "undefined" && window.SPELL_RAW) raw = window.SPELL_RAW;
    } catch (e) { }
    if (raw) raw.split(",").forEach(w => { if (w) _spellSet.add(w); });
    return _spellSet;
  }
  function spellKnown(w) {
    const t = String(w || "").toLowerCase();
    if (!t) return false;
    const set = spellSet();
    if (set.has(t)) return true;
    const cands = [t.replace(/['’]s$/, ""), t.replace(/s$/, ""), t.replace(/es$/, ""), t.replace(/ed$/, ""), t.replace(/d$/, ""),
      t.replace(/ing$/, ""), t.replace(/ing$/, "e"), t.replace(/ier$/, "y"), t.replace(/iest$/, "y"),
      t.replace(/er$/, ""), t.replace(/est$/, ""), t.replace(/ly$/, ""), t.replace(/ies$/, "y")];
    return cands.some(c => c && c !== t && set.has(c));
  }

  function spellFix(w) {
    const lw = w.toLowerCase();
    let best = null, bestD = 3;
    const words = dictWords();
    for (let i = 0; i < words.length; i++) {
      const c = words[i];
      if (Math.abs(c.length - lw.length) > 2) continue;
      if (c[0] !== lw[0] && Math.abs(c.length - lw.length) > 1) continue;
      const d = dist(lw, c, 2);
      if (d < bestD) { bestD = d; best = c; if (d === 1) break; }
    }
    return bestD <= 2 ? { fix: best, d: bestD } : null;
  }

  /* ---------- 句式升级模板（按优先级，命中第一条即止） ---------- */
  const GERUND = phrase => {
    const parts = String(phrase).trim().split(/\s+/);
    const v = parts[0].toLowerCase();
    let g;
    if (/e$/.test(v) && !/(ee|ie|ye)$/.test(v)) g = v.slice(0, -1) + "ing";
    else if (/[^aeiou][aeiou][bdgklmnprt]$/.test(v)) g = v + v.slice(-1) + "ing";
    else g = v + "ing";
    return [g].concat(parts.slice(1)).join(" ");
  };
  const UPGRADES = [
    { re: /^i\s+(don't|do not)\s+think\s+(that\s+)?(.+?)\.?$/i, to: m => `I am not convinced that ${m[3]}.`, why: "否定前移 + 名词性从句，比 I don't think 更正式" },
    { re: /^i\s+think\s+(that\s+)?(.+?)\.?$/i, to: m => `It is my view that ${m[2]}.`, why: "I think 若全文多次出现会显得句式单一，可换 It is my view that… / It seems to me that…" },
    { re: /^(many|a lot of|lots of)\s+people\s+(think|believe|say)\s+(that\s+)?(.+?)\.?$/i, to: m => `A considerable number of individuals hold the view that ${m[4]}.`, why: "Many people think → hold the view that…，书面化表达" },
    { re: /^many\s+people\s+(think|believe|say)\s+(that\s+)?(.+?)\.?$/i, to: m => `A considerable number of individuals hold the view that ${m[3]}.`, why: "Many people think → hold the view that…，书面化表达" },
    { re: /^(.+?)\s+is\s+very\s+important\.?$/i, to: m => `${m[1]} is of vital importance.`, why: "very important → of vital importance / crucial，避免 very + 常见形容词" },
    { re: /^we\s+(should|must)\s+(.+?)\.?$/i, to: m => `It is imperative that we ${m[1].toLowerCase()} ${m[2]}.`, why: "We should… → It is imperative that we (should)…，虚拟语气句式" },
    { re: /^(.+?)\s+is\s+good\s+for\s+(.+?)\.?$/i, to: m => `${m[1]} is conducive to ${m[2]}.`, why: "be good for → be conducive to，四级高频高级搭配" },
    { re: /^(.+?)\s+is\s+bad\s+for\s+(.+?)\.?$/i, to: m => `${m[1]} is detrimental to ${m[2]}.`, why: "be bad for → be detrimental to" },
    { re: /^because\s+(.+?),\s*(.+?)\.?$/i, to: m => `Owing to the fact that ${m[1]}, ${m[2]}.`, why: "Because… → Owing to the fact that…；也可改用分词结构 (Given that…)" },
    { re: /^(.+?)\s+help(s)?\s+(us|people|students|them)\s+(.+?)\.?$/i, to: m => `${/\b(can|could|will|would|may|might|should|must)$/i.test(m[1]) ? m[1] : m[1] + " can"} contribute to ${GERUND(m[4])}.`, why: "help sb do → contribute to doing，名词化/动名词更书面" }
  ];

  function upgradesFor(sent) {
    const s = sent.text.replace(/\s+/g, " ").trim();
    const body = s.replace(/[.!?]+$/, "");
    const lower = body.charAt(0).toLowerCase() + body.slice(1);
    for (const u of UPGRADES) {
      const m = lower.match(u.re);
      if (!m) continue;
      let out;
      try { out = u.to(m); } catch (e) { continue; }
      if (!out) continue;
      out = out.replace(/\s+/g, " ").trim();
      if (out.length < 12 || out.toLowerCase() === lower.toLowerCase() + ".") continue;
      out = quickFix(out);
      out = out.charAt(0).toUpperCase() + out.slice(1);
      if (!/[.!?]$/.test(out)) out += ".";
      return [{ from: s, to: out, why: u.why }];
    }
    return [];
  }

  /* ---------- 句子切分 ---------- */
  // 缩写里的句点不是句末：先换成占位符（字符数不变，正文偏移不受影响），切完再还原
  const DOT = "\u0001";
  function maskAbbr(s) {
    let t = s;
    t = t.replace(/\b([ap])\.(m\b)/gi, `$1${DOT}$2`);              // a.m. / p.m.
    t = t.replace(/\b([ei])\.(g|e)\b/gi, `$1${DOT}$2`);             // e.g. / i.e.
    t = t.replace(/\b(u)\.(s|k)\./gi, `$1${DOT}$2.`);               // U.S. / U.K.
    t = t.replace(/\b(mr|mrs|ms|dr|prof|st|jr|sr|vs|no|fig|inc|ltd|co|dept|approx|ph\.?d)\.(?=\s+[A-Za-z])/gi, `$1${DOT}`);
    t = t.replace(/\betc\.(?=[,;]\s|\s+[a-z])/gi, `etc${DOT}`);
    t = t.replace(/(\d)\.(\d)/g, `$1${DOT}$2`);                     // 小数 3.5
    t = t.replace(/\b([A-Z])\.(?=\s*[A-Z]\.)/g, `$1${DOT}`);        // 姓名缩写 J. K.
    t = t.replace(/\.(?=\s*[,;])/g, DOT);                          // 句点后面直接跟逗号/分号 → 不是句末（如 3 p.m., I…）
    return t;
  }
  function splitSentences(text) {
    const out = [];
    const src = maskAbbr(text);
    const re = /[^.!?\n]+[.!?]*/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = m[0];
      const body = raw.trim();
      if (!body) continue;
      const restored = body.replace(/\u0001/g, ".");
      if (/^[a-z]\.$/.test(restored)) continue;                     // 兜底：漏网的缩写残片（如 "m."）不算一句
      out.push({ text: restored, start: m.index + raw.indexOf(body) });
    }
    return out;
  }

  function paragraphs(text) {
    return text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }

  /* ---------- 单句检查 ---------- */
  function checkSentence(sent, isFirst, prevEnd) {
    const s = sent.text, issues = [];
    // 书信称呼/落款不算正文句子，不做语法判定
    if (/^(dear\b|yours (sincerely|faithfully)\b|sincerely\b|best (wishes|regards)\b|respectfully\b)/i.test(s.trim())) return issues;
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){1,2}$/.test(s.trim())) return issues;
    if (/^[A-Z][A-Z\s&'.]{1,}$/.test(s.trim())) return issues;                       // NOTICE 这类全大写标题
    if (/^(the\s+)?students?'?\s+union\b/i.test(s.trim())) return issues;            // 通知落款 The Students' Union
    if (/^(the\s+)?(student|volunteer|english)\s+(union|association|club|society|newspaper)\b/i.test(s.trim())) return issues;
    const add = (start, end, type, msg, fix, sev, note) => {
      issues.push({ s: start, e: end, type, msg, fix, sev: sev || 2, note: note || "" });
    };

    // 全角标点
    const fw = /[，。；：！？（）“”‘’、]/;
    if (fw.test(s)) {
      issues.push({ s: s.search(fw), e: s.search(fw) + 1, type: "punct", msg: "英文作文里用了中文全角标点", fix: null, sev: 1, note: "改成半角 , . ; : ! ? ( ) \" '", whole: true });
    }
    // 句首大写（切开后每句都应大写；小写说明上句缺标点或误写）
    const i0 = s.search(/[a-zA-Z]/);
    if (i0 === 0 && /[a-z]/.test(s[0])) {
      if (/^(and|but|or|so|then|yet|nor|also|which|who|whom|whose)\b/i.test(s))
        add(0, 1, "case", "上一句句号用错了：这里是并列/从句的延续，不该断成新句（改成逗号，或删掉前面的句号）", null, 1);
      else
        add(0, 1, "case", "句首字母应大写（也可能上一句缺了句号）", null, 1);
    }
    // 缺句末标点
    if (!/[.!?]["'”)]?$/.test(s)) add(s.length - 1, s.length, "punct", "句子结尾缺标点", null, 1);

    // 重复词
    let m;
    const dup = /\b(\w+)\s+\1\b/gi;
    while ((m = dup.exec(s))) add(m.index, m.index + m[0].length, "grammar", `重复单词 "${m[1]} ${m[1]}"`, m[1], 2, "删掉一个");

    // a / an
    const an = /\ba\s+([aeiou][a-z]*)\b/gi;
    while ((m = an.exec(s))) {
      if (/^(uni|use|user|usual|one|eu|uk)/i.test(m[1])) continue;
      add(m.index, m.index + m[0].length, "grammar", `"a ${m[1]}" 应为 an ${m[1]}`, "an " + m[1], 2, "元音音素前用 an");
    }
    const a2 = /\ban\s+([bcdfgjklmnpqrstvwxyz][a-z]*)\b/gi;
    while ((m = a2.exec(s))) {
      if (/^(hour|honest|honor|honour|heir)/i.test(m[1])) continue;
      add(m.index, m.index + m[0].length, "grammar", `"an ${m[1]}" 应为 a ${m[1]}`, "a " + m[1], 2, "辅音音素前用 a");
    }

    // 主谓一致：第三人称单数
    const sv = /\b(he|she|it|everyone|everybody|someone|somebody|nobody|each)\s+(go|do|have|make|take|think|believe|say|know|want|need|like|get|come|become|seem|show|help|use|play|study|work|live|feel|find|give|read|write|see|learn|improve|increase|reduce|protect|solve|provide|develop|create|support|achieve|avoid|choose|explain|change|build|bring|call|carry|consider|continue|decide|describe|discuss|enjoy|expect|follow|happen|include|introduce|mean|mention|offer|prefer|prepare|prevent|realize|receive|remain|remember|require|respond|return|teach|understand|visit|wait|watch|worry|share|save|spend|start|stop|try|turn|understand|write|tell|thank|travel|treat|trust|waste|wish)\b/gi;
    while ((m = sv.exec(s))) {
      const base = m[2].toLowerCase();
      let fixed = base;
      if (base === "have") fixed = "has";
      else if (/(ch|sh|ss|x|o)$/.test(base)) fixed = base + "es";
      else if (/[^aeiou]y$/.test(base)) fixed = base.slice(0, -1) + "ies";
      else fixed = base + "s";
      add(m.index, m.index + m[0].length, "grammar", `主谓不一致：${m[1]} 后应用第三人称单数 ${fixed}`, `${m[1]} ${fixed}`, 2, "主语是第三人称单数时，一般现在时动词要加 -s/-es");
      // 并列的第二个谓语也要跟着变
      const rest = s.slice(m.index + m[0].length);
      const co = rest.match(/\band\s+(go|do|have|make|take|think|believe|say|know|want|need|like|get|come|become|seem|show|help|use|play|study|work|live|feel|find|give|read|write|see|learn|improve|increase|reduce|protect|solve|provide|develop|create|support|achieve|avoid|choose|explain|change|build|bring|call|carry|consider|continue|decide|describe|discuss|enjoy|expect|follow|happen|include|introduce|mean|mention|offer|prefer|prepare|prevent|realize|receive|remain|remember|require|respond|return|teach|understand|visit|wait|watch|worry|share|save|spend|start|stop|try|turn|understand|write|tell|thank|travel|treat|trust|waste|wish)\b/i);
      if (co) {
        const b2 = co[1].toLowerCase();
        const f2 = b2 === "have" ? "has" : /(ch|sh|ss|x|o)$/.test(b2) ? b2 + "es" : /[^aeiou]y$/.test(b2) ? b2.slice(0, -1) + "ies" : b2 + "s";
        const st2 = m.index + m[0].length + co.index + co[0].indexOf(co[1]);
        add(st2, st2 + co[1].length, "grammar", `并列谓语也要一致：and ${co[1]} → and ${f2}`, f2, 2, "同一主语的两个谓语都要用第三人称单数");
      }
    }

    // 复数主语 + is/was/has
    const pl = /\b(people|children|students|they|we|you|many|several|others)\s+(is|was|has)\b/gi;
    while ((m = pl.exec(s))) {
      const fix = m[2].toLowerCase() === "is" ? "are" : m[2].toLowerCase() === "was" ? "were" : "have";
      add(m.index, m.index + m[0].length, "grammar", `主谓不一致：${m[1]} 后应用 ${fix}`, `${m[1]} ${fix}`, 2, "复数主语配复数动词");
    }

    // there have/has
    const th = /\bthere\s+(have|has)\s/gi;
    while ((m = th.exec(s))) add(m.index, m.index + m[0].length - 1, "grammar", "There have/has 是中式错误", "There are", 2, "表示“有”用 there be 结构");

    // 双重比较级
    const dc = /\b(more|most)\s+(better|worse|easier|bigger|higher|larger|fewer|less|greater|longer|stronger)\b/gi;
    while ((m = dc.exec(s))) add(m.index, m.index + m[0].length, "grammar", "双重比较级", m[2], 2, "better 本身已是比较级，不能再加 more");

    // 单复数：many/several/various/few/both + 可数名词单数（用词典词性判断）
    const UNCOUNT = new Set(("information knowledge advice furniture equipment traffic progress research evidence money water work time music food news homework luggage baggage machinery scenery wealth education health pollution population staff technology software hardware data").split(" "));
    const PLURAL_OK = new Set(("people children men women feet teeth mice police criteria phenomena media data staff faculty youth".split(" ")));
    const pln = /\b(many|several|various|few|both|these|those|two|three|four|five)\s+([a-z]{3,})\b/gi;
    while ((m = pln.exec(s))) {
      const w = m[2].toLowerCase();
      if (/s$/.test(w) || UNCOUNT.has(w) || PLURAL_OK.has(w)) continue;
      let def = "";
      try { const r = lookup(w); def = (r && r.def) || ""; } catch (e) { }
      if (!/^n\./.test(def)) continue;
      // 后面紧跟名词时，当前词是定语而不是中心词：many college students / many book stores
      const nxt = ((s.slice(m.index + m[0].length).match(/^\s*([A-Za-z]{2,})/) || [])[1] || "").toLowerCase();
      if (nxt) {
        if (/s$/.test(nxt) || PLURAL_OK.has(nxt)) continue;
        let nd = ""; try { const r2 = lookup(nxt); nd = (r2 && r2.def) || ""; } catch (e) { }
        if (/^n\./.test(nd)) continue;
      }
      const fixed = /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : /(ch|sh|ss|x)$/.test(w) ? w + "es" : w + "s";
      add(m.index, m.index + m[0].length, "grammar", `"${m[1]} ${w}" 里 ${w} 是可数名词，要用复数`, `${m[1]} ${fixed}`, 2, "可数名词跟 many/several 时必须用复数形式");
    }

    // 常见搭配
    COLLOC.forEach(([re, fix, msg]) => {
      if (!msg) return;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        const rep = typeof fix === "function" ? fix(m) : fix.replace("$1", m[1] || "");
        add(m.index, m.index + m[0].length, "word", msg, rep, 2, "改：" + rep);
      }
    });

    // 口语词 / 低分表达（只标注，不自动全部替换）
    WORD_UP.forEach(([re, fix, msg]) => {
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        add(m.index, m.index + m[0].length, "style", msg, fix, 1, "可改为：" + fix);
      }
    });

    // 缩写
    const ABBR = { "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "couldn't": "could not", "won't": "will not", "wouldn't": "would not", "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "it's": "it is", "i'm": "I am", "i've": "I have", "we're": "we are", "they're": "they are", "that's": "that is", "there's": "there is" };
    const abbr = /\b(don't|doesn't|didn't|can't|couldn't|won't|wouldn't|isn't|aren't|wasn't|weren't|it's|i'm|i've|we're|they're|that's|there's)\b/gi;
    while ((m = abbr.exec(s))) add(m.index, m.index + m[0].length, "style", `缩写 ${m[0]} 不宜出现在正式写作`, ABBR[m[0].toLowerCase()] || null, 2, "展开为 " + (ABBR[m[0].toLowerCase()] || "完整形式"));

    // 逗号粘连：只有「逗号前是完整分句 + 逗号后另起主谓」才算；过渡词、列举、非限定从句都不算
    (function () {
      const re = /,\s*(i|we|you|they|he|she|it|this|that|there|these|those)\s+([a-z][a-z'’]*)/gi;
      const INTRO = /^(first(ly)?|second(ly)?|third(ly)?|finally|lastly|however|therefore|thus|moreover|furthermore|besides|meanwhile|currently|nowadays|recently|actually|personally|unfortunately|fortunately|indeed|instead|otherwise|similarly|conversely|specifically|generally|obviously|clearly|perhaps|maybe|of course|in addition|in fact|in short|in conclusion|to sum up|to begin with|for example|for instance|as a result|on the one hand|on the other hand|in my (view|opinion)|in recent years|at present|at the same time|after all|above all|all in all|last but not least|what is more|that is|in other words|on the contrary|by contrast|as a matter of fact|to be honest|more importantly|as we all know|needless to say)$/i;
      const AUX = /^(is|are|was|were|am|has|have|had|do|does|did|can|could|will|would|may|might|must|should|shall)$/i;
      const SUBORD = /^(if|when|whenever|while|because|since|as|although|though|even if|even though|unless|until|till|after|before|once|whether|whereas|wherever|so that|in order that|in case|provided|given that|now that|as long as|as soon as|instead of|rather than|despite|in spite of|owing to|due to|thanks to|compared with|according to|in addition to|to begin with)\b/i;
      let m2;
      while ((m2 = re.exec(s))) {
        const pre = s.slice(0, m2.index).trim();
        const pw = pre.split(/\s+/).filter(Boolean);
        if (pw.length < 3) continue;                                   // 逗号前只是一个过渡词 / 短语
        if (INTRO.test(pre) || INTRO.test(pw.slice(-3).join(" "))) continue;
        // 句子以状语从句 / 介词短语 / 分词短语开头时，「从句或短语 + 逗号 + 主句」是合法结构
        if (SUBORD.test(pre)) continue;
        if (/^[A-Z]?[a-z]+(ing|ed)\b/.test(pw[0])) continue;           // Learning that…, I would like…（分词作状语）
        if (INTRO.test(pw[0]) || /^[A-Za-z]+,?$/.test(pw[0]) && INTRO.test(pw[1] || "")) continue;
        if (/\b(and|but|or|so|because|although|though|while|if|when|that|which|who|whom|whose|to|of|in|on|for|with|by|as|than)$/i.test(pw[pw.length - 1])) continue;
        // 逗号前必须有谓语（be/助动词/实义动词），逗号后必须另起主语+谓语
        const hasVerb = /\b(is|are|was|were|am|has|have|had|do|does|did|can|could|will|would|may|might|must|should|[a-z]{3,}(s|ed))\b/i.test(pre)
          || /\b(i|we|you|they|he|she|it)\s+[a-z]{2,}/i.test(pre);   // 主语 + 任意实义动词（含拼错的，如 I recieve…）
        if (!hasVerb) continue;
        if (!AUX.test(m2[2]) && !/^[a-z]{3,}(s|ed)$/i.test(m2[2])) continue;
        add(m2.index, m2.index + 1, "grammar", "逗号粘连（两个完整句子只用逗号连接）", null, 2, "拆成两句，或加 and / because / which 等连接词");
        break;
      }
    })();

    // 超长句
    const wc = (s.match(/[A-Za-z][A-Za-z'’\-]*/g) || []).length;
    if (wc > 38) add(0, 0, "style", `本句 ${wc} 词，偏长`, null, 1, "拆成 2–3 个短句，或用分号 / 从句分层");

    // 拼写
    tokens(s).forEach(tk => {
      const w = tk.w;
      if (w.length < 4) return;
      if (/^[A-Z]/.test(w) && !(isFirst === "lower" && tk.i === 0)) return; // 专有名词跳过
      const r = lookup(w);
      if (r && r.def) return;
      if (spellKnown(w)) return;   // 词表外但确实是真词（如 socket / algorithm / wifi）→ 不报拼写
      const lw = w.toLowerCase();
      if (MISSPELL[lw]) {
        add(tk.i, tk.i + w.length, "spell", `"${w}" 拼写错误`, MISSPELL[lw], 3, `应为 ${MISSPELL[lw]}`);
        return;
      }
      const fx = spellFix(w);
      if (fx && fx.d) {
        add(tk.i, tk.i + w.length, "spell", `"${w}" 疑似拼写错误`, fx.fix, fx.d === 1 ? 3 : 1,
          `可能是 ${fx.fix}${fx.d > 1 ? "（也请确认是否为专有名词）" : ""}`);
      }
    });

    // 先按严重度、再按位置去重叠：重叠时保留更严重的那条
    issues.sort((a, b) => (b.sev || 0) - (a.sev || 0) || a.s - b.s);
    const kept = [];
    issues.forEach(it => {
      if (it.whole) { if (!kept.some(k => k.whole)) kept.push(it); return; }
      if (kept.some(k => !(it.e <= k.s || it.s >= k.e))) return;
      kept.push(it);
    });
    kept.sort((a, b) => a.s - b.s);
    return kept;
  }

  /* ---------- 统计与评分 ---------- */
  const CONN = ["however", "therefore", "moreover", "furthermore", "nevertheless", "consequently", "in addition", "besides", "thus", "meanwhile", "whereas", "although", "while", "because", "since", "as a result", "for instance", "for example", "in contrast", "on the contrary", "firstly", "secondly", "finally", "in conclusion", "to sum up", "overall", "not only", "as well as", "in other words"];
  const ADV = ["significant", "essential", "vital", "crucial", "considerable", "beneficial", "detrimental", "conducive", "fundamental", "substantial", "inevitable", "inevitably", "consequently", "furthermore", "moreover", "nevertheless", "phenomenon", "phenomena", "approach", "perspective", "individual", "individuals", "society", "sustainable", "efficient", "efficiency", "demonstrate", "illustrate", "contribute", "contribution", "acquire", "acquisition", "cultivate", "enhance", "enhancement", "promote", "priority", "tendency", "tend", "awareness", "responsibility", "obligation", "capacity", "potential", "accessible", "accessibility", "comprehensive", "further", "insight", "strategy", "strategic", "innovation", "initiative", "evidence", "factor", "aspect", "measure", "policy", "resource"];

  function analyze(text, opt) {
    opt = opt || {};
    const raw = String(text || "").replace(/\r/g, "");
    const norm = raw.replace(/[ \t]+/g, " ").trim();
    const paras = paragraphs(norm);
    const sents = [];
    let cursor = 0;
    paras.forEach((p, pi) => {
      const ps = splitSentences(p);
      ps.forEach((x, i) => {
        sents.push({ text: x.text, para: pi, idx: sents.length });
      });
    });

    const allIssues = [];
    sents.forEach((x, i) => {
      const prev = i > 0 ? sents[i - 1].text : "";
      const iss = checkSentence(x, "", prev);
      x.issues = iss;
      iss.forEach(it => allIssues.push(Object.assign({ sent: i }, it)));
      x.upgrades = upgradesFor(x);
    });

    // 统计（a.m. / p.m. / e.g. 这类缩写按 1 个词计，而不是按句点切成 2 个）
    const countSrc = norm.replace(/\b([ap])\.m\./gi, "$1m").replace(/\b(e)\.g\./gi, "eg").replace(/\b(i)\.e\./gi, "ie");
    const words = (countSrc.match(/[A-Za-z][A-Za-z'’\-]*/g) || []);
    const lowerWords = words.map(w => w.toLowerCase());
    const uniq = new Set(lowerWords);
    const wordCount = words.length;
    const sentCount = sents.length;
    const avgLen = sentCount ? wordCount / sentCount : 0;
    const ttr = wordCount ? uniq.size / wordCount : 0;
    const connCount = CONN.reduce((n, c) => n + (norm.toLowerCase().split(c).length - 1), 0);
    const advCount = ADV.reduce((n, w) => n + (lowerWords.filter(x => x === w).length), 0);
    const spellN = allIssues.filter(i => i.type === "spell").length;
    const gramN = allIssues.filter(i => i.type === "grammar").length;
    const wordN = allIssues.filter(i => i.type === "word").length;
    const styleN = allIssues.filter(i => i.type === "style").length;
    const punctN = allIssues.filter(i => i.type === "punct").length;
    const hardN = gramN + wordN + spellN;

    // 题目关键词覆盖
    let kwHit = null, kwTotal = 0;
    if (opt.prompt) {
      const PROMPT_STOP = new Set(("suppose suppose you your write writing written letter essay short words word should would could will can may must need not sign name instead directions direction allowed minutes minute part answer sheet question questions based following given topic about explain explaining describe describing propose proposing suggest suggestion suggestions improvement improvements help imagine according example examples paragraph paragraphs note notes read reading listen listening choose choice correct best complete sentence sentences passage passages text article according".split(" ")));
      const kws = (opt.prompt.match(/[A-Za-z][A-Za-z'\-]{3,}/g) || [])
        .map(w => w.toLowerCase()).filter(w => !STOP.has(w) && !PROMPT_STOP.has(w));
      const uniqKw = [...new Set(kws)].slice(0, 12);
      kwTotal = uniqKw.length;
      if (kwTotal) {
        const hit = uniqKw.filter(k => lowerWords.some(w => w.indexOf(k) === 0 || k.indexOf(w) === 0 && w.length > 3));
        kwHit = { hit: hit.length, total: kwTotal, list: hit };
      }
    }

    // ===== 评分：按官方「总体印象评分」五档给分（2016 版《四六级考试大纲》4.1.2）=====
    const target = 120;
    let content = 4;
    if (wordCount < 60) content = 1;
    else if (wordCount < 90) content = 2;
    else if (wordCount < target) content = 3;
    if (kwHit && kwHit.total >= 6 && wordCount >= 80) {
      const r = kwHit.hit / kwHit.total;
      if (r < 0.25) content = Math.max(1, content - 2);
      else if (r < 0.4) content = Math.max(1, content - 1);
    }

    // 结构检查（三段式 + 段落功能）
    const firstPara = paras[0] || "";
    // 结尾段 = 从后往前找到的第一段「非书信落款」；落款（Yours sincerely, Li Ming）不是结尾段
    const isSignOff = p => {
      const t = p.trim();
      return t.split(/\s+/).filter(Boolean).length <= 10 &&
        /^(yours\b|sincerely\b|best (wishes|regards)\b|respectfully\b|truly yours\b|faithfully yours\b|li ming\b|looking forward to\b)/i.test(t);
    };
    const tailParas = paras.slice().reverse().filter(p => !isSignOff(p));
    const lastPara = tailParas[0] || "";
    const prevPara = tailParas[1] || "";
    const firstHits = kwHit ? kwHit.list.filter(k => firstPara.toLowerCase().indexOf(k) >= 0).length : 0;
    const hasOpening = /(nowadays|recently|in recent years|with the (rapid )?development|when it comes to|as (is )?(shown|depicted|can be seen)|there is a (growing|heated))/i.test(firstPara) || firstHits > 0;
    const hasTopicSent = /(\bfirst(ly)?\b|to begin with|for one thing|on the one hand|first of all|above all|\bsecond(ly)?\b|in addition|moreover)/i.test(norm);
    // 总结句：显式总结词 + 书信收尾语 + 末段表态/建议句（这几种都算「写完了」）
    const CONCL_MARK = /(in conclusion|to conclude|in summary|to summarize|to sum up|summing up|all in all|in a word|in short|in brief|in a nutshell|on the whole|\boverall\b|all things considered|in the final analysis|from what has been (discussed|mentioned|stated) above|from the above (analysis|discussion)|taking all (these|the) (factors )?into (consideration|account)|based on the (above )?analysis|for (these|the above) reasons|therefore|\bthus\b|\bhence\b|consequently|as a (result|consequence)|accordingly|only in this way|only by (doing so|doing this)|it is (high time|necessary|imperative|advisable)|in my (opinion|view)|from my (point of view|perspective)|as far as i am concerned|personally|i (firmly |strongly )?believe|we can (safely )?conclude)/i;
    const LETTER_END = /(look(ing)? forward to|thank(s| you) (you )?for your (consideration|time|attention|help|reading|support)|thank you|i would (greatly )?appreciate|i would be (very )?(grateful|thankful)|please (feel free|do not hesitate|contact)|i hope (my|this|these|it|you)|hope (to hear|you))/i;
    const ACT_END = /((we|people|students|everyone|the government|schools?|parents|you)\s+(should|must|need to|ought to|have to)\b|it is (high time|necessary|imperative|advisable)|\blet us\b|\blet's\b)/i;
    const lastSents = splitSentences(lastPara);
    const lastOne = lastSents.length ? lastSents[lastSents.length - 1].text : "";
    const STANCE_END = /\b(should|must|ought to|need to|had better|is (necessary|essential|important|advisable)|are (necessary|essential))\b/i;
    const STANCE_1P = /\b(i (think|believe|hope|wish|am convinced|am sure|feel)|we (should|must|need|can))\b/i;
    const hasConclusion = CONCL_MARK.test(lastPara) || LETTER_END.test(lastPara) || ACT_END.test(lastPara)
      || (STANCE_END.test(lastOne) && lastSents.length <= 4) || STANCE_1P.test(lastOne)
      || (CONCL_MARK.test(prevPara) && lastSents.length <= 2);
    // 主体段：去掉书信称呼 / 落款后，首段是开头，末段是结尾，中间才是主体
    const isLetter = /^(dear|to whom it may concern)\b/i.test((paras[0] || "").trim());
    const bodyParas = paras.filter((p, i) => !(i === 0 && /^(dear|to whom it may concern)\b/i.test(p.trim())) && !isSignOff(p));
    const mainParas = bodyParas.length >= 3 ? bodyParas.slice(1, bodyParas.length - 1) : bodyParas.slice(1);
    // 书信体一段常只写 1–2 句，按「主体部分总句数」看；议论文看每段平均句数
    const mainSentCount = isLetter
      ? bodyParas.reduce((n, p) => n + splitSentences(p).length, 0)
      : (mainParas.length ? mainParas.reduce((n, p) => n + splitSentences(p).length, 0) / mainParas.length : 0);
    if (firstHits === 0 && kwHit && kwHit.total >= 5 && wordCount >= 80) content = Math.max(1, content - 1);
    const structureChecks = [
      { ok: paras.length >= 3, t: "三段式：开头 + 主体 + 结尾", hint: "四级议论文/书信最稳的结构，缺段直接降档" },
      { ok: hasOpening, t: "首段点题（现象句或观点句）", hint: "前两句就要出现题目关键词或明确立场" },
      { ok: hasTopicSent, t: "主体段有逻辑标记（First / For one thing / In addition）", hint: "阅卷老师靠这些词判断「连贯」" },
      { ok: hasConclusion, t: "结尾有收束句（总结词 / 建议号召 / 观点表态 / 书信收尾）", hint: "没有收束句会显得没写完" },
      { ok: mainSentCount >= (isLetter ? 3 : 4), t: isLetter ? "主体部分 ≥3 句（要点 + 理由）" : "主体段每段 ≥4 句（观点 + 解释 + 例子）", hint: isLetter ? "书信要把每个要点的理由写开一句" : "主体段是拿分主力，句子太少论证不足" }
    ];

    let structure = 3;
    if (paras.length < 2) structure = 1;
    else if (paras.length === 2) structure = 2;
    if (connCount < 2) structure = Math.max(1, structure - 1);
    if (!hasConclusion) structure = Math.max(1, structure - 1);
    if (wordCount < 60) structure = Math.min(structure, 2);

    const per100 = wordCount ? hardN * 100 / wordCount : 99;
    let language = 5;
    if (per100 > 1.2) language = 4;
    if (per100 > 2.5) language = 3;
    if (per100 > 4.5) language = 2;
    if (per100 > 7) language = 1;
    if (gramN > 8) language = Math.max(1, language - 1);

    let vocab = 3;
    if (ttr < 0.42 || avgLen < 9) vocab = 2;
    if (ttr < 0.34 || (advCount === 0 && connCount < 3)) vocab = 1;
    if (ttr >= 0.52 && advCount >= 3 && avgLen >= 14) vocab = 3;

    // 模板/套话密度（模板是用来搭架子的，堆多了反而失分）
    const TPL = [
      [/with the (rapid )?development of/i, "With the development of…"],
      [/as far as i am concerned/i, "As far as I am concerned"],
      [/every coin has two sides/i, "Every coin has two sides"],
      [/it is universally acknowledged/i, "It is universally acknowledged that…"],
      [/last but not least/i, "Last but not least"],
      [/in a word/i, "In a word"],
      [/only in this way can we/i, "Only in this way can we…"],
      [/it is high time that/i, "It is high time that…"],
      [/there is no doubt that/i, "There is no doubt that…"],
      [/plays? an important role in/i, "play an important role in"],
      [/more and more people/i, "more and more people"]
    ];
    const tplHits = TPL.map(([re, name]) => re.test(norm) ? name : null).filter(Boolean);

    // 硬规则：段数上限 + 字数扣分
    const deductions = [];
    let cap = 15;
    if (paras.length <= 1) { cap = 4; deductions.push({ t: "只写了 1 段：按阅卷口径，只写一段的作文只能给 0–4 分。", v: "≤4 分" }); }
    else if (paras.length === 2) { cap = 9; deductions.push({ t: "只写了 2 段：规定三段的作文只写两段，最高 9 分。", v: "≤9 分" }); }
    let penalty = 0;
    if (wordCount > 0 && wordCount < 120) {
      penalty = Math.min(4, Math.ceil((120 - wordCount) / 10));
      deductions.push({ t: `字数 ${wordCount}，比 120 词少 ${120 - wordCount} 词；每少 10 词扣 1 分 → 扣 ${penalty} 分。`, v: "-" + penalty });
    }
    if (wordCount > 210) deductions.push({ t: `字数 ${wordCount}，超出 180 词较多：不直接扣分，但篇幅冗余容易稀释论点、增加错误。`, v: "提示" });
    const kwRatio = kwHit && kwHit.total >= 5 ? kwHit.hit / kwHit.total : null;
    if (kwRatio !== null && kwRatio < 0.15 && wordCount >= 80) {
      content = 1; cap = Math.min(cap, 8);
      deductions.push({ t: `与题目关键词重合度过低（${kwHit.hit}/${kwHit.total}）：疑似偏题，按「基本切题」封顶 9 分处理。`, v: "偏题" });
    }
    if (tplHits.length >= 4 && advCount < 3) deductions.push({ t: `检测到 ${tplHits.length} 处模板套话，但具体观点/例子偏少——模板堆砌会被判「内容空洞」。`, v: "提示" });

    const rawTotal = content + structure + language + vocab;
    let total = Math.min(rawTotal - penalty, cap);
    if (wordCount < 15) total = 0;            // 白卷/只有几个孤立的词 → 0 分
    else total = Math.max(1, total);          // 只要成篇，最低落到 2 分档（1–3）

    const BANDS = [
      { k: "14 分档", r: "13–15", min: 13, max: 15, desc: "切题。表达思想清楚，文字通顺、连贯，基本上无语言错误，仅有个别小错。" },
      { k: "11 分档", r: "10–12", min: 10, max: 12, desc: "切题。表达思想清楚，文字连贯，但有少量语言错误。" },
      { k: "8 分档", r: "7–9", min: 7, max: 9, desc: "基本切题。有些地方表达思想不够清楚，文字勉强连贯，语言错误相当多，其中有一些是严重错误。" },
      { k: "5 分档", r: "4–6", min: 4, max: 6, desc: "基本切题。表达思想不清楚，连贯性差，有较多的严重语言错误。" },
      { k: "2 分档", r: "1–3", min: 1, max: 3, desc: "条理不清，思路紊乱，语言支离破碎或大部分句子均有错误，且多数是严重错误。" }
    ];
    const band = total <= 0
      ? { k: "0 分", r: "0", min: 0, max: 0, desc: "未作答，或只有几个孤立的词，或作文与主题毫不相关。" }
      : (BANDS.find(b => total >= b.min && total <= b.max) || BANDS[4]);

    // 为什么落在这个档（对照官方档位描述）
    const reasons = [];
    if (wordCount < 120) reasons.push(`篇幅：${wordCount} 词，低于 120 词的硬要求，先扣 ${penalty} 分再看语言。`);
    else reasons.push(`篇幅：${wordCount} 词，达到 120–180 词要求。`);
    if (kwHit && kwHit.total >= 5) reasons.push(`切题：题目关键词命中 ${kwHit.hit}/${kwHit.total}${kwHit.hit / kwHit.total < 0.4 ? "，偏少，容易被判「基本切题」而非「切题」" : "，扣题没问题"}。`);
    if (per100 <= 1.5) reasons.push(`语言：严重错误约 ${per100.toFixed(1)} 处/百词，够得上「基本无语言错误」。`);
    else if (per100 <= 2.5) reasons.push(`语言：严重错误约 ${per100.toFixed(1)} 处/百词（${hardN} 处），属于「少量语言错误」。`);
    else reasons.push(`语言：严重错误约 ${per100.toFixed(1)} 处/百词（${hardN} 处），偏多，够不上 11 分档的「少量语言错误」。`);
    reasons.push(`连贯：连接词 ${connCount} 处，${connCount < 3 ? "偏少，难判「文字连贯」" : "基本能撑起行文逻辑"}；平均句长 ${avgLen.toFixed(1)} 词。`);

    // 升一档要做什么（只给最关键的 3–4 条）
    const next = [];
    if (wordCount < 120) next.push(`补到 130–150 词：每个理由后加一句「解释 + 小例子」，不要凑空话。`);
    if (per100 > 2.5) next.push(`把错误密度压到每百词 2 处以内：先改下面标红的语法/搭配错误，写不准的复杂句就换成正确的简单句。`);
    if (connCount < 3) next.push(`补 3 个连接词：表原因 For one thing / 表递进 Moreover / 表转折 However / 结尾 In conclusion。`);
    if (avgLen < 12) next.push(`把 2 处短句合并升级（见下方「简单句 → 高级句」），让句式有长短变化。`);
    if (!hasConclusion) next.push(`结尾加一句总结：In conclusion, … / Only in this way can we …。`);
    if (tplHits.length >= 4) next.push(`别只堆模板：${tplHits.slice(0, 3).join("、")} 这类套话保留 1–2 处即可，其余换成题目里的具体信息。`);
    if (!next.length) next.push(`已经很接近满档，注意别在考场上超时，留 3 分钟检查主谓一致和拼写。`);

    // 自动评语
    const c = [];
    if (wordCount < 90) c.push(`全文 ${wordCount} 词，四级要求 120–180 词，篇幅明显不足，内容展开不够。`);
    else if (wordCount < 120) c.push(`全文 ${wordCount} 词，离 120 词还差一点，建议每段再补一句例证或原因。`);
    else if (wordCount > 200) c.push(`全文 ${wordCount} 词，偏长，注意控制在 180 词内，避免跑题和出错增多。`);
    else c.push(`全文 ${wordCount} 词，篇幅合适。`);
    if (paras.length < 3) c.push(`只有 ${paras.length} 段，建议写成三段：观点 → 理由/例证 → 结论。`);
    else c.push(`共 ${paras.length} 段，结构层次清楚。`);
    if (gramN + wordN + spellN > 0) c.push(`语言层面共发现 ${hardN} 处可改之处（语法 ${gramN}、搭配/用词 ${wordN}、拼写 ${spellN}），其中高危 ${allIssues.filter(i => i.sev >= 3).length} 处。`);
    else c.push("没有发现明显的语法或拼写错误，语言准确度不错。");
    if (connCount < 3) c.push(`连接词只用了 ${connCount} 处，建议补 however / therefore / moreover / in conclusion 之类的过渡。`);
    else c.push(`用了 ${connCount} 处连接词，行文衔接较好。`);
    if (avgLen < 10) c.push("平均句长偏短（" + avgLen.toFixed(1) + " 词），通篇简单句会压分，下面给了句式升级建议。");
    else c.push("平均句长 " + avgLen.toFixed(1) + " 词，长短句搭配尚可。");
    if (advCount < 3) c.push("高级词汇偏少，可以主动用 2–3 个（conducive / detrimental / contribute to / it is imperative that…）。");

    return {
      raw, norm, paras, sents, issues: allIssues,
      stats: { wordCount, sentCount, paras: paras.length, avgLen, ttr, connCount, advCount, spellN, gramN, wordN, styleN, punctN, kwHit, per100, tplHits },
      score: {
        content, structure, language, vocab, total, raw: rawTotal, penalty, cap,
        band: band.k, range: band.r, desc: band.desc, deductions, reasons, next
      },
      structureChecks,
      comments: c
    };
  }

  /* ---------- 高亮 ---------- */
  const TYPE_CLS = { spell: "e-spell", grammar: "e-gram", word: "e-word", style: "e-style", punct: "e-punct", case: "e-punct" };
  function markSentence(text, issues) {
    if (!issues || !issues.length) return esc(text);
    const segs = [];
    let pos = 0;
    issues.slice().sort((a, b) => a.s - b.s).forEach(it => {
      const s = Math.max(0, Math.min(it.s, text.length)), e = Math.max(s + 1, Math.min(it.e, text.length));
      if (s < pos) return;
      segs.push(esc(text.slice(pos, s)));
      segs.push(`<mark class="${TYPE_CLS[it.type] || "e-style"}" title="${esc(it.msg)}">${esc(text.slice(s, e))}</mark>`);
      pos = e;
    });
    segs.push(esc(text.slice(pos)));
    return segs.join("");
  }

  /* ---------- 快速纠错（用于句式升级后的再校正） ---------- */
  const ABBR2 = { "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "couldn't": "could not", "won't": "will not", "wouldn't": "would not", "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "it's": "it is", "i'm": "I am", "i've": "I have", "we're": "we are", "they're": "they are", "that's": "that is", "there's": "there is" };
  function quickFix(str) {
    let t = String(str);
    COLLOC.forEach(([re, fix, msg]) => {
      if (!msg) return;
      re.lastIndex = 0;
      t = t.replace(re, (...a) => typeof fix === "function" ? fix(a) : fix.replace("$1", a[1] || ""));
    });
    t = t.replace(/\ba\s+([aeiou][a-z]*)\b/gi, (mo, w) => /^(uni|use|user|usual|one|eu|uk)/i.test(w) ? mo : "an " + w);
    t = t.replace(/\ban\s+([bcdfgjklmnpqrstvwxyz][a-z]*)\b/gi, (mo, w) => /^(hour|honest|honor|honour|heir)/i.test(w) ? mo : "a " + w);
    t = t.replace(/\b(more|most)\s+(better|worse|easier|bigger|higher|larger|fewer|less|greater|longer|stronger)\b/gi, (m, g1, g2) => g2);
    t = t.replace(/\b(don't|doesn't|didn't|can't|couldn't|won't|wouldn't|isn't|aren't|wasn't|weren't|it's|i'm|i've|we're|they're|that's|there's)\b/gi, m => ABBR2[m.toLowerCase()] || m);
    t = t.replace(/\b(many|several|various|few|both|these|those)\s+([a-z]{3,})\b/gi, (mo, det, w) => {
      const lw = w.toLowerCase();
      const UN = "information knowledge advice furniture equipment traffic progress research evidence money water work time music food news homework luggage baggage machinery scenery wealth education health pollution population staff technology software hardware data people children";
      if (/s$/.test(lw) || UN.indexOf(lw) >= 0) return mo;
      let def = "";
      try { const r = lookup(lw); def = (r && r.def) || ""; } catch (e) { }
      if (!/^n\./.test(def)) return mo;
      const fx = /[^aeiou]y$/.test(lw) ? lw.slice(0, -1) + "ies" : /(ch|sh|ss|x)$/.test(lw) ? lw + "es" : lw + "s";
      return det + " " + fx;
    });
    return t.replace(/\s+/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
  }

  /* ---------- 改写 ---------- */
  function rewrite(report, opts) {
    opts = opts || {};
    const useUp = opts.upgrades || {};   // {sentIndex: 0|1}
    const fixAll = opts.fix !== false;
    const out = [];
    report.sents.forEach((x, i) => {
      let t = x.text;
      if (fixAll && x.issues && x.issues.length) {
        const fixes = x.issues.filter(it => it.fix && it.sev >= 2).sort((a, b) => b.s - a.s);
        const used = [];
        fixes.forEach(it => {
          if (used.some(u => !(it.e <= u.s || it.s >= u.e))) return;
          t = t.slice(0, it.s) + it.fix + t.slice(it.e);
          used.push(it);
        });
      }
      const k = useUp[i];
      if (k != null && x.upgrades && x.upgrades[k]) t = x.upgrades[k].to;
      if (fixAll) t = quickFix(t);
      t = t.trim();
      if (t) {
        t = t.charAt(0).toUpperCase() + t.slice(1);
        if (!/[.!?]["'”)]?$/.test(t)) t += ".";
      }
      out.push({ para: x.para, text: t });
    });
    // 组装段落
    const byPara = {};
    out.forEach(o => { (byPara[o.para] = byPara[o.para] || []).push(o.text); });
    return Object.keys(byPara).sort((a, b) => a - b).map(k => byPara[k].join(" ")).join("\n\n");
  }

  window.Essay = { analyze, markSentence, rewrite, esc, quickFix };
})();
