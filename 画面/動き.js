// おはなし の画面。会話はサーバーが SQLite にしまい、画面は送る前と答えの後に発言を保存します。
// 答えは WebSocket(ws)で受け取ります。{"conversation":番号} を送ると、1つずつの JSON
// ({"content"}・{"thinking"}・{"stats"}・{"error"})が届き、最後に {"done":true} が届きます。
// {"web":true} も送ると、サーバーが先にウェブで調べて {"sources":[…]}(できなければ {"notice":…})を送ります。
// 出典は答えの終わりに Markdown の番号付きの一覧として足して、答えといっしょに保存します。
// {"code":true} も送ると、モデルが砂場(Docker のコンテナ)でコマンドを動かします。動かす前に {"running":…}、
// 動かした後に {"tool":…} が届くので、コマンドと出力を答えの中に Markdown のコードの塊として足します。
// {"github":true} も送ると、モデルが会話のリポジトリ(⚙ で足す。Read か Write)を GitHub から読みます。
// Write のリポジトリには、モデルが確かめずに issue を書きます(github_issue)。
// 読む前に {"running":…}、読んだ後に {"tool":{"name":"github_…","summary":…}} が届き、summary の1行を答えに残します。
// WebSocket につなげないときは、POST api/chat で同じ JSON を1行ずつ受け取ります。

const $ = (id) => document.getElementById(id);
const 会話欄 = $("会話");
const 文欄 = $("文");
const 送るボタン = $("送る");
const 止めるボタン = $("止める");
const モデル欄 = $("モデル");
const 題欄 = $("題");
const ウェブボタン = $("ウェブ");
const 砂場ボタン = $("砂場");
const GitHubボタン = $("GitHub");

let 今 = null;          // 開いている会話 {id, title, model, system, temperature, messages}
let 中断 = null;        // 答えを受け取っている間の AbortController
let 接続 = null;        // 開いている WebSocket
let WebSocket可 = true; // つなげなかったら、fetch に切り替える
let モデル群 = [];
let 新規倉 = [];        // まだ会話を作っていないときに ⚙ で足したリポジトリ
let 許可倉 = [];        // サーバーが許しているリポジトリ(--github-repos)。空ならどれでも足せる
let 倉案内文 = "";

// --- サーバーとのやりとり ---

async function API(道, 方法 = "GET", 本文) {
  const r = await fetch("api/" + 道, {
    method: 方法,
    headers: 本文 === undefined ? {} : { "Content-Type": "application/json" },
    body: 本文 === undefined ? undefined : JSON.stringify(本文),
  });
  const j = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j;
}

function 保存値(名, 既定) {
  try { return localStorage.getItem(名) ?? 既定; } catch { return 既定; }
}
function 保存する(名, 値) {
  try { localStorage.setItem(名, 値); } catch { /* 覚えられなくてもよい */ }
}

// --- 知らせ ---

function 知らせる(文, 種類 = "誤り") {
  const el = $("知らせ");
  el.textContent = "";
  if (!文) { el.hidden = true; return; }
  el.className = 種類;
  el.append(文);
  el.hidden = false;
}

// --- モデル ---

async function モデル読込() {
  try {
    const j = await API("models");
    モデル群 = j.models;
    if (モデル群.length === 0) 知らせる("Ollama にモデルがありません。ターミナルで「ollama pull llama3.2」のように入れてから、読み込み直してください。");
    else 知らせる("");
  } catch (e) {
    モデル群 = [];
    知らせる(`Ollama につながりません。Ollama を起動してから読み込み直してください(${e.message})`);
  }
  モデル欄表示();
}

function 既定モデル() {
  const 前 = 保存値("モデル", "");
  return モデル群.includes(前) ? 前 : (モデル群[0] || "");
}

function モデル欄表示() {
  const 選ぶ = 今 ? 今.model : 既定モデル();
  モデル欄.textContent = "";
  const 名群 = [...モデル群];
  if (選ぶ && !名群.includes(選ぶ)) 名群.unshift(選ぶ); // 消したモデルの会話でも名前は出す
  for (const 名 of 名群) {
    const o = document.createElement("option");
    o.value = 名;
    o.textContent = モデル群.includes(名) ? 名 : `${名}(ありません)`;
    モデル欄.append(o);
  }
  モデル欄.value = 選ぶ;
  モデル欄.disabled = 名群.length === 0;
}

