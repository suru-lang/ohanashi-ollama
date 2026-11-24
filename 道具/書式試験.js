// 画面/書式.js(Markdown を HTML にする)の試験。node 道具/書式試験.js で動かします。
const fs = require("fs");
const path = require("path");
const window = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "画面", "書式.js"), "utf8"))(window);
const 書式化 = window.書式化;

const 例 = [
  ["こんにちは", "<p>こんにちは</p>"],
  ["1行目\n2行目\n\n次", "<p>1行目<br>2行目</p><p>次</p>"],
  ["**太** と *斜* と `a<b`", "<p><strong>太</strong> と <em>斜</em> と <code>a&lt;b</code></p>"],
  ["## 見出し", "<h4>見出し</h4>"],
  ["- a\n- b", "<ul><li>a</li><li>b</li></ul>"],
  ["3. c\n4. d", '<ol start="3"><li>c</li><li>d</li></ol>'],
  ["```js\nlet x = 1 < 2;\n```", '<div class="コード"><span class="言語">js</span><button type="button" class="写す">写す</button><pre><code>let x = 1 &lt; 2;</code></pre></div>'],
  // 届いている途中で閉じていないコード
  ["```\nまだ", '<div class="コード"><button type="button" class="写す">写す</button><pre><code>まだ</code></pre></div>'],
  ["| a | b |\n|---|---|\n| 1 | 2 |", '<div class="表枠"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>'],
  ["> 引用", "<blockquote><p>引用</p></blockquote>"],
  ["[リンク](https://example.com/a?b=1&c=2)", '<p><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">リンク</a></p>'],
  // HTML と危ないリンクは文字のまま
  ['<img src=x onerror="alert(1)">', "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"],
  ["[x](javascript:alert(1))", "<p>[x](javascript:alert(1))</p>"],
  ['[x](https://a.example/" onmouseover="alert(1))', '<p>[x](<a href="https://a.example/&quot;" target="_blank" rel="noopener noreferrer">https://a.example/&quot;</a> onmouseover=&quot;alert(1))</p>'],
];

let 不合格 = 0;
for (const [入, 期待] of 例) {
  const 実際 = 書式化(入);
  if (実際 !== 期待) {
    不合格++;
    console.log(`✗ ${JSON.stringify(入)}\n    期待: ${期待}\n    実際: ${実際}`);
  }
}
// 途中経過(道具を使った跡)と最後の答えを分ける
const 途中を分ける = window.途中を分ける;
const 走 = "\n\n~~~~console\n$ ls\na.py\n~~~~\n\n";
const 書 = "\n\n📝 `a.py`(書きました)\n\n~~~~python\nprint(1)\n~~~~\n\n";
const 分け例 = [
  ["ただの答え", { 途中: "", 答え: "ただの答え", 手順: 0 }],
  ["```\n~~~~\n```\n答え", { 途中: "", 答え: "```\n~~~~\n```\n答え", 手順: 0 }],
  ["見ます" + 走 + "書きます" + 書 + "できました", { 途中: "見ます\n\n~~~~console\n$ ls\na.py\n~~~~\n\n書きます\n\n📝 `a.py`(書きました)\n\n~~~~python\nprint(1)\n~~~~", 答え: "できました", 手順: 2 }],
  ["\n\n🐙 o/r の README.md を読みました(2 行)\n\n読みました", { 途中: "🐙 o/r の README.md を読みました(2 行)", 答え: "読みました", 手順: 1 }],
  // 道具の後に答えがまだない(止めた・届いている途中)
  ["動かします" + 走, { 途中: "動かします\n\n~~~~console\n$ ls\na.py\n~~~~", 答え: "", 手順: 1 }],
  // 印のある答えは、印で分ける。モデルが書いた「🐙 」の行は道具ではない
  ["見ます" + 走 + "\u2063道具:run\n\n🐙 o/r に PR #2 を作りました\n\nできました", { 途中: "見ます\n\n~~~~console\n$ ls\na.py\n~~~~", 答え: "🐙 o/r に PR #2 を作りました\n\nできました", 手順: 1, 道具群: ["run"] }],
  ["\n\n🐙 o/r に PR [#3](https://github.com/o/r/pull/3) を作りました\n\n\u2063道具:github_pr\n\n作りました", { 途中: "🐙 o/r に PR [#3](https://github.com/o/r/pull/3) を作りました", 答え: "作りました", 手順: 1, 道具群: ["github_pr"] }],
];
for (const [入, 期待] of 分け例) {
  const 実際 = 途中を分ける(入);
  if (JSON.stringify(実際) !== JSON.stringify(期待)) {
    不合格++;
    console.log(`✗ 途中を分ける ${JSON.stringify(入)}\n    期待: ${JSON.stringify(期待)}\n    実際: ${JSON.stringify(実際)}`);
  }
}

console.log(`合格 ${例.length + 分け例.length - 不合格}・不合格 ${不合格}`);
process.exit(不合格 ? 1 : 0);
