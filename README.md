# ohanashi-ollama(おはなし)

手元のコンピューターで動く [Ollama](https://ollama.com/) の LLM と、ブラウザでおしゃべりする Web アプリです。サーバーは日本語のプログラミング言語「[する](https://github.com/suru-lang/suru)」で書いてあり、1つの実行ファイルになります。

- モデルを画面で選べます(Ollama に入っているモデルの一覧から)
- 会話は SQLite のファイルにしまうので、閉じても続きから話せます。左の一覧から前の会話を開けます
- 答えは届いたところから少しずつ出ます。「止める」で途中で止められます(そこまでの答えは残ります)
- 答えの Markdown(コード・箇条書き・表など)を整えて出し、コードは「写す」でコピーできます
- 会話ごとに、指示(システムプロンプト)と温度を決められます
- 考えるモデル(qwen3・deepseek-r1 など)の考えている途中の文は、たたんで出します
- 最後の答えを「作り直す」、失敗したら「もう一度」
- 答えの速さ(トークン/秒)を出します
- スマートフォンの幅でも使えます。暗い色の設定にも合わせます

## 動かし方

要るもの:

- [Ollama](https://ollama.com/download) と、モデルを1つ以上(`ollama pull llama3.2` など)
- する 本体 0.3.0 以上(`kumu` と clang)。入れ方は [する の README](https://github.com/suru-lang/suru#入れ方)
- libsqlite3(`kumu` が足りなければ入れ方を出します。macOS: `brew install sqlite` と `export PKG_CONFIG_PATH="$(brew --prefix sqlite)/lib/pkgconfig"`、Debian・Ubuntu: `sudo apt install libsqlite3-dev`)

```sh
git clone https://github.com/suru-lang/ohanashi-ollama
cd ohanashi-ollama
kumu 実行
```

起動したら、ブラウザで http://localhost:8080/ を開きます。画面のファイルは今のフォルダの `画面/` から読むので、このフォルダで起動してください。

### 引数

```sh
kumu 実行 -- --port 9000 --db ~/おはなし.db
./出力/ohanashi-ollama --ollama http://192.168.1.10:11434
```

| 引数 | 意味 | 既定 |
|---|---|---|
| `--ollama URL` | Ollama の場所 | 環境変数 `OLLAMA_HOST`、なければ `http://localhost:11434` |
| `--port ポート` | 画面を開くポート | 8080 |
| `--db ファイル` | 会話をしまう SQLite のファイル | `ohanashi.db` |
| `--screen フォルダ` | 画面のファイルのフォルダ | `画面` |

**注意:** 今の する は、すべてのネットワークの口(0.0.0.0)で待ち受けます。同じネットワークのほかの機械からも画面を開けて、会話を読めます。信用できないネットワークでは、ファイアウォールでポートを閉じてください。ほかのサイトのページから会話を読み書きされないように、`Origin` の見出しが自分と違う要求は断ります。

## 試験

```sh
kumu 試験                   # 会話帳(SQLite)・Ollama の行の読み方・引数の試験
node 道具/書式試験.js        # 画面の Markdown の変換の試験
```

本物の LLM の代わりに、決まった答えを返す偽の Ollama([道具/偽Ollama.suru](道具/偽Ollama.suru))で、全部を動かして確かめられます。

```sh
suru 道具/偽Ollama.suru &                       # http://localhost:11435
kumu 実行 -- --ollama http://localhost:11435 --db 出力/試し.db
```

偽の Ollama は、最後の発言に「おうむ返し: 」を付けて1文字ずつ返します。モデル「偽-考える」は先に考えを流し、「書式」を含む問いには Markdown の見本を返します。GitHub Actions では、これを相手に curl と Node の WebSocket で確かめています([.github/workflows/試験.yml](.github/workflows/試験.yml))。

## 作り

| ファイル | 中身 |
|---|---|
| [本体.suru](本体.suru) | サーバー。道ごとの答え、WebSocket、Ollama の答えをブラウザへ流すところ |
| [会話帳.suru](会話帳.suru) | 会話と発言を SQLite にしまう |
| [Ollama.suru](Ollama.suru) | Ollama の API(`/api/chat`・`/api/tags`・`/api/version`)とのやりとり |
| [設定.suru](設定.suru) | 起動の引数と `OLLAMA_HOST` |
| [画面/](画面/) | HTML・CSS・JavaScript(`書式.js` は Markdown の変換) |

依存は [suru-lang/http](https://github.com/suru-lang/http)(HTTP・WebSocket・HTTP クライアント)と [suru-lang/sqlite](https://github.com/suru-lang/sqlite) です。

### サーバーの道

| 道 | 答え |
|---|---|
| `GET /api/info` | Ollama の場所と版 |
| `GET /api/models` | 入っているモデルの名前 `{"models":[…]}` |
| `GET /api/conversations` | 会話の一覧(新しく話した順) |
| `POST /api/conversations` | 会話を作る `{"model":…}` |
| `GET・PUT・DELETE /api/conversations/番号` | 会話の中身を読む・題とモデルと指示と温度を変える・消す |
| `POST /api/conversations/番号/messages` | 発言を足す `{"role":"user"か"assistant","content":…}` |
| `DELETE /api/conversations/番号/last-answer` | 最後の答えを消す(作り直すとき) |
| `GET /ws`(WebSocket) | `{"conversation":番号}` が届くたびに、その会話を Ollama へ送り、答えを流す |
| `POST /api/chat` | WebSocket を使えないときの同じもの(1行1つの JSON) |

流す答えは1つずつの JSON です: `{"content":…}`(答えの続き)、`{"thinking":…}`(考え)、`{"stats":{"tokens":…,"seconds":…}}`、`{"error":…}`。WebSocket では最後に `{"done":true}` を送ります。

## 決めたこと

### 会話のしまい方

1. **会話はサーバーの SQLite にしまう。** 表は `会話`(番号・題・モデル・指示・温度・作成・更新)と `発言`(会話・役・内容・作成)です。時刻は UNIX 時間の秒です。温度が負ならモデルの既定の温度を使います。
2. **発言を保存するのは画面。** 画面は、問いを送る前に問いを、答えを受け取り終わったら(止めたときも、そこまでの)答えを保存します。サーバーは、答えを流すときに会話の発言をデータベースから読んで Ollama に送ります。答えが1文字も届かなかったときは、答えを保存しないので、「もう一度」で同じ問いを聞き直せます。
3. **題は最初の問いから。** 題が空の会話に最初の問いを足すと、その1行目のはじめの 40 文字を題にします。画面で題をクリックすると変えられます。
4. **考えは保存しない。** 考えるモデルの考え(`thinking`)は画面に出すだけで、次に送る発言には入れません(Ollama の勧めのとおり)。
5. **要求ごとにデータベースを開いて閉じる。** 答えを流している間はデータベースを開いたままにしません。同時の書き込みは `busy_timeout` で待ちます。

### 画面

1. **画面は1つのページ。** 開いている会話は道の `#番号` で、読み込み直しても同じ会話を開きます。
2. **Markdown は自前の小さな変換で。** 外のライブラリを読まないので、ネットワークにつながっていなくても動きます。先に全部の文字を HTML として逃がしてから書式を付けるので、答えに HTML があっても文字のまま出ます。リンクは http と https だけです。
3. **止めるときは WebSocket を閉じる。** サーバーは次に送るところで失敗して、Ollama への接続も閉じます(Ollama も答えを作るのをやめます)。次に送るときにつなぎ直します。

## 今後の候補

- 外からつなげないように、127.0.0.1 だけで待ち受ける(する の「通信」に、待ち受けるアドレスを選べる関数が要ります)
- 画面のファイルを実行ファイルに入れて、どのフォルダからでも起動できるようにする
- 会話を探す、Markdown・JSON に書き出す
- 画像を送る(Ollama の `images`、見えるモデル)
- モデルを画面から入れる(`/api/pull`)、使っていないモデルを片付ける
- 長い会話を、モデルの文脈の長さ(`num_ctx`)に合わせて切り詰める
- 問いを書き直して、そこから先を作り直す

## ライセンス

[MIT](LICENSE)