モデル欄.addEventListener("change", async () => {
  保存する("モデル", モデル欄.value);
  if (今) 今 = await API(`conversations/${今.id}`, "PUT", { model: モデル欄.value });
});

// --- 会話の一覧 ---

function いつ(秒) {
  const d = new Date(秒 * 1000);
  const 今日 = new Date();
  if (d.toDateString() === 今日.toDateString()) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

// 検索欄に言葉があれば、その言葉を含む会話だけを出す
async function 一覧読込() {
  const 語 = 検索欄.value.trim();
  let 群 = [];
  try {
    群 = 語 ? await API("search", "POST", { q: 語 }) : await API("conversations");
  } catch (e) { 知らせる(`会話の一覧を読めませんでした(${e.message})`); }
  if (語 !== 検索欄.value.trim()) return; // 待つ間に言葉が変わった
  const 欄 = $("一覧");
  欄.textContent = "";
  if (語 && 群.length === 0) {
    const p = document.createElement("p");
    p.className = "淡 小字 見つからない";
    p.textContent = `「${語}」を含む会話はありません`;
    欄.append(p);
  }
  for (const c of 群) {
    const 行 = document.createElement("div");
    行.className = "項目" + (今 && 今.id === c.id ? " 今" : "");
    const a = document.createElement("a");
    a.href = `#${c.id}`;
    const 題 = document.createElement("span");
    題.className = "項目題";
    印付け(題, c.title || "新しい会話", 語);
    const 下 = document.createElement("span");
    下.className = "淡 小字";
    下.textContent = `${いつ(c.updated)} · ${c.model}`;
    a.append(題, 下);
    if (語 && c.snippet) {
      const 抜 = document.createElement("span");
      抜.className = "抜粋 小字";
      印付け(抜, 抜粋にする(c.snippet, 語), 語);
      a.append(抜);
    }
    a.addEventListener("click", () => {
      強調語 = 語;
      if (今 && 今.id === c.id) { 印消し(); 本文に印付け(); 横欄閉じる(); }
    });
    const 消 = document.createElement("button");
    消.type = "button";
    消.className = "消す";
    消.textContent = "🗑";
    消.title = "この会話を消す";
    消.addEventListener("click", (e) => 消す確認(e, 消, c.id));
    行.append(a, 消);
    欄.append(行);
  }
}

// --- 検索 ---

const 検索欄 = $("検索");
let 強調語 = "";   // 検索から開いた会話で、印を付ける言葉
let 検索予定 = null;

function 検索予約() {
  clearTimeout(検索予定);
  検索予定 = setTimeout(一覧読込, 250);
}
検索欄.addEventListener("input", (e) => { if (!e.isComposing) 検索予約(); });
検索欄.addEventListener("compositionend", 検索予約);
検索欄.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { 検索欄.value = ""; 強調語 = ""; 一覧読込(); 印消し(); }
  if (e.key === "Enter" && !変換中(e)) { e.preventDefault(); clearTimeout(検索予定); 一覧読込(); }
});
検索欄.addEventListener("search", () => { if (!検索欄.value) { 強調語 = ""; 一覧読込(); 印消し(); } });

