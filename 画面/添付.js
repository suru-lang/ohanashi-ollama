// 問いに添えるもの(画像・PDF・文字のファイル)。画面に落とす・入力欄に貼る・📎 で選ぶ、のどれでも足せます。
// 画像は長い辺 1600px までに縮めて JPEG(透明があれば PNG)にし、base64 で送ります。見えるモデル(qwen2.5vl・gemma3 など)が読みます。
// PDF は pdf.js(外/pdfjs/、はじめて PDF を添えたときに読む)でページごとに文を取り出し、文字のファイルはそのまま読みます。
// 取り出した文は、サーバーがモデルに送るときに問いの前に <file name="…">…</file> で囲んで入れます(どのモデルでも読めます)。
// 送るときの形: {"kind":"image","name":…,"type":"image/jpeg","data":"base64…"} か {"kind":"text","name":…,"type":…,"text":…,"pages":…}

const 画像上限 = 8;              // 1つの問いに添える画像の数
const 長辺上限 = 1600;            // 画像の長い辺(px)
const PDF上限 = 20 * 1024 * 1024; // PDF の大きさ
const 文書ファイル上限 = 5 * 1024 * 1024; // 文字のファイルの大きさ
const 文書字数上限 = 100000;      // 1つの問いに添える文の合計の字数
const 長い文書 = 8000;            // これを超えたら、モデルの文脈に入りきらないかもしれないと出す
const 空ページ字数 = 20;          // これより字の少ないページは「文字のないページ」とする

// 文字のファイルとして読む拡張子(type が text/ でなくても)
const 文書拡張子 = new Set("txt md markdown csv tsv json jsonl yaml yml toml xml html htm css js mjs ts tsx jsx py rb go rs c h cpp hpp cc java kt swift sh bash zsh sql suru ini cfg conf log tex rst".split(" "));

let 添付待ち = [];   // 送る前の添付 [{番, kind, name, type, data, text, pages, 様子, 誤り, 絵URL, 空頁}]
let 添付番 = 0;

