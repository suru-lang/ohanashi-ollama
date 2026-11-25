// 答えが終わったときの、ブラウザの通知とタブの題の印の中身。
// 画面を見ていない間に答えが終わったら、動き.js がこれで通知の題と本文を作り、タブの題の頭に印を付けます。
// 書式.js の 途中を分ける を使うので、書式.js の後に読みます。
(() => {
  const 本文上限 = 100;
  const 印群 = ["✅ ", "⚠️ "];

  // Markdown の記号を除いて、1行の文にする。コードの塊は「(コード)」にする
  function コードを除く(文) {
    const 出 = [];
    let 柵 = null;
    for (const 行 of 文.split("\n")) {
      const m = 行.match(/^\s*(```+|~~~+)/);
      if (柵) { if (m && m[1].startsWith(柵)) 柵 = null; continue; }
      if (m) { 柵 = m[1]; 出.push("(コード)"); continue; }
      出.push(行);
    }
    return 出.join("\n");
  }

  function 平文にする(文) {
    return コードを除く((文 || "").replace(/\r\n?/g, "\n"))
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`+([^`]*)`+/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
      .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, "")
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      .replace(/\|/g, " ")
      .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function 縮める(文, 上限 = 本文上限) {
    const 字 = [...文];
    return 字.length > 上限 ? 字.slice(0, 上限 - 1).join("") + "…" : 文;
  }

  // 通知の中身。止めたときと、答えも誤りもないときは null
  // 答え は途中経過(道具の跡)を含む保存する形の文。途中経過を除いた答えの頭を本文にする
  function 通知の中身({ 題, 答え, 誤り, 止めた }) {
    if (止めた) return null;
    if (誤り) return { 題: 題 || "おはなし", 本文: 縮める(`失敗しました: ${平文にする(誤り)}`), 印: "⚠️ " };
    if (!答え) return null;
    const 分け = typeof window.途中を分ける === "function" ? window.途中を分ける(答え) : { 答え };
    const 本文 = 平文にする(分け.答え) || 平文にする(答え);
    return { 題: 題 || "おはなし", 本文: 縮める(本文 || "答えが終わりました"), 印: "✅ " };
  }

  // タブの題の頭の印を付け替える(前の印は外す)
  function 印を付ける(題, 印) {
    let 元 = 題 || "";
    for (const i of 印群) if (元.startsWith(i)) 元 = 元.slice(i.length);
    return (印 || "") + 元;
  }

  window.平文にする = 平文にする;
  window.通知の中身 = 通知の中身;
  window.印を付ける = 印を付ける;
})();