function 正規逃避(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// 文の中の 語 に <mark> を付けて el に入れる(大文字小文字は区別しない)
function 印付け(el, 文, 語) {
  el.textContent = "";
  if (!語) { el.textContent = 文; return; }
  const 部分 = 文.split(new RegExp(`(${正規逃避(語)})`, "i"));
  部分.forEach((p, i) => {
    if (i % 2 === 1) { const m = document.createElement("mark"); m.textContent = p; el.append(m); }
    else if (p) el.append(p);
  });
}

// サーバーは見つかった所の前 30 文字から 120 文字を返すので、端を「…」にして改行を詰める
function 抜粋にする(文, 語) {
  const 一行 = 文.replace(/\s+/g, " ").trim();
  const 位置 = 一行.toLowerCase().indexOf(語.toLowerCase());
  return (位置 > 20 ? "…" + 一行.slice(位置 - 20) : 一行).slice(0, 80) + (一行.length > 80 ? "…" : "");
}

// 開いた会話の中の 強調語 に印を付け、最初の所まで送る
function 本文に印付け() {
  if (!強調語) return;
  const 正規 = new RegExp(正規逃避(強調語), "i");
  const 最初 = [];
  for (const 本 of 会話欄.querySelectorAll(".発言 .本文")) {
    const 歩 = document.createTreeWalker(本, NodeFilter.SHOW_TEXT);
    const 節群 = [];
    while (歩.nextNode()) if (正規.test(歩.currentNode.nodeValue)) 節群.push(歩.currentNode);
    for (const 節 of 節群) {
      const 断 = document.createDocumentFragment();
      const 部分 = 節.nodeValue.split(new RegExp(`(${正規逃避(強調語)})`, "i"));
      部分.forEach((p, i) => {
        if (i % 2 === 1) { const m = document.createElement("mark"); m.textContent = p; 断.append(m); 最初.push(m); }
        else if (p) 断.append(p);
      });
      節.replaceWith(断);
    }
  }
  if (最初.length) 最初[0].scrollIntoView({ block: "center" });
}

function 印消し() {
  for (const m of 会話欄.querySelectorAll(".本文 mark")) m.replaceWith(m.textContent);
}

// 1回目で「消す?」になり、もう1回押すと消す
function 消す確認(e, ボタン, 番号) {
  e.preventDefault();
  if (!ボタン.classList.contains("確認")) {
    ボタン.classList.add("確認");
    ボタン.textContent = "消す?";
    setTimeout(() => { ボタン.classList.remove("確認"); ボタン.textContent = "🗑"; }, 3000);
    return;
  }
  API(`conversations/${番号}`, "DELETE").then(() => {
    if (今 && 今.id === 番号) 新規();
    else 一覧読込();
  }).catch((err) => 知らせる(`消せませんでした(${err.message})`));
}

// --- 会話を開く ---

function 横欄閉じる() { document.body.classList.remove("横欄開"); $("覆い").hidden = true; }

async function 開く(番号) {
  if (中断) 中断.abort();
  try {
    今 = await API(`conversations/${番号}`);
  } catch (e) {
    知らせる(`会話を開けませんでした(${e.message})`);
    新規();
    return;
  }
  表示し直す();
  一覧読込();
  横欄閉じる();
}

function 新規() {
  if (中断) 中断.abort();
  今 = null;
  if (location.hash) history.replaceState(null, "", location.pathname);
  表示し直す();
  一覧読込();
  横欄閉じる();
  文欄.focus();
}

function 表示し直す() {
  会話欄.querySelectorAll(".発言, .失敗").forEach((el) => el.remove());
  $("ようこそ").hidden = !!(今 && 今.messages.length);
  題欄.textContent = 今 ? (今.title || "新しい会話") : "新しい会話";
  document.title = 今 && 今.title ? `${今.title} - おはなし` : "おはなし";
  if (今) for (const m of 今.messages) 発言を足す(m.role, m.content);
  モデル欄表示();
  設定欄表示();
  作り直しボタン付け();
  下へ();
  本文に印付け();
}

function 下へ() { 会話欄.scrollTop = 会話欄.scrollHeight; }

// --- ウェブで調べる ---

function ウェブ中() { return !ウェブボタン.disabled && ウェブボタン.getAttribute("aria-pressed") === "true"; }
function ウェブ切替(押す) {
  ウェブボタン.setAttribute("aria-pressed", String(押す));
  保存する("ウェブ", 押す ? "1" : "");
}
ウェブボタン.addEventListener("click", () => ウェブ切替(!ウェブ中()));

// --- 砂場でコードを動かす ---

function 砂場中() { return !砂場ボタン.disabled && 砂場ボタン.getAttribute("aria-pressed") === "true"; }
function 砂場切替(押す) {
  砂場ボタン.setAttribute("aria-pressed", String(押す));
  保存する("砂場", 押す ? "1" : "");
}
砂場ボタン.addEventListener("click", () => 砂場切替(!砂場中()));

// --- GitHub を読む ---

function GitHub中() { return !GitHubボタン.disabled && GitHubボタン.getAttribute("aria-pressed") === "true"; }
function GitHub切替(押す) {
  GitHubボタン.setAttribute("aria-pressed", String(押す));
  保存する("GitHub", 押す ? "1" : "");
}
GitHubボタン.addEventListener("click", () => GitHub切替(!GitHub中()));

function 今の倉() { return 今 ? (今.repos || []) : 新規倉; }

function 倉一覧表示() {
  const 一覧 = $("倉一覧");
  一覧.textContent = "";
  const 群 = 今の倉();
  for (const x of 群) {
    const li = document.createElement("li");
    const 名 = document.createElement("span");
    名.className = "倉名";
    名.textContent = x.repo;
    const 権 = document.createElement("select");
    権.setAttribute("aria-label", `${x.repo} の権限`);
    権.title = "Write にすると、モデルが確かめずに issue を作る・直す・コメントする・閉じることがあります";
    for (const [値, 字] of [["read", "Read"], ["write", "Write"]]) {
      const o = document.createElement("option");
      o.value = 値;
      o.textContent = 字;
      権.append(o);
    }
    権.value = x.write ? "write" : "read";
    権.addEventListener("change", () => 倉保存(群.map((y) => (y.repo === x.repo ? { repo: y.repo, write: 権.value === "write" } : y))));
    const 外 = document.createElement("button");
    外.type = "button";
    外.className = "小";
    外.textContent = "外す";
    外.setAttribute("aria-label", `${x.repo} を外す`);
    外.addEventListener("click", () => 倉保存(群.filter((y) => y.repo !== x.repo)));
    li.append(名, 権, 外);
    一覧.append(li);
  }
  if (!群.length) {
    const li = document.createElement("li");
    li.className = "淡 小字";
    li.textContent = "まだありません。下で足すと、🐙 を押したときにモデルが読みます。";
    一覧.append(li);
  }
}

async function 倉保存(群) {
  if (!今) { 新規倉 = 群; 倉一覧表示(); return; }
  try { 今 = await API(`conversations/${今.id}`, "PUT", { repos: 群 }); }
  catch (e) { 知らせる(`リポジトリを変えられませんでした(${e.message})`); }
  倉一覧表示();
}

// 「owner/*」で許しているときは、そのどれでも足せる。--github-repos がなければどれでも。足せるかはサーバーも確かめる
function 許可済(倉) {
  if (許可倉.length === 0) return true;
  const 小 = 倉.toLowerCase();
  return 許可倉.some((p) => { const q = p.toLowerCase(); return q.endsWith("/*") ? 小.startsWith(q.slice(0, -1)) && !小.slice(q.length - 1).includes("/") : 小 === q; });
}

function 倉候補表示(群) {
  $("倉候補").textContent = "";
  for (const p of [...new Set(群)]) { const o = document.createElement("option"); o.value = p; $("倉候補").append(o); }
}

// 鍵で使えるリポジトリを、足すときの候補にする(サーバーが GitHub に聞く。鍵は画面に来ない)
async function 倉候補取得() {
  try {
    const r = await (await fetch("/api/github/repos")).json();
    倉候補表示([...許可倉.filter((p) => !p.endsWith("/*")), ...(r.repos || [])]);
  } catch (e) { /* 候補がなくても、名前を書けば足せる */ }
}

$("倉足す").addEventListener("click", async () => {
  const 倉 = $("倉名").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(倉)) { $("倉案内").textContent = "owner/名前 の形で書いてください"; return; }
  if (!許可済(倉)) { $("倉案内").textContent = `${倉} は使えません。起動するときの --github-repos(${許可倉.join(", ")})に入るものだけです`; return; }
  $("倉案内").textContent = 倉案内文;
  const 群 = 今の倉().filter((y) => y.repo.toLowerCase() !== 倉.toLowerCase());
  await 倉保存([...群, { repo: 倉, write: $("倉権限").value === "write" }]);
  $("倉名").value = "";
});
$("倉名").addEventListener("keydown", (e) => { if (e.key === "Enter" && !変換中(e)) { e.preventDefault(); $("倉足す").click(); } });

