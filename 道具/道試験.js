// 画面/道.js(#会話/スレッド の道を読む・作る)の試験。node 道具/道試験.js で動かします。
const fs = require("fs");
const path = require("path");
const window = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "画面", "道.js"), "utf8"))(window);

const 例 = [
  ["#12/3", { 会話: 12, スレッド: 3 }],
  ["#12", { 会話: 12, スレッド: 0 }],
  ["12/3", { 会話: 12, スレッド: 3 }],
  ["", null],
  ["#", null],
  ["#0", null],
  ["#a/1", null],
  ["#1/2/3", null],
];
let 不合格 = 0;
for (const [入, 期待] of 例) {
  const 実際 = window.道を読む(入);
  if (JSON.stringify(実際) !== JSON.stringify(期待)) { 不合格++; console.log(`✗ 道を読む ${JSON.stringify(入)}: 期待 ${JSON.stringify(期待)}・実際 ${JSON.stringify(実際)}`); }
}
for (const [会話, スレッド, 期待] of [[12, 3, "#12/3"], [12, 0, "#12"]]) {
  const 実際 = window.道を作る(会話, スレッド);
  if (実際 !== 期待) { 不合格++; console.log(`✗ 道を作る ${会話} ${スレッド}: 期待 ${期待}・実際 ${実際}`); }
}
console.log(`合格 ${例.length + 2 - 不合格}・不合格 ${不合格}`);
process.exit(不合格 ? 1 : 0);
