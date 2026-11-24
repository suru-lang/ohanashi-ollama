// おはなし の画面。会話はサーバーが SQLite にしまい、画面は送る前と答えの後に発言を保存します。
// 会話はモデル・指示・リポジトリなどの設定を持ち、その下に話題ごとのスレッドがあります。開いているスレッドは道の #会話/スレッド です。
// 答えは WebSocket(ws)で受け取ります。{"thread":番号} を送ると、そのスレッドの発言を会話の設定で送り、1つずつの JSON
// ({"content"}・{"thinking"}・{"stats"}・{"error"})が届き、最後に {"done":true} が届きます。
// {"web":true} も送ると、サーバーが先にウェブで調べて {"sources":[…]}(できなければ {"notice":…})を送ります。
// 出典は答えの終わりに Markdown の番号付きの一覧として足して、答えといっしょに保存します。
// {"code":true} も送ると、モデルが砂場(Docker のコンテナ)でコマンドを動かします。動かす前に {"running":…}、
// 動かした後に {"tool":…} が届くので、コマンドと出力を答えの中に Markdown のコードの塊として足します。
// {"github":true} も送ると、モデルが会話のリポジトリ(⚙ で足す。Read か Write)を GitHub から読みます。
// Write のリポジトリには、モデルが確かめずに issue を書きます(github_issue)。
// 読む前に {"running":…}、読んだ後に {"tool":{"name":"github_…","summary":…}} が届き、summary の1行を答えに残します。
// WebSocket につなげないときは、POST api/chat で同じ JSON を1行ずつ受け取ります。
// 考えと道具を使った跡は、最後の答えの上の、はじめは閉じた「途中経過」の欄に入れます(読み込んだ会話でも)。
// 決まり(モデルに守ってほしいことを書いた文書)は api/rules でしまい、⚙ で会話に付けます(会話の rules に番号を順に)。
// サーバーは、付けた決まりと会話の指示を1つの指示(system)にまとめて送ります。砂場か GitHub を使う答えでは、
// 作業フォルダのリポジトリの OHANASHI.md・AGENTS.md・CLAUDE.md も読み、読んだときは {"notice":…} で知らせます。

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

let 今 = null;          // 開いている会話 {id, title, model, system, temperature, network, repos, threads}
let 筋 = null;          // 開いているスレッド {id, conversation, title, messages}
let 中断 = null;        // 答えを受け取っている間の AbortController
let 接続 = null;        // 開いている WebSocket
let WebSocket可 = true; // つなげなかったら、fetch に切り替える
let モデル群 = [];
let 新規倉 = [];        // まだ会話を作っていないときに ⚙ で足したリポジトリ
let 許可倉 = [];        // サーバーが許しているリポジトリ(--github-repos)。空ならどれでも足せる
let 倉案内文 = "";
let 決まり群 = [];      // しまってある決まりの一覧 [{id, name, default, length, uses}]
let 新規決まり = null;  // まだ会話を作っていないときに ⚙ で選んだ決まりの番号(null なら既定の決まり)

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

// 一覧の1行(会話かスレッド)。題 は印を付ける文、下 はその下の淡い文
function 一覧行(種類, 道, 題文, 下文, 語, 今か, 消す) {
  const 行 = document.createElement("div");
  行.className = "項目" + (種類 === "スレッド" ? " スレッド項目" : "") + (今か ? " 今" : "");
  const a = document.createElement("a");
  a.href = 道;
  const 題 = document.createElement("span");
  題.className = "項目題";
  印付け(題, 題文, 語);
  const 下 = document.createElement("span");
  下.className = "淡 小字";
  下.textContent = 下文;
  a.append(題, 下);
  行.append(a);
  if (消す) {
    const 消 = document.createElement("button");
    消.type = "button";
    消.className = "消す";
    消.textContent = "🗑";
    消.title = `この${種類}を消す`;
    消.addEventListener("click", (e) => 消す確認(e, 消, 消す));
    行.append(消);
  }
  return 行;
}

function 筋題(t) { return (t && t.title) || "新しいスレッド"; }