const 拡張子言語 = { py: "python", js: "javascript", ts: "typescript", sh: "sh", rb: "ruby", go: "go", rs: "rust", c: "c", h: "c", cpp: "cpp", java: "java", html: "html", css: "css", json: "json", md: "markdown", yml: "yaml", yaml: "yaml", toml: "toml", sql: "sql", suru: "suru" };

// 道具を使った跡を Markdown にする。中身に ``` があっても壊れないように ~~~~ で囲む
function 道具文(t) {
  const 囲 = "~~~~";
  if (t.name === "run") {
    const 出 = (t.output || "").replace(/\n$/, "");
    const 印 = t.code ? `(終了コード ${t.code})` : "";
    return `\n\n${囲}console\n$ ${t.command}\n${出}${出 && 印 ? "\n" : ""}${印}\n${囲}\n\n`;
  }
  if (t.name === "write_file") {
    const 言語 = 拡張子言語[(t.path || "").split(".").pop()] || "";
    return `\n\n📝 \`${t.path}\`(${t.output})\n\n${囲}${言語}\n${(t.content || "").replace(/\n$/, "")}\n${囲}\n\n`;
  }
  if ((t.name || "").startsWith("github_")) return `\n\n${t.summary || t.name}\n\n`;
  return `\n\n${t.name}: ${t.output || ""}\n\n`;
}

