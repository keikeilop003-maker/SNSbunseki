const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 4173);
const CLASS_CODE = process.env.CLASS_CODE || "kokugo2026";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "cases.json");
const USER_FILE = path.join(DATA_DIR, "users.json");

const seedCases = [
  {
    id: "sample-1",
    title: "短い動画の切り抜きから批判が集中した事例",
    author: "1A00",
    group: "1",
    image: "",
    summary:
      "文化祭の準備中に撮影された短い動画が投稿され、一部の発言だけが拡散された。前後の会話は写っておらず、投稿から数時間で批判的な引用が増えた。",
    analysisFactEmotion:
      "確認できる事実は、短い動画が投稿され、その一部の発言に批判が集まったこと。感情的な訴えかけとしては、「絶対に許せない」「学校全体の問題だ」といった強い表現が目立つ。",
    analysisBias:
      "発言者を最初から悪者として見る投稿だけが集まりやすく、前後の事情を確認する声は届きにくくなっている。敵味方の構図にすると理解しやすいが、状況の複雑さが抜け落ちる。",
    analysisPressure:
      "批判に同調しない人が「擁護している」と見なされる空気がある。疑問を出すだけでも攻撃対象になり、別の解釈を言いにくい。",
    analysisQuestions:
      "撮影されていない前後の状況をどう扱うべきか。被害を訴える人の声を尊重しながら、確認できない情報で個人を断定しない方法はあるか。",
    comments: [
      {
        author: "1A02",
        body: "発言の問題点を考えることと、本人の人格全体を決めつけることは分けたほうがよいと思いました。",
        createdAt: "2026-05-30T09:00:00.000Z",
      },
    ],
    createdAt: "2026-05-30T09:00:00.000Z",
  },
  {
    id: "sample-2",
    title: "企業広告への違和感が不買運動に広がった事例",
    author: "1A00",
    group: "2",
    image: "",
    summary:
      "企業広告の表現に対して、特定の属性を軽く扱っているのではないかという指摘が投稿された。その後、賛否の投稿が増え、不買を呼びかける投稿も現れた。",
    analysisFactEmotion:
      "事実としては広告表現への批判と企業への反応要求が起きている。感情面では、傷ついたという訴え、表現の自由が狭まるという不安、企業への怒りが混在している。",
    analysisBias:
      "自分がもともと持っている企業イメージや社会問題への立場に合う情報だけを集めやすい。広告を「差別的」か「過剰反応」かの二択で見る物語が強い。",
    analysisPressure:
      "不買に参加するかどうかが、倫理的な態度の証明のように扱われる場面がある。一方で、批判した人を一括りにして否定する排除も起きている。",
    analysisQuestions:
      "表現を批判することと、表現者を攻撃することの境界はどこか。企業はどの段階で説明や修正をするべきか。",
    comments: [],
    createdAt: "2026-05-30T09:10:00.000Z",
  },
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(seedCases, null, 2), "utf8");
  }
}

async function ensureUserFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USER_FILE);
  } catch {
    await fs.writeFile(USER_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readCases() {
  await ensureDataFile();
  return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
}

async function writeCases(cases) {
  await fs.writeFile(DATA_FILE, JSON.stringify(cases, null, 2), "utf8");
}

async function readUserIcons() {
  await ensureUserFile();
  return JSON.parse(await fs.readFile(USER_FILE, "utf8"));
}

async function writeUserIcons(userIcons) {
  await fs.writeFile(USER_FILE, JSON.stringify(userIcons, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  return req.headers["x-class-code"] === CLASS_CODE;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidPosterSerial(value) {
  return /^1[A-H][0-9]{2}$/.test(value);
}

function isValidGroup(value) {
  return /^(?:[1-9]|10)$/.test(String(value || ""));
}

function cleanIconUrl(value) {
  const text = cleanText(value, 1000);
  if (!text) {
    return "";
  }
  if (/^assets\/icons\/icon-(0[1-9]|1[0-9]|20)\.svg$/.test(text)) {
    return text;
  }
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? text : "";
  } catch {
    return "";
  }
}

function normalizeCase(caseItem, userIcons = {}) {
  return {
    ...caseItem,
    group: isValidGroup(caseItem.group) ? String(caseItem.group) : "1",
    occurrenceDate: caseItem.occurrenceDate || "",
    parties: caseItem.parties || "",
    analysisQuestions: caseItem.analysisQuestions || "",
    authorIcon: userIcons[caseItem.author] || caseItem.authorIcon || "",
    comments: (Array.isArray(caseItem.comments) ? caseItem.comments : []).map((comment) => ({
      ...comment,
      authorIcon: userIcons[comment.author] || comment.authorIcon || "",
    })),
  };
}

async function handleApi(req, res, url) {
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cases") {
    const userIcons = await readUserIcons();
    sendJson(res, 200, (await readCases()).map((caseItem) => normalizeCase(caseItem, userIcons)));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cases") {
    const body = await readBody(req);
    const cases = await readCases();
    const author = cleanText(body.author, 4).toUpperCase();
    if (!isValidPosterSerial(author)) {
      sendJson(res, 400, { error: "Invalid poster serial" });
      return;
    }
    const group = cleanText(body.group, 2);
    if (!isValidGroup(group)) {
      sendJson(res, 400, { error: "Invalid group" });
      return;
    }
    const authorIcon = cleanIconUrl(body.authorIcon);
    if (authorIcon) {
      const userIcons = await readUserIcons();
      userIcons[author] = authorIcon;
      await writeUserIcons(userIcons);
    }
    const newCase = {
      id: crypto.randomUUID(),
      title: cleanText(body.title, 80),
      occurrenceDate: cleanText(body.occurrenceDate, 80),
      parties: cleanText(body.parties, 120),
      author,
      authorIcon,
      group,
      image: "",
      summary: cleanText(body.summary, 4000),
      analysisFactEmotion: cleanText(body.analysisFactEmotion, 4000),
      analysisBias: cleanText(body.analysisBias, 4000),
      analysisPressure: cleanText(body.analysisPressure, 4000),
      analysisQuestions: "",
      comments: [],
      createdAt: new Date().toISOString(),
    };
    cases.push(newCase);
    await writeCases(cases);
    sendJson(res, 201, newCase);
    return;
  }

  const caseMatch = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
  if (req.method === "GET" && caseMatch) {
    const cases = await readCases();
    const userIcons = await readUserIcons();
    const item = cases.find((caseItem) => caseItem.id === caseMatch[1]);
    sendJson(res, 200, item ? normalizeCase(item, userIcons) : null);
    return;
  }

  const commentMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/comments$/);
  if (req.method === "POST" && commentMatch) {
    const body = await readBody(req);
    const cases = await readCases();
    const item = cases.find((caseItem) => caseItem.id === commentMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const author = cleanText(body.author, 4).toUpperCase();
    if (!isValidPosterSerial(author)) {
      sendJson(res, 400, { error: "Invalid commenter serial" });
      return;
    }
    const authorIcon = cleanIconUrl(body.authorIcon);
    if (authorIcon) {
      const userIcons = await readUserIcons();
      userIcons[author] = authorIcon;
      await writeUserIcons(userIcons);
    }
    const userIcons = await readUserIcons();
    const comment = {
      author,
      authorIcon: userIcons[author] || "",
      body: cleanText(body.body, 2000),
      createdAt: new Date().toISOString(),
    };
    item.comments.push(comment);
    await writeCases(cases);
    sendJson(res, 201, comment);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SNS analysis board: http://localhost:${PORT}`);
  console.log(`Class code: ${CLASS_CODE}`);
});
