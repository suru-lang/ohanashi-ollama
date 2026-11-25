// PDF をページごとに読む(画面/添付.js と 道具/頁試験.js から使う)。DOM は使わない。
// 文字のないページ(スキャンしたページなど)は、描く(頁) で画像にして、見えるモデルに読ませる。
(function (window) {
  const 空ページ字数 = 20; // これより字の少ないページは「文字のないページ」とする
  const 画像にする頁上限 = 8; // 1つの PDF から画像にするページの数(画像の上限と同じ)

  function 空ページか(文) { return 文.replace(/\s/g, "").length < 空ページ字数; }

  // 道具: pdf.js。読む: { data, cMapUrl, cMapPacked }。
  // 描く(頁): 文字のないページを画像にする({type, data, …} を返す)。はじめの 画像にする頁上限 ページまで。
  // 進む(今, 全部): 進み具合
  // 返すもの: { 頁群: [{ 番, 文, 空, 絵 }], pages }
  async function PDFを読む(道具, 読む, 描く, 進む) {
    const 書 = await 道具.getDocument(読む).promise;
    const 頁群 = [];
    let 描いた = 0;
    try {
      for (let i = 1; i <= 書.numPages; i++) {
        const 頁 = await 書.getPage(i);
        const 中 = await 頁.getTextContent();
        const 文 = 中.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
        const 項 = { 番: i, 文, 空: 空ページか(文), 絵: null };
        if (項.空 && 描く && 描いた < 画像にする頁上限) {
          try { 項.絵 = await 描く(頁); 描いた++; } catch { 項.絵 = null; }
        }
        頁群.push(項);
        頁.cleanup();
        if (進む) 進む(i, 書.numPages);
      }
      return { 頁群, pages: 書.numPages };
    } finally {
      書.destroy();
    }
  }

  // 送る文と画像を組む。画像にする: 印が付いているか。残り: ほかの画像を除いて、まだ添えられる画像の数
  // 返すもの: { text, 絵群: [{ 番, 絵 }], 外した: 画像にできたが数の上限で外したページの数 }
  function 頁を組む(頁群, 画像にする, 残り) {
    const 絵群 = [];
    let 外した = 0;
    const 文群 = 頁群.map((p) => {
      if (画像にする && p.絵) {
        if (絵群.length < 残り) { 絵群.push({ 番: p.番, 絵: p.絵 }); return `--- ${p.番} ページ ---\n(このページは画像で添えます)`; }
        外した++;
      }
      return `--- ${p.番} ページ ---\n${p.文}`;
    });
    return { text: 文群.join("\n\n"), 絵群, 外した };
  }

  function 空ページ数(頁群) { return 頁群.filter((p) => p.空).length; }

  window.頁 = { PDFを読む, 頁を組む, 空ページ数, 空ページか, 画像にする頁上限 };
})(typeof window !== "undefined" ? window : globalThis);