// 出典を答えの終わりに足す Markdown。題の [ ] と URL の ( ) は、リンクの書き方を壊さないように替える
function 出典文(群) {
  if (!群.length) return "";
  const 行 = 群.map((x, i) => {
    const 題 = (x.title || x.url || "").replace(/[\[\]]/g, (c) => (c === "[" ? "［" : "］")).replace(/\s+/g, " ");
    const 宛 = (x.url || "").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
    return /^https?:\/\//.test(宛) ? `${i + 1}. [${題}](${宛})` : `${i + 1}. ${題}`;
  });
  return "\n\n**出典**\n\n" + 行.join("\n");
}

// --- 発言の表示 ---

function 発言を足す(役, 内容) {
  $("ようこそ").hidden = true;
  const el = document.createElement("div");
  el.className = `発言 ${役}`;
  const 本 = document.createElement("div");
  本.className = "本文";
  el.append(本);
  中身を書く(el, 内容);
  const 道具 = document.createElement("div");
  道具.className = "道具";
  const 写 = document.createElement("button");
  写.type = "button";
  写.textContent = "写す";
  写.addEventListener("click", () => 写し取る(写, el.dataset.内容 || ""));
  道具.append(写);
  el.append(道具);
  会話欄.append(el);
  下へ();
  return el;
}

function 中身を書く(el, 内容) {
  el.dataset.内容 = 内容;
  const 本 = el.querySelector(".本文");
  if (el.classList.contains("assistant")) 本.innerHTML = 書式化(内容);
  else 本.textContent = 内容;
}

function 写し取る(ボタン, 文) {
  const 済 = () => { const 前 = ボタン.textContent; ボタン.textContent = "写しました"; setTimeout(() => (ボタン.textContent = 前), 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(文).then(済, () => {});
}

会話欄.addEventListener("click", (e) => {
  if (e.target.classList.contains("写す")) 写し取る(e.target, e.target.parentElement.querySelector("code").textContent);
});

// 最後の答えに「作り直す」を付ける
function 作り直しボタン付け() {
  会話欄.querySelectorAll(".作り直す").forEach((b) => b.remove());
  const 最後 = [...会話欄.querySelectorAll(".発言")].at(-1);
  if (!今 || 中断 || !最後 || !最後.classList.contains("assistant")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "作り直す";
  b.textContent = "作り直す";
  b.addEventListener("click", 作り直す);
  最後.querySelector(".道具").append(b);
}

// --- 設定(指示と温度と砂場のネットワーク) ---

function 設定欄表示() {
  $("指示").value = 今 ? 今.system : 保存値("指示", "");
  const 温度 = 今 ? 今.temperature : -1;
  $("温度既定").checked = 温度 < 0;
  $("温度").disabled = 温度 < 0;
  $("温度").value = 温度 < 0 ? 0.8 : 温度;
  $("温度値").textContent = $("温度").value;
  $("砂場網").checked = 今 ? 今.network : false;
  倉一覧表示();
}

function 設定の値() {
  return { system: $("指示").value, temperature: $("温度既定").checked ? -1 : Number($("温度").value), network: $("砂場網").checked };
}

async function 設定保存() {
  if (今) 今 = await API(`conversations/${今.id}`, "PUT", 設定の値());
}

$("設定開く").addEventListener("click", () => {
  const 欄 = $("設定欄");
  欄.hidden = !欄.hidden;
  $("設定開く").setAttribute("aria-expanded", String(!欄.hidden));
});
$("指示").addEventListener("change", 設定保存);
$("温度既定").addEventListener("change", () => { $("温度").disabled = $("温度既定").checked; 設定保存(); });
$("温度").addEventListener("input", () => { $("温度値").textContent = $("温度").value; });
$("温度").addEventListener("change", 設定保存);
// 砂場のネットワークを変えると、次に砂場を使うときにコンテナを作り直す(/work のファイルは残る)
$("砂場網").addEventListener("change", 設定保存);

// --- 題を変える ---

題欄.addEventListener("click", () => {
  if (!今 || 題欄.isContentEditable) return;
  題欄.contentEditable = "true";
  題欄.focus();
  document.getSelection().selectAllChildren(題欄);
});
題欄.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !変換中(e)) { e.preventDefault(); 題欄.blur(); }
  if (e.key === "Escape") { 題欄.textContent = 今.title || "新しい会話"; 題欄.blur(); }
});
題欄.addEventListener("blur", async () => {
  if (!題欄.isContentEditable) return;
  題欄.contentEditable = "false";
  const 題 = 題欄.textContent.trim();
  if (今 && 題 && 題 !== 今.title) {
    今 = await API(`conversations/${今.id}`, "PUT", { title: 題 });
    一覧読込();
  }
  題欄.textContent = 今 ? (今.title || "新しい会話") : "新しい会話";
});

