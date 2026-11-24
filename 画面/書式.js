// LLM の答えの Markdown を HTML にする小さな変換。
// 先に全部の文字を HTML として逃がしてから印を付けるので、答えの中の HTML はそのまま文字として出ます。
// 扱うもの: ``` のコード、`コード`、見出し、箇条書き(- * + と 1.)、引用、表、横線、**太字**、*斜体*、~~消し線~~、リンク(http・https だけ)。

(function () {
  function 逃がす(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // 行の中の書式。`コード` の中は書式にしない
  function 行内(s) {
    const 部分 = s.split(/(`+[^`]*?`+)/);
    return 部分.map((p, i) => {
      if (i % 2 === 1) return "<code>" + 逃がす(p.replace(/^`+|`+$/g, "")) + "</code>";
      let t = 逃がす(p);
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
      t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
      t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
      return t;
    }).join("");
  }

  function 表の行(行) {
    return 行.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  }

  function 書式化(文) {
    const 行群 = 文.replace(/\r\n?/g, "\n").split("\n");
    const 出 = [];
    let i = 0;
    while (i < 行群.length) {
      const 行 = 行群[i];
      // コードの塊(閉じていなければ最後まで。届いている途中でも崩れないように)
      const 柵 = 行.match(/^\s*(```+|~~~+)\s*([\w+#.-]*)/);
      if (柵) {
        const 中 = [];
        i++;
        while (i < 行群.length && !行群[i].trim().startsWith(柵[1])) { 中.push(行群[i]); i++; }
        i++;
        const 言語 = 柵[2] ? `<span class="言語">${逃がす(柵[2])}</span>` : "";
        出.push(`<div class="コード">${言語}<button type="button" class="写す">写す</button><pre><code>${逃がす(中.join("\n"))}</code></pre></div>`);
        continue;
      }
      if (/^\s*$/.test(行)) { i++; continue; }
      const 見出し = 行.match(/^(#{1,6})\s+(.*)$/);
      if (見出し) {
        const n = Math.min(見出し[1].length + 2, 6);
        出.push(`<h${n}>${行内(見出し[2])}</h${n}>`);
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(行)) { 出.push("<hr>"); i++; continue; }
      // 表: 2行目が |---|---| の形
      if (行.includes("|") && i + 1 < 行群.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(行群[i + 1])) {
        const 頭 = 表の行(行);
        i += 2;
        const 体 = [];
        while (i < 行群.length && 行群[i].includes("|") && 行群[i].trim() !== "") { 体.push(表の行(行群[i])); i++; }
        出.push("<div class=\"表枠\"><table><thead><tr>" + 頭.map((c) => `<th>${行内(c)}</th>`).join("") + "</tr></thead><tbody>" +
          体.map((r) => "<tr>" + r.map((c) => `<td>${行内(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>");
        continue;
      }
      if (/^\s*>/.test(行)) {
        const 中 = [];
        while (i < 行群.length && /^\s*>/.test(行群[i])) { 中.push(行群[i].replace(/^\s*>\s?/, "")); i++; }
        出.push(`<blockquote>${書式化(中.join("\n"))}</blockquote>`);
        continue;
      }
      const 箇条 = 行.match(/^(\s*)([-*+]|\d+[.)])\s+/);
      if (箇条) {
        const 番号付き = /\d/.test(箇条[2]);
        const 項目 = [];
        while (i < 行群.length) {
          const m = 行群[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (m && /\d/.test(m[2]) === 番号付き && m[1].length <= 箇条[1].length + 1) { 項目.push(m[3]); i++; continue; }
          // 字下げした続きの行は、前の項目の続き
          if (項目.length && /^\s{2,}\S/.test(行群[i])) { 項目[項目.length - 1] += "\n" + 行群[i].trim(); i++; continue; }
          break;
        }
        const 札 = 番号付き ? "ol" : "ul";
        const 始め = 番号付き ? parseInt(箇条[2], 10) : 1;
        const 属性 = 番号付き && 始め !== 1 ? ` start="${始め}"` : "";
        出.push(`<${札}${属性}>` + 項目.map((t) => `<li>${t.includes("\n") ? 書式化(t) : 行内(t)}</li>`).join("") + `</${札}>`);
        continue;
      }
      // ふつうの段落: 空の行か、ほかの塊の始まりまで
      const 段 = [];
      while (i < 行群.length && 行群[i].trim() !== "" && !/^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(行群[i])) { 段.push(行群[i]); i++; }
      if (段.length === 0) { 段.push(行群[i]); i++; }
      出.push("<p>" + 段.map(行内).join("<br>") + "</p>");
    }
    return 出.join("");
  }

  window.書式化 = 書式化;
})();
