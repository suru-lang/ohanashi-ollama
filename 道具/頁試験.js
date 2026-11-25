// 画面/頁.js(PDF の文字のないページを画像にする)の試験。node 道具/頁試験.js で動かします。
// 描くところ(canvas)は Node にないので、描いた印を返す偽の 描く で、どのページが画像になるかを確かめる。
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const window = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "画面", "頁.js"), "utf8"))(window);
const 頁 = window.頁;
const 外 = path.join(__dirname, "..", "画面", "外", "pdfjs");

let 不合格 = 0;
function 確かめる(名, 実際, 期待) {
  const a = JSON.stringify(実際), b = JSON.stringify(期待);
  if (a !== b) { 不合格++; console.error(`不合格: ${名}\n  期待: ${b}\n  実際: ${a}`); }
}

(async () => {
  const 道具 = await import(pathToFileURL(path.join(外, "pdf.min.mjs")).href);
  道具.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(外, "pdf.worker.min.mjs")).href;
  const data = new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "試験", "見本スキャン.pdf")));
  let 描いた数 = 0;
  const r = await 頁.PDFを読む(道具, { data, cMapUrl: path.join(外, "cmaps") + "/", cMapPacked: true }, async (p) => { 描いた数++; return { type: "image/jpeg", data: `頁${p.pageNumber}` }; });
  確かめる("見本スキャン.pdf のページの数", r.pages, 1);
  確かめる("見本スキャン.pdf の文字のないページ", 頁.空ページ数(r.頁群), 1);
  確かめる("見本スキャン.pdf で描いたページの数", 描いた数, 1);
  const 組 = 頁.頁を組む(r.頁群, true, 8);
  確かめる("見本スキャン.pdf から作る画像", 組.絵群.map((p) => p.絵.data), ["頁1"]);
  確かめる("見本スキャン.pdf の文", 組.text, "--- 1 ページ ---\n(このページは画像で添えます)");
  確かめる("印がなければ画像にしない", 頁.頁を組む(r.頁群, false, 8).絵群.length, 0);

  // 文のあるページは画像にしない。残りの枠を超えたら、はじめのページから
  const 群 = [
    { 番: 1, 文: "はじめに。この文書は試しのための文書です。", 空: false, 絵: null },
    { 番: 2, 文: "", 空: true, 絵: { data: "二" } },
    { 番: 3, 文: "図", 空: true, 絵: { data: "三" } },
  ];
  const 組2 = 頁.頁を組む(群, true, 1);
  確かめる("枠が1つなら、はじめのページだけ", 組2.絵群.map((p) => p.番), [2]);
  確かめる("外したページの数", 組2.外した, 1);
  確かめる("外したページは文のまま", 組2.text, "--- 1 ページ ---\nはじめに。この文書は試しのための文書です。\n\n--- 2 ページ ---\n(このページは画像で添えます)\n\n--- 3 ページ ---\n図");
  確かめる("空ページか", [頁.空ページか(" a b "), 頁.空ページか("あ".repeat(20))], [true, false]);

  if (不合格) { console.error(`${不合格} 件 不合格`); process.exit(1); }
  console.log("合格");
})().catch((e) => { console.error(e); process.exit(1); });