// --- 答えを受け取る ---

function WebSocketを開く() {
  if (接続 && 接続.readyState === WebSocket.OPEN) return Promise.resolve(接続);
  return new Promise((成功, 失敗) => {
    const s = new WebSocket(new URL("ws", location.href).href.replace(/^http/, "ws"));
    s.onopen = () => { 接続 = s; 成功(s); };
    s.onerror = () => 失敗(new Error("WebSocket につなげませんでした"));
  });
}

// WebSocket で聞く。{"done":true} が届けば終わり。止めるときは接続を閉じる(次はつなぎ直す)
async function WebSocketで聞く(本文, 受け取る, 合図) {
  const s = await WebSocketを開く();
  await new Promise((成功, 失敗) => {
    s.onmessage = (e) => {
      const 通知 = JSON.parse(e.data);
      if (通知.done) 成功();
      else 受け取る(通知);
    };
    s.onclose = () => { 接続 = null; 失敗(合図.aborted ? new DOMException("止めました", "AbortError") : new Error("WebSocket が切れました")); };
    合図.addEventListener("abort", () => s.close());
    s.send(本文);
  });
}

// POST api/chat で聞く。答えは1行1つの JSON
async function fetchで聞く(本文, 受け取る, 合図) {
  const r = await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: 本文, signal: 合図 });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const 読み手 = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let 残り = "";
  for (;;) {
    const { value, done } = await 読み手.read();
    if (done) break;
    残り += value;
    const 行一覧 = 残り.split("\n");
    残り = 行一覧.pop();
    for (const 行 of 行一覧) if (行.trim()) 受け取る(JSON.parse(行));
  }
}

async function 聞く(本文, 受け取る, 合図) {
  if (WebSocket可) {
    try {
      return await WebSocketで聞く(本文, 受け取る, 合図);
    } catch (e) {
      if (接続 !== null || e.name === "AbortError" || e.message !== "WebSocket につなげませんでした") throw e;
      WebSocket可 = false; // つなげなかった: これからは fetch で聞く
    }
  }
  return fetchで聞く(本文, 受け取る, 合図);
}

function 送受中にする(中) {
  送るボタン.hidden = 中;
  止めるボタン.hidden = !中;
  if (!中) 作り直しボタン付け();
  else 会話欄.querySelectorAll(".作り直す, .失敗").forEach((b) => b.remove());
}