// 検索欄に言葉があれば、その言葉を含むスレッドだけを出す。なければ会話を並べ、開いている会話の下にスレッドを並べる
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
  if (語) {
    for (const c of 群) {
      // 見つかったスレッド。題は「会話の題 › スレッドの題」
      const 題 = (c.title || "新しい会話") + (c.threadTitle && c.threadTitle !== c.title ? ` › ${c.threadTitle}` : "");
      const 行 = 一覧行("スレッド", 道を作る(c.id, c.thread), 題, `${いつ(c.updated)} · ${c.model}`, 語, 筋 && 筋.id === c.thread, null);
      行.classList.remove("スレッド項目");
      const a = 行.querySelector("a");
      if (c.snippet) {
        const 抜 = document.createElement("span");
        抜.className = "抜粋 小字";
        印付け(抜, 抜粋にする(c.snippet, 語), 語);
        a.append(抜);
      }
      a.addEventListener("click", () => {
        強調語 = 語;
        if (筋 && 筋.id === c.thread) { 印消し(); 本文に印付け(); 横欄閉じる(); }
      });
      欄.append(行);
    }
    return;
  }
  for (const c of 群) {
    const 開いている = 今 && 今.id === c.id;
    const 下 = `${いつ(c.updated)} · ${c.model}` + (c.threads > 1 ? ` · ${c.threads} スレッド` : "");
    欄.append(一覧行("会話", 道を作る(c.id, 0), c.title || "新しい会話", 下, "", 開いている && !(今.threads.length > 1), { 会話: c.id }));
    if (!開いている || 今.threads.length < 2) continue;
    for (const t of 今.threads) {
      欄.append(一覧行("スレッド", 道を作る(c.id, t.id), 筋題(t), いつ(t.updated), "", 筋 && 筋.id === t.id, { スレッド: t.id }));
    }
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
  for (const 本 of 会話欄.querySelectorAll(".発言 .本文, .発言 .途中文")) {
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
  for (const m of 最初) { const 欄 = m.closest(".途中"); if (欄) 欄.open = true; } // 途中経過に見つかったら開く
  if (最初.length) 最初[0].scrollIntoView({ block: "center" });
}

function 印消し() {
  for (const m of 会話欄.querySelectorAll(".本文 mark, .途中文 mark")) m.replaceWith(m.textContent);
}

// 1回目で「消す?」になり、もう1回押すと消す。何 は {会話:番号} か {スレッド:番号}
function 消す確認(e, ボタン, 何) {
  e.preventDefault();
  if (!ボタン.classList.contains("確認")) {
    ボタン.classList.add("確認");
    ボタン.textContent = "消す?";
    setTimeout(() => { ボタン.classList.remove("確認"); ボタン.textContent = "🗑"; }, 3000);
    return;
  }
  const 道 = 何.会話 ? `conversations/${何.会話}` : `threads/${何.スレッド}`;
  API(道, "DELETE").then(() => {
    if (何.会話 && 今 && 今.id === 何.会話) 新規();
    else if (何.スレッド && 筋 && 筋.id === 何.スレッド) 開く(今.id, 0);
    else 会話読み直す().then(一覧読込);
  }).catch((err) => 知らせる(`消せませんでした(${err.message})`));
}

// --- 会話を開く ---

function 横欄閉じる() { document.body.classList.remove("横欄開"); $("覆い").hidden = true; }

// 会話を開き、スレッド(0 なら一番新しく話したもの)を開く
async function 開く(会話番号, スレッド番号) {
  if (中断) 中断.abort();
  try {
    今 = await API(`conversations/${会話番号}`);
    const 選 = 今.threads.some((t) => t.id === スレッド番号) ? スレッド番号 : 今.threads[0].id;
    筋 = await API(`threads/${選}`);
  } catch (e) {
    知らせる(`会話を開けませんでした(${e.message})`);
    新規();
    return;
  }
  const 道 = 道を作る(今.id, 筋.id);
  if (location.hash !== 道) history.replaceState(null, "", 道);
  表示し直す();
  一覧読込();
  横欄閉じる();
}

// 開いている会話の設定とスレッドの一覧を読み直す
async function 会話読み直す() {
  if (!今) return;
  try { 今 = await API(`conversations/${今.id}`); } catch { /* 次に開くときに読む */ }
  会話題表示();
}

// 今の会話に新しいスレッドを作って開く。設定(リポジトリなど)は会話のものをそのまま使う
async function 新スレッド() {
  if (!今 || 中断) return;
  try {
    筋 = await API(`conversations/${今.id}/threads`, "POST", {});
    今 = await API(`conversations/${今.id}`);
  } catch (e) {
    知らせる(`スレッドを作れませんでした(${e.message})`);
    return;
  }
  history.pushState(null, "", 道を作る(今.id, 筋.id));
  強調語 = "";
  表示し直す();
  一覧読込();
  横欄閉じる();
  文欄.focus();
}

function 新規() {
  if (中断) 中断.abort();
  今 = null;
  新規決まり = null;
  筋 = null;
  if (location.hash) history.replaceState(null, "", location.pathname);
  表示し直す();
  一覧読込();
  横欄閉じる();
  文欄.focus();
}

// 見出しの題: 大きいほうはスレッドの題、その前に小さく会話の題
function 見出し題() { return 筋 ? 筋題(筋) : "新しい会話"; }
function 会話題表示() {
  $("会話題").hidden = !今;
  $("新スレッド").hidden = !今;
  if (今 && !$("会話題").isContentEditable) $("会話題").textContent = 今.title || "新しい会話";
  if (!題欄.isContentEditable) 題欄.textContent = 見出し題();
  document.title = 今 ? `${見出し題()}${今.title && 今.title !== 見出し題() ? ` - ${今.title}` : ""} - おはなし` : "おはなし";
}

function 表示し直す() {
  会話欄.querySelectorAll(".発言, .失敗, .長さ知らせ, .まとめ欄").forEach((el) => el.remove());
  const 群 = 筋 ? 筋.messages : [];
  $("ようこそ").hidden = !!群.length;
  会話題表示();
  for (const m of 群) 発言を足す(m.role, m.content);
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

// 道具を使った跡を Markdown にする。中身に ``` があっても壊れないように ~~~~ で囲み、後に道具の印の行を足す
function 道具文(t) {
  return 道具跡文(t) + `${道具印}${t.name || "?"}\n\n`;
}

// モデルの文の ``` が閉じていなければ閉じる(道具の跡がコードの中に入らないように)
function 柵閉じ(文) {
  const 数 = 文.split("\n").filter((行) => /^\s*```/.test(行)).length;
  return 数 % 2 ? 文 + "\n```" : 文;
}

function 道具跡文(t) {
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
  if (役 === "assistant") {
    const 留 = document.createElement("button");
    留.type = "button";
    留.textContent = "メモに足す";
    留.title = "この答えを会話のメモに足します。メモは、この会話のどのスレッドでもモデルが読みます";
    留.addEventListener("click", () => メモに足す(el));
    道具.append(留);
  }
  el.append(道具);
  会話欄.append(el);
  下へ();
  return el;
}

// 答えは、途中経過(考えと道具を使った跡)を畳んだ欄に入れ、最後の答えだけを開いて出す。
// 様子.考え は考えの文、様子.今 は答えを受け取っている間に畳んだ欄の題に出す、今していること
function 中身を書く(el, 内容, 様子 = {}) {
  el.dataset.内容 = 内容;
  const 本 = el.querySelector(".本文");
  if (!el.classList.contains("assistant")) { 本.textContent = 内容; return; }
  const 分 = 途中を分ける(内容);
  本.innerHTML = 書式化(分.答え);
  const 考え = 様子.考え || "";
  let 欄 = el.querySelector(".途中");
  if (!分.途中 && !考え && !様子.今) { if (欄) 欄.remove(); return; }
  if (!欄) {
    欄 = document.createElement("details");
    欄.className = "途中";
    欄.innerHTML = "<summary></summary><div class=\"考え文\"></div><div class=\"途中文\"></div>";
    本.before(欄);
  }
  const 考え文 = 欄.querySelector(".考え文"), 途中文 = 欄.querySelector(".途中文");
  考え文.hidden = !考え;
  if (考え文.textContent !== 考え) 考え文.textContent = 考え;
  途中文.hidden = !分.途中;
  if (途中文.dataset.内容 !== 分.途中) { 途中文.dataset.内容 = 分.途中; 途中文.innerHTML = 書式化(分.途中); }
  const 題 = [];
  if (考え) 題.push("考えたこと");
  if (分.道具群) 題.push(`道具: ${分.道具群.join("・")}`);
  else if (分.手順) 題.push(`道具 ${分.手順} 回`);
  欄.querySelector("summary").textContent = 様子.今 || (分.途中 ? `途中経過(${題.join("・")})` : "考えたこと");
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
  if (!筋 || 中断 || !最後 || !最後.classList.contains("assistant")) return;
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
  $("メモ").value = 今 ? (今.memo || "") : "";
  メモ字数表示();
  倉一覧表示();
  決まり一覧表示();
}

const メモ上限 = 8000;
function メモ字数表示() {
  const n = $("メモ").value.length;
  $("メモ字数").textContent = `${n} / ${メモ上限} 文字` + (n > メモ上限 ? "(多すぎるので、短くするまで保存しません)" : "");
  $("メモ字数").classList.toggle("誤り字", n > メモ上限);
}

function 設定の値() {
  return { system: $("指示").value, temperature: $("温度既定").checked ? -1 : Number($("温度").value), network: $("砂場網").checked, memo: $("メモ").value };
}

async function 設定保存() {
  if (!今 || $("メモ").value.length > メモ上限) return;
  try { 今 = await API(`conversations/${今.id}`, "PUT", 設定の値()); }
  catch (e) { 知らせる(`設定を保存できませんでした(${e.message})`); }
}

// 答え(途中経過を除く)を会話のメモの終わりに足して保存し、⚙ を開いて見せる
async function メモに足す(el) {
  await メモに文を足す(途中を分ける(el.dataset.内容 || "").答え.trim());
}

async function メモに文を足す(文) {
  if (!今 || !文) return;
  const 前 = $("メモ").value.trim();
  $("メモ").value = (前 ? 前 + "\n\n" : "") + 文;
  メモ字数表示();
  $("設定欄").hidden = false;
  $("設定開く").setAttribute("aria-expanded", "true");
  $("メモ").scrollTop = $("メモ").scrollHeight;
  await 設定保存();
  if ($("メモ").value.length > メモ上限) { $("メモ").focus(); 知らせる(`メモが ${メモ上限} 文字を超えました。⚙ のメモを短くしてください`); }
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
$("メモ").addEventListener("input", メモ字数表示);
$("メモ").addEventListener("change", 設定保存);

// --- 決まり ---
// 決まりは会話ごとではなく、しまっておいて、いくつでも会話に付けられる。直すと、付けている会話の次の答えから効く

const 決まり上限 = 8000;
const 決まり長い = 6000;   // 付けている決まりの合計がこれを超えたら、文脈が足りなくなるかもしれないと出す

async function 決まり読込() {
  try { 決まり群 = await API("rules"); } catch { 決まり群 = []; }
  決まり一覧表示();
}

// 今の会話(会話を作る前なら、選んだもの。選んでいなければ既定のもの)に付ける決まりの番号
function 今の決まり() {
  if (今) return 今.rules || [];
  return 新規決まり ?? 決まり群.filter((k) => k.default).map((k) => k.id);
}

function 決まり一覧表示() {
  const 一覧 = $("決まり一覧");
  一覧.textContent = "";
  const 付 = 今の決まり();
  for (const k of 決まり群) {
    const li = document.createElement("li");
    const 札 = document.createElement("label");
    const 印 = document.createElement("input");
    印.type = "checkbox";
    印.checked = 付.includes(k.id);
    印.addEventListener("change", () => 決まり付替(印.checked ? [...付, k.id] : 付.filter((n) => n !== k.id)));
    札.append(印, ` ${k.name}`);
    札.title = `${k.length} 文字` + (k.default ? "・新しい会話に最初から付けます" : "");
    li.append(札);
    一覧.append(li);
  }
  if (!決まり群.length) {
    const li = document.createElement("li");
    li.className = "淡 小字";
    li.textContent = "まだありません。「決まりを作る・直す」で作ると、ここで会話に付けられます。";
    一覧.append(li);
  }
  const 選 = 決まり群.filter((k) => 付.includes(k.id));
  const 計 = 選.reduce((a, k) => a + k.length, 0);
  $("決まり字数").textContent = 選.length ? `決まり ${選.length} つ・約 ${計} 文字` + (計 > 決まり長い ? "。モデルの文脈が短いと、会話の頭が切られます" : "") : "";
  $("決まり字数").classList.toggle("誤り字", 計 > 決まり長い);
  $("決まり数").hidden = !選.length;
  $("決まり数").textContent = 選.length ? `📜${選.length}` : "";
  $("設定開く").title = 選.length ? `設定(決まりを ${選.length} つ付けています)` : "設定";
}

async function 決まり付替(番号群) {
  const 群 = [...new Set(番号群)];
  if (!今) { 新規決まり = 群; 決まり一覧表示(); return; }
  try { 今 = await API(`conversations/${今.id}`, "PUT", { rules: 群 }); }
  catch (e) { 知らせる(`決まりを付けられませんでした(${e.message})`); }
  決まり一覧表示();
}

// --- 決まりを作る・直す ---

let 直す決まり = 0;   // 編集の欄で開いている決まりの番号(0 は新しい決まり)
const 決まり案内文 = $("決まり案内").textContent;

function 決まり選択表示() {
  const 選 = $("決まり選択");
  選.textContent = "";
  for (const k of 決まり群) {
    const o = document.createElement("option");
    o.value = k.id;
    o.textContent = k.name;
    選.append(o);
  }
  const 新 = document.createElement("option");
  新.value = 0;
  新.textContent = "＋ 新しい決まり";
  選.append(新);
  選.value = 直す決まり;
}

async function 決まりを開く(番号) {
  直す決まり = 番号;
  決まり選択表示();
  let k = { name: "", content: "", default: false };
  if (番号) {
    try { k = await API(`rules/${番号}`); }
    catch (e) { 知らせる(`決まりを読めませんでした(${e.message})`); return; }
  }
  $("決まり名").value = k.name;
  $("決まり内容").value = k.content;
  $("決まり既定").checked = k.default;
  $("決まり消す").hidden = !番号;
  $("決まり案内").textContent = 決まり案内文;
  決まり消す戻す();
  決まり内容字数表示();
}

function 決まり内容字数表示() {
  const n = $("決まり内容").value.length;
  $("決まり内容字数").textContent = `${n} / ${決まり上限} 文字` + (n > 決まり上限 ? "(多すぎるので、短くするまで保存できません)" : "");
  $("決まり内容字数").classList.toggle("誤り字", n > 決まり上限);
}

async function 決まり保存() {
  const 本文 = { name: $("決まり名").value.trim(), content: $("決まり内容").value, default: $("決まり既定").checked };
  if (!本文.name) { $("決まり名").focus(); 知らせる("決まりの名前を書いてください"); return; }
  if (本文.content.length > 決まり上限) { $("決まり内容").focus(); 知らせる(`決まりは ${決まり上限} 文字までです`); return; }
  try {
    const k = 直す決まり ? await API(`rules/${直す決まり}`, "PUT", 本文) : await API("rules", "POST", 本文);
    直す決まり = k.id;
  } catch (e) { 知らせる(`決まりを保存できませんでした(${e.message})`); return; }
  await 決まり読込();
  決まり選択表示();
  $("決まり消す").hidden = false;
  $("決まり案内").textContent = `「${本文.name}」を保存しました。付けているすべての会話の次の答えから効きます。`;
}

// 1回目で「消す?(付けている会話の数)」になり、もう1回押すと消す
function 決まり消す戻す() { $("決まり消す").classList.remove("確認"); $("決まり消す").textContent = "消す"; }
async function 決まり消す() {
  const ボタン = $("決まり消す");
  if (!ボタン.classList.contains("確認")) {
    const k = 決まり群.find((x) => x.id === 直す決まり);
    ボタン.classList.add("確認");
    ボタン.textContent = k && k.uses ? `消す?(${k.uses} つの会話に付いています)` : "消す?";
    setTimeout(決まり消す戻す, 4000);
    return;
  }
  try { await API(`rules/${直す決まり}`, "DELETE"); }
  catch (e) { 知らせる(`決まりを消せませんでした(${e.message})`); return; }
  if (新規決まり) 新規決まり = 新規決まり.filter((n) => n !== 直す決まり);
  await 会話読み直す();
  await 決まり読込();
  決まりを開く(決まり群.length ? 決まり群[0].id : 0);
}

$("決まり直す").addEventListener("click", () => {
  const 欄 = $("決まり編集");
  欄.hidden = !欄.hidden;
  $("決まり直す").setAttribute("aria-expanded", String(!欄.hidden));
  if (!欄.hidden) 決まりを開く(決まり群.length ? (決まり群.find((k) => 今の決まり().includes(k.id)) || 決まり群[0]).id : 0);
});
$("決まり閉じる").addEventListener("click", () => { $("決まり編集").hidden = true; $("決まり直す").setAttribute("aria-expanded", "false"); });
$("決まり選択").addEventListener("change", () => 決まりを開く(Number($("決まり選択").value)));
$("決まり内容").addEventListener("input", 決まり内容字数表示);
$("決まり保存").addEventListener("click", 決まり保存);
$("決まり消す").addEventListener("click", 決まり消す);

// --- 題を変える ---
// 押すと書けるようになり、Enter かほかを押すと保存する。見出しの大きい題はスレッドの、小さい題は会話の題

function 題を書けるようにする(el, 今の題, 保存) {
  el.addEventListener("click", () => {
    if (!今の題() || el.isContentEditable) return;
    el.contentEditable = "true";
    el.focus();
    document.getSelection().selectAllChildren(el);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !変換中(e)) { e.preventDefault(); el.blur(); }
    if (e.key === "Escape") { el.textContent = 今の題(); el.blur(); }
  });
  el.addEventListener("blur", async () => {
    if (!el.isContentEditable) return;
    el.contentEditable = "false";
    const 題 = el.textContent.trim();
    if (題 && 題 !== 今の題()) {
      try { await 保存(題); } catch (e) { 知らせる(`題を変えられませんでした(${e.message})`); }
      一覧読込();
    }
    会話題表示();
  });
}
題を書けるようにする(題欄, () => 筋 && 筋題(筋), async (題) => { 筋 = await API(`threads/${筋.id}`, "PUT", { title: 題 }); await 会話読み直す(); });
題を書けるようにする($("会話題"), () => 今 && (今.title || "新しい会話"), async (題) => { 今 = await API(`conversations/${今.id}`, "PUT", { title: 題 }); });

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
    s.onclose = () => { 接続 = null; 失敗(合図.aborted ? new DOMException("止めました", "AbortError") : new Error("サーバーとの接続が切れました。サーバーを動かしている端末にエラーが出ていないか見てください")); };
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
  let 答え = "", 考え = "", 誤り = "", 統計 = null, 描く予定 = false, 出典 = [], 待つ = true;
  const ウェブ = ウェブ中(), 砂場 = 砂場中();
  // 今していること。道具を使っている間は、畳んだ途中経過の題に出す
  let 様子 = !ウェブ && 砂場 ? "💻 砂場を用意しています…" : "";
  const 調べ欄 = document.createElement("div");
  調べ欄.className = "調べ";
  if (ウェブ) { 調べ欄.textContent = "🌐 ウェブで調べています…"; el.prepend(調べ欄); }
  中断 = new AbortController();
  送受中にする(true);
  const 番号 = 筋.id; // 答えている間にほかのスレッドを開いても、このスレッドにしまう
  const 描く = () => {
    描く予定 = false;
    const 今の題 = !待つ ? "" : 様子 || (考え && !答え ? "考えています…" : "");
    中身を書く(el, 答え + 出典文(出典), { 考え, 今: 今の題 });
    const 近い = 会話欄.scrollHeight - 会話欄.scrollTop - 会話欄.clientHeight < 80;
    if (近い) 下へ();
  };
  const 受け取る = (通知) => {
    // モデルの文から道具の印の字を除く(道具を使っていないのに、使ったように見えないように)
    if (通知.content) { 答え += 通知.content.replace(/\u2063/g, ""); 様子 = ""; }
    if (通知.thinking) 考え += 通知.thinking.replace(/\u2063/g, "");
    if (通知.error) 誤り = 通知.error;
    if (通知.stats) 統計 = 通知.stats;
    if (通知.sources) { 出典 = 通知.sources; 調べ欄.textContent = `🌐 ウェブの ${出典.length} 件を読みました`; }
    if (通知.notice) 調べ欄.textContent = `${通知.notice}`;
    if (通知.running) 様子 = 通知.running.startsWith("🐙") ? 通知.running : `💻 動かしています: ${通知.running}`;
    if (通知.tool) { 答え = 柵閉じ(答え) + 道具文(通知.tool); 様子 = (通知.tool.name || "").startsWith("github_") ? 通知.tool.summary : "💻 砂場で動かしました"; }
    if (!調べ欄.isConnected && 通知.notice) el.prepend(調べ欄);
    if (!描く予定) { 描く予定 = true; requestAnimationFrame(描く); }
  };
  let 止めた = false;
  try {
    const 頼み = { thread: 番号 };
    if (ウェブ) 頼み.web = true;
    if (砂場) 頼み.code = true;
    if (GitHub中()) 頼み.github = true;
    await 聞く(JSON.stringify(頼み), 受け取る, 中断.signal);
  } catch (e) {
    if (e.name === "AbortError") 止めた = true;
    else 誤り = String(e.message || e);
  }
  待つ = false;
  描く();
  el.classList.remove("待ち");
  if (答え) {
    try {
      const 新 = await API(`threads/${番号}/messages`, "POST", { role: "assistant", content: 答え + 出典文(出典) });
      if (筋 && 筋.id === 番号) 筋 = 新;
    } catch (e) { 誤り = 誤り || `答えを保存できませんでした(${e.message})`; }
    const 印 = document.createElement("span");
    印.className = "淡 小字 統計";
    if (統計 && 統計.seconds > 0) 印.textContent = `${統計.tokens} トークン · ${(統計.tokens / 統計.seconds).toFixed(1)} トークン/秒`;
    if (止めた) 印.textContent = "止めました";
    el.querySelector(".道具").append(印);
    if (統計 && 統計.prompt) 長さを知らせる(番号, 統計.prompt);
  } else {
    el.remove();
  }
  中断 = null;
  送受中にする(false);
  if (誤り) 失敗を出す(誤り, !答え);
  await 会話読み直す();
  一覧読込();
  文欄.focus();
}

// --- スレッドが長くなったら、まとめて新しいスレッドへ ---
// Ollama が答えの終わりに返す、送った文のトークンの数(stats.prompt)で、スレッドの長さを見る。
// モデルの文脈の長さはまだ分からないので、多くのモデルで使える 8192 を目安にする

const 文脈目安 = 8192;

function 長さを知らせる(番号, 送った) {
  if (!筋 || 筋.id !== 番号 || 送った < 文脈目安 / 2) return;
  const 超え = 送った >= 文脈目安;
  if (!超え && 保存値(`長さ知らせ済:${番号}`, "") === "1") return; // 閉じたら、そのスレッドでは出さない(超えたときは出す)
  会話欄.querySelectorAll(".長さ知らせ").forEach((x) => x.remove());
  const el = document.createElement("div");
  el.className = "長さ知らせ" + (超え ? " 超え" : "");
  const 文 = document.createElement("div");
  文.textContent = 超え
    ? `送った文が約 ${送った} トークンになり、モデルの文脈(多くは ${文脈目安})を超えているかもしれません。前の発言の一部が読まれていないおそれがあります。まとめて新しいスレッドで続けてください。`
    : `このスレッドは長くなりました(送った文 約 ${送った} トークン)。新しいスレッドにすると速くなり、前の話に引きずられにくくなります。`;
  const 行 = document.createElement("div");
  行.className = "行";
  const ボタン = (字, 動き) => { const b = document.createElement("button"); b.type = "button"; b.className = "小"; b.textContent = 字; b.addEventListener("click", 動き); 行.append(b); return b; };
  ボタン("📝 まとめて新しいスレッドへ", () => { el.remove(); まとめる(); });
  ボタン("＋ 新しいスレッドへ", () => { el.remove(); 新スレッド(); });
  ボタン("閉じる", () => { el.remove(); 保存する(`長さ知らせ済:${番号}`, "1"); });
  el.append(文, 行);
  会話欄.append(el);
  下へ();
}

// モデルにスレッドをまとめてもらい、直してから、新しいスレッドの頭に置くか、メモに足して新しいスレッドへ移る
async function まとめる() {
  if (!筋 || 中断) return;
  const 元 = 筋, 元題 = 筋題(筋);
  会話欄.querySelectorAll(".まとめ欄").forEach((x) => x.remove());
  const el = document.createElement("div");
  el.className = "まとめ欄";
  const 見出し = document.createElement("div");
  見出し.textContent = "📝 このスレッドをまとめています…";
  const 欄 = document.createElement("textarea");
  欄.setAttribute("aria-label", "スレッドのまとめ");
  欄.readOnly = true;
  const 行 = document.createElement("div");
  行.className = "行";
  const ボタン = (字, 動き) => { const b = document.createElement("button"); b.type = "button"; b.className = "小"; b.textContent = 字; b.disabled = true; b.addEventListener("click", 動き); 行.append(b); return b; };
  const 頭 = ボタン("新しいスレッドの頭に置く", async () => {
    const 文 = 欄.value.trim();
    if (!文) return;
    el.remove();
    try {
      筋 = await API(`conversations/${今.id}/threads`, "POST", { title: `${元題} の続き` });
      筋 = await API(`threads/${筋.id}/messages`, "POST", { role: "user", content: `前のスレッド「${元題}」のまとめです。この続きを話します。\n\n${文}` });
      今 = await API(`conversations/${今.id}`);
    } catch (e) { 知らせる(`新しいスレッドを作れませんでした(${e.message})`); return; }
    history.pushState(null, "", 道を作る(今.id, 筋.id));
    表示し直す(); 一覧読込(); 文欄.focus();
  });
  const 留 = ボタン("メモに足して新しいスレッドへ", async () => {
    const 文 = 欄.value.trim();
    if (!文) return;
    el.remove();
    await メモに文を足す(`(「${元題}」のまとめ)\n${文}`);
    if ($("メモ").value.length <= メモ上限) await 新スレッド();
  });
  const 止 = ボタン("やめる", () => { if (中断) 中断.abort(); el.remove(); });
  止.disabled = false;
  el.append(見出し, 欄, 行);
  会話欄.append(el);
  下へ();
  中断 = new AbortController();
  送受中にする(true);
  let 文 = "", 誤り = "";
  try {
    await 聞く(JSON.stringify({ thread: 元.id, summary: true }), (通知) => {
      if (通知.content) { 文 += 通知.content.replace(/\u2063/g, ""); 欄.value = 文; 欄.scrollTop = 欄.scrollHeight; }
      if (通知.error) 誤り = 通知.error;
    }, 中断.signal);
  } catch (e) { if (e.name !== "AbortError") 誤り = String(e.message || e); }
  中断 = null;
  送受中にする(false);
  if (!el.isConnected) return;
  欄.readOnly = false;
  見出し.textContent = 誤り ? `まとめられませんでした: ${誤り}` : "📝 このスレッドのまとめです。直してから選んでください(このスレッドには残りません)";
  頭.disabled = 留.disabled = !文.trim();
  欄.focus();
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
      今 = await API("conversations", "POST", { model: モデル欄.value, rules: 今の決まり() });
      新規決まり = null;
      if ($("指示").value || !$("温度既定").checked || $("砂場網").checked || $("メモ").value || 新規倉.length) 今 = await API(`conversations/${今.id}`, "PUT", { ...設定の値(), repos: 新規倉 });
      新規倉 = [];
      筋 = await API(`threads/${今.threads[0].id}`);
      history.replaceState(null, "", 道を作る(今.id, 筋.id));
    }
    文欄.value = "";
    文欄高さ();
    筋 = await API(`threads/${筋.id}/messages`, "POST", { role: "user", content: 質問 });
    await 会話読み直す();
  } catch (e) {
    知らせる(`送れませんでした(${e.message})`);
    return;
  }
  会話題表示();
  発言を足す("user", 質問);
  一覧読込();
  await 答えてもらう();
}

async function 作り直す() {
  if (!筋 || 中断) return;
  筋 = await API(`threads/${筋.id}/last-answer`, "DELETE");
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
$("新スレッド").addEventListener("click", 新スレッド);
$("横欄開く").addEventListener("click", () => { document.body.classList.add("横欄開"); $("覆い").hidden = false; });
$("横欄閉じる").addEventListener("click", 横欄閉じる);
$("覆い").addEventListener("click", 横欄閉じる);
$("指示").addEventListener("input", () => { if (!今) 保存する("指示", $("指示").value); });

// #会話/スレッド を開く。#会話 だけなら、その会話を開いていなければ一番新しく話したスレッドを開く
function 道から開く() {
  const 道 = 道を読む(location.hash);
  if (!道) { if (今) 新規(); return; }
  if (今 && 今.id === 道.会話 && 筋 && (道.スレッド === 0 || 筋.id === 道.スレッド)) {
    if (道.スレッド === 0) history.replaceState(null, "", 道を作る(今.id, 筋.id));
    return;
  }
  開く(道.会話, 道.スレッド);
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
  await 決まり読込();
  if (location.hash) 道から開く();
  else { 表示し直す(); 一覧読込(); }
})();