function 拡張子(名) { const i = 名.lastIndexOf("."); return i < 0 ? "" : 名.slice(i + 1).toLowerCase(); }
function 字数表示(n) { return n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, "")} 万字` : `${n} 字`; }
function 文書札(a) { return `📄 ${a.name}(${a.pages ? `${a.pages} ページ・` : ""}${字数表示(a.chars ?? (a.text || "").length)})`; }

function base64にする(blob) {
  return new Promise((解決, 失敗) => {
    const r = new FileReader();
    r.onload = () => 解決(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => 失敗(r.error);
    r.readAsDataURL(blob);
  });
}

function 透明がある(x, w, h) {
  const d = x.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

// 画像を縮めて、JPEG(透明があれば PNG)の base64 にする
async function 画像を整える(file) {
  let 絵;
  try { 絵 = await createImageBitmap(file); }
  catch { throw new Error("この画像は読めませんでした(HEIC などは、ブラウザによっては読めません。JPEG か PNG にしてください)"); }
  const 倍 = Math.min(1, 長辺上限 / Math.max(絵.width, 絵.height));
  const w = Math.max(1, Math.round(絵.width * 倍)), h = Math.max(1, Math.round(絵.height * 倍));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.drawImage(絵, 0, 0, w, h);
  if (絵.close) 絵.close();
  const 型 = file.type !== "image/jpeg" && 透明がある(x, w, h) ? "image/png" : "image/jpeg";
  const blob = await new Promise((解決) => c.toBlob(解決, 型, 0.85));
  if (!blob) throw new Error("画像を作り直せませんでした");
  return { type: 型, data: await base64にする(blob), 絵URL: URL.createObjectURL(blob) };
}

// --- PDF ---

let pdf道具 = null;
function 画面の道(道) { return new URL(道, location.href.replace(/#.*$/, "")).href; }

async function pdf読込() {
  if (!pdf道具) {
    pdf道具 = await import(画面の道("外/pdfjs/pdf.min.mjs"));
    pdf道具.GlobalWorkerOptions.workerSrc = 画面の道("外/pdfjs/pdf.worker.min.mjs");
  }
  return pdf道具;
}

// ページごとの文を「--- 3 ページ ---」の区切りでつなぐ。進む(今, 全部) で進み具合を知らせる
async function PDFの文(file, 進む) {
  const 道具 = await pdf読込();
  const 書 = await 道具.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: 画面の道("外/pdfjs/cmaps/"),
    cMapPacked: true,
  }).promise;
  const 頁群 = [];
  let 空頁 = 0;
  try {
    for (let i = 1; i <= 書.numPages; i++) {
      const 頁 = await 書.getPage(i);
      const 中 = await 頁.getTextContent();
      const 文 = 中.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
      if (文.replace(/\s/g, "").length < 空ページ字数) 空頁++;
      頁群.push(`--- ${i} ページ ---\n${文}`);
      頁.cleanup();
      進む(i, 書.numPages);
    }
    return { text: 頁群.join("\n\n"), pages: 書.numPages, 空頁 };
  } finally {
    書.destroy();
  }
}

// --- 足す・外す ---

function 文書ファイルか(file) {
  return file.type.startsWith("text/") || /^application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql)$/.test(file.type) || 文書拡張子.has(拡張子(file.name));
}

function 待ち文字数(除く) { return 添付待ち.filter((a) => a !== 除く && a.kind === "text" && !a.誤り).reduce((n, a) => n + (a.text || "").length, 0); }

async function ファイルを添える(ファイル群) {
  for (const file of ファイル群) {
    const a = { 番: ++添付番, name: file.name || "貼り付けた画像", type: file.type || "", 様子: "読んでいます…" };
    const PDFか = file.type === "application/pdf" || 拡張子(file.name) === "pdf";
    if (file.type.startsWith("image/")) {
      a.kind = "image";
      if (添付待ち.filter((x) => x.kind === "image").length >= 画像上限) { 知らせる(`画像は1つの問いに ${画像上限} 枚までです。`); continue; }
    } else if (PDFか || 文書ファイルか(file)) {
      a.kind = "text";
    } else {
      知らせる(`${a.name} は添えられません(画像・PDF・文字のファイルを添えられます)。`);
      continue;
    }
    添付待ち.push(a);
    添付欄表示();
    try {
      if (a.kind === "image") {
        Object.assign(a, await 画像を整える(file));
      } else if (PDFか) {
        if (file.size > PDF上限) throw new Error(`PDF は ${PDF上限 / 1024 / 1024}MB までです`);
        a.type = "application/pdf";
        const r = await PDFの文(file, (今, 全部) => { a.様子 = `読んでいます ${今}/${全部}`; 添付欄表示(); });
        Object.assign(a, r);
        if (r.空頁 === r.pages) a.注意 = "文字がほとんどありません(スキャンした PDF かもしれません)";
        else if (r.空頁) a.注意 = `${r.空頁} ページは文字がありません`;
      } else {
        if (file.size > 文書ファイル上限) throw new Error(`文字のファイルは ${文書ファイル上限 / 1024 / 1024}MB までです`);
        a.text = await file.text();
        a.type = a.type || "text/plain";
      }
      if (a.kind === "text" && 待ち文字数(a) + a.text.length > 文書字数上限) throw new Error(`添える文は合わせて ${字数表示(文書字数上限)}までです(これは ${字数表示(a.text.length)})`);
      delete a.様子;
    } catch (e) {
      delete a.様子;
      a.誤り = e.message || String(e);
    }
    添付欄表示();
  }
}

function 添付を外す(a) {
  if (a.絵URL) URL.revokeObjectURL(a.絵URL);
  添付待ち = 添付待ち.filter((x) => x !== a);
  添付欄表示();
}

function 添付を空にする() {
  for (const a of 添付待ち) if (a.絵URL) URL.revokeObjectURL(a.絵URL);
  添付待ち = [];
  添付欄表示();
}

function 添付欄表示() {
  const 欄 = $("添付欄");
  欄.textContent = "";
  欄.hidden = !添付待ち.length;
  for (const a of 添付待ち) {
    const el = document.createElement("div");
    el.className = "添付" + (a.誤り ? " 誤り" : "");
    if (a.kind === "image" && a.絵URL) {
      const img = document.createElement("img");
      img.src = a.絵URL;
      img.alt = a.name;
      el.append(img);
    }
    const 字 = document.createElement("span");
    字.className = "名";
    字.textContent = a.kind === "image" ? (a.絵URL ? "" : `🖼 ${a.name}`) : (a.text !== undefined ? 文書札(a) : `📄 ${a.name}`);
    if (字.textContent) el.append(字);
    const 下 = a.様子 || a.誤り || a.注意;
    if (下) {
      const s = document.createElement("span");
      s.className = "様子 小字";
      s.textContent = 下;
      el.append(s);
    }
    el.title = a.name;
    const 外 = document.createElement("button");
    外.type = "button";
    外.className = "外す";
    外.textContent = "✕";
    外.setAttribute("aria-label", `${a.name} を外す`);
    外.addEventListener("click", () => 添付を外す(a));
    el.append(外);
    欄.append(el);
  }
  const n = 待ち文字数();
  if (n > 長い文書) {
    const s = document.createElement("div");
    s.className = "添付注意 淡 小字";
    s.textContent = `添える文が ${字数表示(n)}あります。モデルの文脈(多くは 8192 トークン)に入りきらず、後ろが読まれないかもしれません。`;
    欄.append(s);
  }
}

// 送る添付。まだ読んでいる・読めなかったものがあれば、理由を投げる
function 送る添付() {
  if (添付待ち.some((a) => a.様子)) throw new Error("添付を読んでいます。読み終わってから送ってください");
  if (添付待ち.some((a) => a.誤り)) throw new Error("読めなかった添付を ✕ で外してから送ってください");
  return 添付待ち.map((a) => a.kind === "image"
    ? { kind: "image", name: a.name, type: a.type, data: a.data }
    : { kind: "text", name: a.name, type: a.type, text: a.text, pages: a.pages || 0 });
}

// --- 発言の下に出す ---

function 添付を出す(el, 添付群) {
  if (!添付群 || !添付群.length) return;
  const 列 = document.createElement("div");
  列.className = "添付列";
  for (const a of 添付群) {
    const リンク = document.createElement("a");
    リンク.href = `api/attachments/${a.id}`;
    リンク.target = "_blank";
    リンク.rel = "noopener";
    リンク.title = a.name;
    if (a.kind === "image") {
      リンク.className = "絵";
      const img = document.createElement("img");
      img.src = リンク.href;
      img.alt = a.name;
      img.loading = "lazy";
      リンク.append(img);
    } else {
      リンク.className = "札";
      リンク.textContent = 文書札(a);
    }
    列.append(リンク);
  }
  el.querySelector(".本文").after(列);
}

// --- 落とす・貼る・選ぶ ---

function ファイルを運んでいる(e) { return e.dataTransfer && [...e.dataTransfer.types].includes("Files"); }
let 運び数 = 0;
document.addEventListener("dragenter", (e) => { if (!ファイルを運んでいる(e)) return; e.preventDefault(); 運び数++; $("落とし覆い").hidden = false; });
document.addEventListener("dragover", (e) => { if (!ファイルを運んでいる(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
document.addEventListener("dragleave", (e) => { if (!ファイルを運んでいる(e)) return; if (--運び数 <= 0) { 運び数 = 0; $("落とし覆い").hidden = true; } });
document.addEventListener("drop", (e) => {
  if (!ファイルを運んでいる(e)) return;
  e.preventDefault();
  運び数 = 0;
  $("落とし覆い").hidden = true;
  if (e.dataTransfer.files.length) ファイルを添える([...e.dataTransfer.files]);
});
$("文").addEventListener("paste", (e) => {
  const 群 = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!群.length) return;
  e.preventDefault();
  ファイルを添える(群);
});
$("添付ボタン").addEventListener("click", () => $("添付選択").click());
$("添付選択").addEventListener("change", (e) => { const 群 = [...e.target.files]; e.target.value = ""; ファイルを添える(群); });