// 今の会話の答えを Ollama に作ってもらい、届いたところから出す。終わったら(止めても)答えを保存する
async function 答えてもらう() {
  const el = 発言を足す("assistant", "");
  el.classList.add("待ち");
  const 考え欄 = document.createElement("details");
  考え欄.className = "考え";
  考え欄.innerHTML = "<summary>考えています…</summary><div class=\"考え文\"></div>";
  let 答え = "", 考え = "", 誤り = "", 統計 = null, 描く予定 = false, 出典 = [];
  const ウェブ = ウェブ中(), 砂場 = 砂場中();
  const 調べ欄 = document.createElement("div");
  調べ欄.className = "調べ";
  if (ウェブ) 調べ欄.textContent = "🌐 ウェブで調べています…";
  else if (砂場) 調べ欄.textContent = "💻 砂場を用意しています…";
  if (ウェブ || 砂場) el.prepend(調べ欄);
  中断 = new AbortController();
  送受中にする(true);
  const 描く = () => {
    描く予定 = false;
    中身を書く(el, 答え + 出典文(出典));
    if (考え) {
      if (!考え欄.isConnected) el.prepend(考え欄);
      考え欄.querySelector(".考え文").textContent = 考え;
      考え欄.querySelector("summary").textContent = 答え ? "考えたこと" : "考えています…";
    }
    const 近い = 会話欄.scrollHeight - 会話欄.scrollTop - 会話欄.clientHeight < 80;
    if (近い) 下へ();
  };
  const 受け取る = (通知) => {
    if (通知.content) 答え += 通知.content;
    if (通知.thinking) 考え += 通知.thinking;
    if (通知.error) 誤り = 通知.error;
    if (通知.stats) 統計 = 通知.stats;
    if (通知.sources) { 出典 = 通知.sources; 調べ欄.textContent = `🌐 ウェブの ${出典.length} 件を読みました`; }
    if (通知.notice) 調べ欄.textContent = `${通知.notice}`;
    if (通知.running) 調べ欄.textContent = 通知.running.startsWith("🐙") ? 通知.running : `💻 動かしています: ${通知.running}`;
    if (通知.tool) { 答え += 道具文(通知.tool); 調べ欄.textContent = (通知.tool.name || "").startsWith("github_") ? 通知.tool.summary : "💻 砂場で動かしました"; }
    if (!調べ欄.isConnected && (通知.notice || 通知.running)) el.prepend(調べ欄);
    if (!描く予定) { 描く予定 = true; requestAnimationFrame(描く); }
  };
  let 止めた = false;
  try {
    const 頼み = { conversation: 今.id };
    if (ウェブ) 頼み.web = true;
    if (砂場) 頼み.code = true;
    if (GitHub中()) 頼み.github = true;
    await 聞く(JSON.stringify(頼み), 受け取る, 中断.signal);
  } catch (e) {
    if (e.name === "AbortError") 止めた = true;
    else 誤り = String(e.message || e);
  }
  描く();
  el.classList.remove("待ち");
  const 番号 = 今.id;
  if (答え) {
    try { 今 = await API(`conversations/${番号}/messages`, "POST", { role: "assistant", content: 答え + 出典文(出典) }); }
    catch (e) { 誤り = 誤り || `答えを保存できませんでした(${e.message})`; }
    const 印 = document.createElement("span");
    印.className = "淡 小字 統計";
    if (統計 && 統計.seconds > 0) 印.textContent = `${統計.tokens} トークン · ${(統計.tokens / 統計.seconds).toFixed(1)} トークン/秒`;
    if (止めた) 印.textContent = "止めました";
    el.querySelector(".道具").append(印);
  } else {
    el.remove();
  }
  中断 = null;
  送受中にする(false);
  if (誤り) 失敗を出す(誤り, !答え);
  一覧読込();
  文欄.focus();
}

// 失敗の知らせ。答えがなかったら「もう一度」で同じ問いを聞き直せる
function 失敗を出す(文, 聞き直せる) {
  const el = document.createElement("div");
  el.className = "失敗";
  el.textContent = `失敗しました: ${文}`;
  if (聞き直せる) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "もう一度";
    b.addEventListener("click", () => { el.remove(); 答えてもらう(); });
    el.append(" ", b);
  }
  会話欄.append(el);
  下へ();
}

async function 送る() {
  const 質問 = 文欄.value.trim();
  if (!質問 || 中断) return;
  try {
    if (!今) {
      if (!モデル欄.value) { 知らせる("モデルを選んでください。"); return; }
      今 = await API("conversations", "POST", { model: モデル欄.value });
      if ($("指示").value || !$("温度既定").checked || $("砂場網").checked || 新規倉.length) 今 = await API(`conversations/${今.id}`, "PUT", { ...設定の値(), repos: 新規倉 });
      新規倉 = [];
      history.replaceState(null, "", `#${今.id}`);
    }
    文欄.value = "";
    文欄高さ();
    今 = await API(`conversations/${今.id}/messages`, "POST", { role: "user", content: 質問 });
  } catch (e) {
    知らせる(`送れませんでした(${e.message})`);
    return;
  }
  題欄.textContent = 今.title || "新しい会話";
  document.title = `${今.title} - おはなし`;
  発言を足す("user", 質問);
  一覧読込();
  await 答えてもらう();
}

async function 作り直す() {
  if (!今 || 中断) return;
  今 = await API(`conversations/${今.id}/last-answer`, "DELETE");
  const 最後 = [...会話欄.querySelectorAll(".発言")].at(-1);
  if (最後 && 最後.classList.contains("assistant")) 最後.remove();
  await 答えてもらう();
}

// --- 入力欄 ---

// 日本語の変換を確定する Enter では送らない。
// Chrome は確定の Enter に isComposing を付けるが、Safari は先に compositionend を出してから、
// isComposing のない keydown(keyCode 229)を出す。ATOK などでは keyCode も 229 にならないことがあるので、
// compositionend のすぐ後の Enter も確定とみなす。
let 変換終了時刻 = -1e9;
for (const 欄 of [文欄, 題欄]) 欄.addEventListener("compositionend", () => { 変換終了時刻 = performance.now(); });
function 変換中(e) {
  return e.isComposing || e.keyCode === 229 || performance.now() - 変換終了時刻 < 150;
}

