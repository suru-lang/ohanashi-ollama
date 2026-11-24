// おはなし の画面。会話はサーバーが SQLite にしまい、画面は送る前と答えの後に発言を保存します。
// 答えは WebSocket(ws)で受け取ります。{"conversation":番号} を送ると、1つずつの JSON
// ({"content"}・{"thinking"}・{"stats"}・{"error"})が届き、最後に {"done":true} が届きます。
// WebSocket につなげないときは、POST api/chat で同じ JSON を1行ずつ受け取ります。

const $ = (id) => document.getElementById(id);
const 会話欄 = $("会話");
const 文欄 = $("文");
const 送るボタン = $("送る");
const 止めるボタン = $("止める");
const モデル欄 = $("モデル");
const 題欄 = $("題");

let 今 = null;          // 開いている会話 {id, title, model, system, temperature, messages}
let 中断 = null;        // 答えを受け取っている間の AbortController
let 接続 = null;        // 開いている WebSocket
let WebSocket可 = true; // つなげなかったら、fetch に切り替える
let モデル群 = [];

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

// --- 設定(指示と温度) ---

function 設定欄表示() {
  $("指示").value = 今 ? 今.system : 保存値("指示", "");
  const 温度 = 今 ? 今.temperature : -1;
  $("温度既定").checked = 温度 < 0;
  $("温度").disabled = 温度 < 0;
  $("温度").value = 温度 < 0 ? 0.8 : 温度;
  $("温度値").textContent = $("温度").value;
}

function 設定の値() {
  return { system: $("指示").value, temperature: $("温度既定").checked ? -1 : Number($("温度").value) };
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
  let 答え = "", 考え = "", 誤り = "", 統計 = null, 描く予定 = false;
  中断 = new AbortController();
  送受中にする(true);
  const 描く = () => {
    描く予定 = false;
    中身を書く(el, 答え);
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
    if (!描く予定) { 描く予定 = true; requestAnimationFrame(描く); }
  };
  let 止めた = false;
  try {
    await 聞く(JSON.stringify({ conversation: 今.id }), 受け取る, 中断.signal);
  } catch (e) {
    if (e.name === "AbortError") 止めた = true;
    else 誤り = String(e.message || e);
  }
  描く();
  el.classList.remove("待ち");
  const 番号 = 今.id;
  if (答え) {
    try { 今 = await API(`conversations/${番号}/messages`, "POST", { role: "assistant", content: 答え }); }
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
      if ($("指示").value || !$("温度既定").checked) 今 = await API(`conversations/${今.id}`, "PUT", 設定の値());
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

// --- 始める ---

(async () => {
  API("info").then((i) => {
    $("接続先").textContent = i.version ? `Ollama ${i.version} · ${i.ollama}` : `${i.ollama}(つながっていません)`;
  }).catch(() => {});
  await モデル読込();
  if (location.hash) 道から開く();
  else { 表示し直す(); 一覧読込(); }
})();