function 文欄高さ() {
  文欄.style.height = "auto";
  文欄.style.height = Math.min(文欄.scrollHeight, 200) + "px";
}

$("入力欄").addEventListener("submit", (e) => { e.preventDefault(); 送る(); });
文欄.addEventListener("input", 文欄高さ);
文欄.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !変換中(e)) { e.preventDefault(); 送る(); }
});
止めるボタン.addEventListener("click", () => { if (中断) 中断.abort(); });
$("新規").addEventListener("click", 新規);
$("横欄開く").addEventListener("click", () => { document.body.classList.add("横欄開"); $("覆い").hidden = false; });
$("横欄閉じる").addEventListener("click", 横欄閉じる);
$("覆い").addEventListener("click", 横欄閉じる);
$("指示").addEventListener("input", () => { if (!今) 保存する("指示", $("指示").value); });

function 道から開く() {
  const n = parseInt(location.hash.slice(1), 10);
  if (n > 0) { if (!今 || 今.id !== n) 開く(n); } else if (今) 新規();
}
window.addEventListener("hashchange", 道から開く);

// --- 最新にして再起動(起動.sh から動かしたとき) ---
// 押すと 起動.sh が git pull と kumu 作る をして、アプリを動かし直す。
// 動き始めた時刻(started)が変わったら、画面を読み直す。作り直しに失敗したら、その理由を出す

function 版表示(i) {
  $("更新状態").textContent = i.update || (i.revision ? `版 ${i.revision}` : "");
}

let 起動時 = 0;

async function 再起動する() {
  $("再起動").disabled = true;
  $("更新状態").textContent = "更新しています…";
  try { await API("restart", "POST"); } catch (e) { $("更新状態").textContent = `頼めませんでした: ${e.message}`; $("再起動").disabled = false; return; }
  for (let 回 = 0; 回 < 300; 回++) {
    await new Promise((r) => setTimeout(r, 1000));
    let i;
    try { i = await API("info"); } catch { $("更新状態").textContent = "動かし直しています…"; continue; }
    if (i.started !== 起動時) { location.reload(); return; }
    if (i.update.startsWith("失敗")) { 版表示(i); $("再起動").disabled = false; return; }
  }
  $("更新状態").textContent = "時間がかかっています。起動.sh の画面を見てください";
  $("再起動").disabled = false;
}
$("再起動").addEventListener("click", 再起動する);

// --- 始める ---

(async () => {
  API("info").then((i) => {
    $("接続先").textContent = i.version ? `Ollama ${i.version} · ${i.ollama}` : `${i.ollama}(つながっていません)`;
    if (i.sandbox) {
      砂場ボタン.disabled = false;
      砂場ボタン.title = "押してあると、モデルが砂場(Docker のコンテナ)でコードを書いて動かします";
      砂場切替(保存値("砂場", "") === "1");
      $("砂場網欄").hidden = false;
    }
    起動時 = i.started;
    if (i.restart) { $("更新欄").hidden = false; 版表示(i); }
    if (i.github) {
      GitHubボタン.disabled = false;
      GitHubボタン.title = "押してあると、モデルが会話のリポジトリ(⚙ で足す)を GitHub から読みます";
      GitHub切替(保存値("GitHub", "") === "1");
      許可倉 = i.githubRepos || [];
      倉候補表示(許可倉.filter((p) => !p.endsWith("/*")));
      $("倉欄").hidden = false;
      倉案内文 = (i.githubUser ? `${i.githubUser} として読みます。` : "鍵がないので、公開のリポジトリだけ読めます。") + (許可倉.length ? `足せるのは ${許可倉.join(", ")} です。` : "owner/名前 で、どのリポジトリでも足せます(使えるかは鍵の権限によります)。");
      $("倉案内").textContent = 倉案内文;
      倉候補取得();
    }
    if (i.web) {
      ウェブボタン.disabled = false;
      ウェブボタン.title = "押してあると、ウェブで調べてから答えます";
      ウェブ切替(保存値("ウェブ", "") === "1");
    }
  }).catch(() => {});
  await モデル読込();
  if (location.hash) 道から開く();
  else { 表示し直す(); 一覧読込(); }
})();
