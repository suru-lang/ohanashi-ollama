# ohanashi-ollama(おはなし)

手元のコンピューターで動く [Ollama](https://ollama.com/) の LLM と、ブラウザでおしゃべりする Web アプリです。サーバーは日本語のプログラミング言語「[する](https://github.com/suru-lang/suru)」で書いてあり、1つの実行ファイルになります。

- モデルを画面で選べます(Ollama に入っているモデルの一覧から)
- 会話は SQLite のファイルにしまうので、閉じても続きから話せます。左の一覧から前の会話を開けます
- 左の「会話を探す」で、題と発言の中身から会話を探せます。開くと見つかった所に印が付きます
- 答えは届いたところから少しずつ出ます。「止める」で途中で止められます(そこまでの答えは残ります)
- 答えの Markdown(コード・箇条書き・表など)を整えて出し、コードは「写す」でコピーできます
- 会話ごとに、指示(システムプロンプト)と温度を決められます
- 考えるモデル(qwen3・deepseek-r1 など)の考えている途中の文は、たたんで出します
- 「💻 砂場」を押しておくと、モデルが Docker のコンテナの中でコードを書いて動かし、結果を確かめてから答えます(Docker と、道具を使えるモデルが要ります)。会話ごとに、コンテナからインターネットにつないで pip・apt を使えるようにもできます
- 最後の答えを「作り直す」、失敗したら「もう一度」
- 答えの速さ(トークン/秒)を出します
- 「🌐 ウェブ」を押しておくと、ウェブで調べてから答えます。答えの終わりに出典が付きます(自分で動かす SearXNG か、Ollama の API キーが要ります)
- 「🐙 GitHub」を押しておくと、モデルが会話に足した GitHub のリポジトリ(設定・ファイルの一覧・ファイル・issue と PR)を読んでから答えます。リポジトリは会話ごとに ⚙ の設定で足し、「読むだけ」か「読み書き」を選びます
- スマートフォンの幅でも使えます。暗い色の設定にも合わせます

## 動かし方

要るもの:

- [Ollama](https://ollama.com/download) と、モデルを1つ以上(`ollama pull llama3.2` など)
- する 本体 0.3.0 以上(`kumu` と clang)。入れ方は [する の README](https://github.com/suru-lang/suru#入れ方)
- libsqlite3 と OpenSSL(`kumu` が足りなければ入れ方を出します)
  - macOS: `brew install sqlite openssl@3` と `export PKG_CONFIG_PATH="$(brew --prefix sqlite)/lib/pkgconfig:$(brew --prefix openssl@3)/lib/pkgconfig"`
  - Debian・Ubuntu: `sudo apt install libsqlite3-dev libssl-dev`

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
| `--searxng URL` | ウェブ検索に使う SearXNG | 環境変数 `SEARXNG_URL`、なければ使わない |
| `--sandbox-image イメージ` | 砂場のコンテナのイメージ | `python:3.12-slim` |
| `--sandbox-network ネットワーク` | 砂場のコンテナの `--network` | `none`(外につながらない) |
| `--work フォルダ` | 砂場と共有する作業フォルダの親 | `作業` |
| `--web-search URL` | ウェブ検索の API | `https://ollama.com/api/web_search` |
| `--control フォルダ` | 起動.sh と話すフォルダ(起動.sh が付けます) | なし(画面から再起動できない) |
| `--revision 版` | 画面に出す版(起動.sh がコミットを付けます) | なし |
| `--github-repos 一覧` | 会話に足してよい GitHub のリポジトリ(`owner/名前` か `owner/*` を「,」で区切る) | なし(GitHub を使わない) |
| `--github-token 鍵` | GitHub の鍵(個人アクセストークン) | 環境変数 `GITHUB_TOKEN`、なければ鍵なし(公開のリポジトリだけ、1時間に60回まで) |
| `--github-api URL` | GitHub の API の基点(GitHub Enterprise なら `https://主機/api/v3`) | `https://api.github.com` |

### 起動.sh で動かす(画面から再起動・新しいコミットで更新)

```sh
./起動.sh                          # kumu 作る をしてから動かす
./起動.sh --watch 60 -- --port 9000 # 60 秒ごとに新しいコミットを見る。-- の後ろはアプリの引数
```

`起動.sh` で動かすと、画面の ⚙ に版と「🔄 最新にして再起動」が出ます。押すと、`git pull --ff-only` → `kumu 作る` → アプリを動かし直す、をして、画面を読み直します。

`--watch 秒` を付けると、その秒ごとに `git fetch` して、追っている枝(`main` など)に新しいコミットがあれば同じように更新します。PR をマージすると、しばらくして手元のアプリが新しくなります(かんたんな CD)。

作り直しに失敗したとき(`git pull` できない・`kumu 作る` が通らない)は、前のアプリを動かしたままにして、画面の ⚙ と端末に理由を出します。失敗したコミットは、次の新しいコミットが来るまで試し直しません。`起動.sh` そのものの変更は、`起動.sh` を動かし直したときに効きます。Ctrl-C でアプリといっしょに止まります。

**注意:** 画面を開ける人は、だれでも再起動を頼めます(手元の枝を最新にして作り直すだけで、ほかのコードは動かせません)。

### ウェブで調べる

ウェブ検索には、自分で動かす [SearXNG](https://docs.searxng.org/) か、[Ollama の web 検索 API](https://docs.ollama.com/capabilities/web-search) を使います。両方あれば SearXNG を使います。どちらもないと「🌐 ウェブ」のボタンは押せません。

**SearXNG**(アカウントもキーも要りません)。Docker なら次のように動かします。

```sh
mkdir -p searxng
docker run -d --name searxng -p 8888:8080 -v "$PWD/searxng:/etc/searxng" searxng/searxng
```

最初に起動すると `searxng/settings.yml` ができます。JSON で答えるのを許すように、ファイルの終わりに次を足して(足さないと JSON の要求は 403 で断られます)、`docker restart searxng` します。`server:` に `limiter: true` があれば `false` にします。

```yaml
search:
  formats:
    - html
    - json
```

`curl 'http://localhost:8888/search?q=test&format=json'` で JSON が返れば準備はできています。そのあと SearXNG の URL を渡して起動します。

```sh
SEARXNG_URL=http://localhost:8888 kumu 実行
```

**Ollama の web 検索 API**。ollama.com にサインインして [API キー](https://ollama.com/settings/keys)を作り、環境変数 `OLLAMA_API_KEY` に入れて起動します。

```sh
OLLAMA_API_KEY=キー kumu 実行
```

起動すると「ウェブ検索: SearXNG(…)を使います。」のように、何で調べるかを出します。SearXNG は起動したときに1回聞いてみて、使えなければ理由を出します。

調べた言葉(最後の問い)は SearXNG から検索サービスへ、または ollama.com へ送られます。ローカルの外に出したくない問いでは、ボタンを押さないでください。

### 砂場でコードを動かす

[Docker](https://www.docker.com/products/docker-desktop/) を動かしておくと、入力欄の横の「💻 砂場」を押せます。押して送ると、モデルに2つの道具を渡します。

- `run`: シェルのコマンドを動かす(1つ 120 秒まで)
- `write_file`: ファイルを書く

モデルが道具を呼ぶと、会話ごとのコンテナ(`ohanashi-ポート-会話の番号`)の中で行い、結果をモデルに返して続きを答えてもらいます(1つの答えで 10 回まで)。書いたファイルとコマンドの出力は、答えの中にそのまま出ます。コンテナの `/work` は手元の `作業/会話の番号` と同じフォルダなので、できたファイルを手元で開けます。

道具を使えるモデル(qwen3 など)で使ってください。はじめて使うときはイメージを取ってくるので、先に `docker pull python:3.12-slim` しておくと待たずに済みます。コンテナは、はじめは外のネットワークにつながらないので、`pip install` や `apt-get install` はできません。使いたい会話では、⚙ の設定の「💻 砂場からインターネットにつなぐ」に印を付けます。次に砂場を使うときに、コンテナを `--network bridge` で作り直します(作業フォルダのファイルは残りますが、それまでに入れたものは消えます)。すべての会話でつなぎたいときは `--sandbox-network bridge` を付けて起動します。ほかの言語を使うなら `--sandbox-image node:22` のようにイメージを変えます。

コンテナは会話を消すと消えます(作業フォルダは残ります)。モデルが動かすコマンドは確かめずに行うので、作業フォルダに大事なファイルを置かないでください。

### GitHub のリポジトリを読む

使ってよいリポジトリを `--github-repos` で決めて起動します。鍵は環境変数で渡すと、`ps` に出ません。

```sh
GITHUB_TOKEN=github_pat_… kumu 実行 -- --github-repos suru-lang/suru,suru-lang/*
```

起動すると「GitHub: 名前 としてつながりました。使えるリポジトリ: …」と出ます(鍵が違えば「注意: GitHub の鍵を確かめられませんでした(…)」)。画面の ⚙ の設定の「GitHub のリポジトリ」で、その会話で使うリポジトリを足し、それぞれ「読むだけ」か「読み書き」を選びます(`--github-repos` に合うものだけ足せます)。入力欄の横の「🐙 GitHub」を押して送ると、モデルに4つの道具を渡します。

- `github_repo`: リポジトリの設定(既定の枝・説明・トピック・ラベル)
- `github_tree`: ファイルの一覧(枝と、フォルダで絞れる。400 まで)
- `github_file`: ファイルの中身(20000 文字まで)
- `github_issues`: issue・PR の一覧(50 まで)か、1つの本文とコメント

画面には「🐙 o/r の README.md を読みました(2 行)」のように、何を読んだかだけを出します。読んだ中身はモデルにだけ渡し、答えといっしょには保存しません。

鍵は fine-grained の個人アクセストークンで、読むリポジトリに Metadata・Contents・Issues・Pull requests の読みの権限を付けてください。「読み書き」はまだ選んで覚えるだけで、書く道具(issue やコメントを書く)はこれから足します。

**注意:** 今の する は、すべてのネットワークの口(0.0.0.0)で待ち受けます。同じネットワークのほかの機械からも画面を開けて、会話を読めます。信用できないネットワークでは、ファイアウォールでポートを閉じてください。ほかのサイトのページから会話を読み書きされないように、`Origin` の見出しが自分と違う要求は断ります。

## 試験

```sh
kumu 試験                   # 会話帳(SQLite)・Ollama の行の読み方・ウェブ検索・引数・GitHub の許しの試験
node 道具/書式試験.js        # 画面の Markdown の変換の試験
```

本物の LLM の代わりに、決まった答えを返す偽の Ollama([道具/偽Ollama.suru](道具/偽Ollama.suru))で、全部を動かして確かめられます。

```sh
suru 道具/偽Ollama.suru &                       # http://localhost:11435
kumu 実行 -- --ollama http://localhost:11435 --db 出力/試し.db
OLLAMA_API_KEY=試し鍵 kumu 実行 -- --ollama http://localhost:11435 --web-search http://localhost:11435/api/web_search   # ウェブ検索も試す
kumu 実行 -- --ollama http://localhost:11435 --searxng http://localhost:11435   # SearXNG で試す
```

偽の Ollama は、最後の発言に「おうむ返し: 」を付けて1文字ずつ返します。モデル「偽-考える」は先に考えを流し、「書式」を含む問いには Markdown の見本を返します。`/api/web_search` は、キーが `試し鍵` なら問いを題に入れた2つの結果を返し、`/search?q=…&format=json` は SearXNG のふりをして6つの結果を返します。検索の結果を受け取ったモデルは答えの終わりに「 [検索あり]」を付けます。GitHub の道具を渡されて「GitHub」を含む問いを受けると `o/r` の `README.md` を読み、偽の Ollama は GitHub の API のふりもします(`--github-api http://localhost:11435`、鍵は `試し鍵`)。GitHub Actions では、これを相手に curl と Node の WebSocket で確かめています([.github/workflows/試験.yml](.github/workflows/試験.yml))。

## 作り

| ファイル | 中身 |
|---|---|
| [本体.suru](本体.suru) | サーバー。道ごとの答え、WebSocket、Ollama の答えをブラウザへ流すところ |
| [会話帳.suru](会話帳.suru) | 会話と発言を SQLite にしまう |
| [Ollama.suru](Ollama.suru) | Ollama の API(`/api/chat`・`/api/tags`・`/api/version`)とのやりとり |
| [ウェブ検索.suru](ウェブ検索.suru) | SearXNG か Ollama の web 検索 API で調べて、モデルに渡す指示と出典にする |
| [砂場.suru](砂場.suru) | 砂場(Docker のコンテナ)を作り、モデルの道具の呼び出しを行う |
| [GitHub道具.suru](GitHub道具.suru) | GitHub の道具(リポジトリ・ツリー・ファイル・issue を読む)と、会話のリポジトリの許し |
| [設定.suru](設定.suru) | 起動の引数と `OLLAMA_HOST`・`OLLAMA_API_KEY`・`SEARXNG_URL`・`GITHUB_TOKEN` |
| [起動.sh](起動.sh) | 作って動かし、画面から頼まれたときや新しいコミットがあるときに更新して動かし直す |
| [画面/](画面/) | HTML・CSS・JavaScript(`書式.js` は Markdown の変換) |

依存は [suru-lang/http](https://github.com/suru-lang/http)(HTTP・WebSocket・HTTP と HTTPS のクライアント)と [suru-lang/sqlite](https://github.com/suru-lang/sqlite) と [suru-lang/github](https://github.com/suru-lang/github)(GitHub の API)です。

### サーバーの道

| 道 | 答え |
|---|---|
| `GET /api/info` | Ollama の場所と版、ウェブ検索と砂場を使えるか `{"ollama":…,"version":…,"web":真偽,"sandbox":真偽,"github":真偽,"githubRepos":[…],"githubUser":…}` |
| `GET /api/models` | 入っているモデルの名前 `{"models":[…]}` |
| `GET /api/conversations` | 会話の一覧(新しく話した順) |
| `POST /api/search` | 題か発言に言葉を含む会話 `{"q":…}` → `[{"id":…,"title":…,"snippet":…}, …]` |
| `POST /api/conversations` | 会話を作る `{"model":…}` |
| `GET・PUT・DELETE /api/conversations/番号` | 会話の中身を読む・題とモデルと指示と温度と砂場のネットワーク(`"network":真偽`)と GitHub のリポジトリ(`"repos":[{"repo":…,"write":真偽}]`)を変える・消す |
| `POST /api/conversations/番号/messages` | 発言を足す `{"role":"user"か"assistant","content":…}` |
| `DELETE /api/conversations/番号/last-answer` | 最後の答えを消す(作り直すとき) |
| `GET /ws`(WebSocket) | `{"conversation":番号}` が届くたびに、その会話を Ollama へ送り、答えを流す。`"web":true` も付いていれば、先にウェブで調べる。`"code":true` なら砂場の道具を、`"github":true` なら GitHub の道具を渡す |
| `POST /api/chat` | WebSocket を使えないときの同じもの(1行1つの JSON) |

流す答えは1つずつの JSON です: `{"content":…}`(答えの続き)、`{"thinking":…}`(考え)、`{"stats":{"tokens":…,"seconds":…}}`、`{"error":…}`。ウェブで調べたときは、はじめに `{"sources":[{"title":…,"url":…}, …]}`(調べられなかったときは `{"notice":…}`)を送ります。砂場で道具を使ったときは、使う前に `{"running":…}`、使った後に `{"tool":{"name":"run","command":…,"output":…,"code":…}}` か `{"tool":{"name":"write_file","path":…,"content":…,"output":…}}` を送ります。GitHub の道具では `{"running":"🐙 …を読んでいます"}` と `{"tool":{"name":"github_file","summary":…}}` を送ります(中身は送りません)。WebSocket では最後に `{"done":true}` を送ります。

## 決めたこと

### 会話のしまい方

1. **会話はサーバーの SQLite にしまう。** 表は `会話`(番号・題・モデル・指示・温度・作成・更新)と `発言`(会話・役・内容・作成)です。時刻は UNIX 時間の秒です。温度が負ならモデルの既定の温度を使います。
2. **発言を保存するのは画面。** 画面は、問いを送る前に問いを、答えを受け取り終わったら(止めたときも、そこまでの)答えを保存します。サーバーは、答えを流すときに会話の発言をデータベースから読んで Ollama に送ります。答えが1文字も届かなかったときは、答えを保存しないので、「もう一度」で同じ問いを聞き直せます。
3. **題は最初の問いから。** 題が空の会話に最初の問いを足すと、その1行目のはじめの 40 文字を題にします。画面で題をクリックすると変えられます。
4. **考えは保存しない。** 考えるモデルの考え(`thinking`)は画面に出すだけで、次に送る発言には入れません(Ollama の勧めのとおり)。
5. **検索は LIKE で。** 題か発言の中身に言葉を含む会話を、新しく話した順に 100 まで返します。`%`・`_`・`\` はただの文字として探し、英字の大文字小文字は区別しません。最初に見つかった発言の、言葉のまわりを抜き出して一覧に出します。
6. **要求ごとにデータベースを開いて閉じる。** 答えを流している間はデータベースを開いたままにしません。同時の書き込みは `busy_timeout` で待ちます。

### 画面

1. **画面は1つのページ。** 開いている会話は道の `#番号` で、読み込み直しても同じ会話を開きます。
2. **Markdown は自前の小さな変換で。** 外のライブラリを読まないので、ネットワークにつながっていなくても動きます。先に全部の文字を HTML として逃がしてから書式を付けるので、答えに HTML があっても文字のまま出ます。リンクは http と https だけです。
3. **変換を確定する Enter では送らない。** Chrome は確定の Enter に `isComposing` を付けますが、Safari は先に `compositionend` を出してから `isComposing` のない keydown を出します。`isComposing`・keyCode 229・`compositionend` から 150 ミリ秒の間の Enter は、確定とみなして送りません(macOS の Safari と ATOK で、確定の Enter で送られてしまったため)。
4. **止めるときは WebSocket を閉じる。** サーバーは次に送るところで失敗して、Ollama への接続も閉じます(Ollama も答えを作るのをやめます)。次に送るときにつなぎ直します。

### ウェブ検索

1. **Ollama の web 検索 API を使う。** 検索のサービスは、Ollama を使う人が一番キーを用意しやすいものにしました。`POST https://ollama.com/api/web_search` に `Authorization: Bearer キー` を付けて `{"query":…,"max_results":5}` を送ります。http ライブラリの HTTPS(OpenSSL)で、証明書と名前を確かめてつなぎます。
2. **調べるのは最後の問いそのまま。** モデルに検索の言葉を作らせる(道具の呼び出し)と、道具を使えるモデルでしか動かず、1回の答えに2回モデルを動かすので、まずは問いをそのまま送ります。
3. **結果は問いのすぐ前に指示(system)として渡す。** 「[1] 題・URL・中身(1500 文字まで)」を並べ、番号で出典を示すように頼みます。この指示は保存しないので、次の問いのときには渡しません(そのときボタンが押してあれば、また調べます)。
4. **出典は答えといっしょに保存する。** 画面は `sources` を受け取ったら、答えの終わりに「出典」の番号付きの一覧(Markdown のリンク)を足して、その全体を保存します。読み込み直しても出典が残り、次の問いのときにはモデルにも見えます。
5. **調べられなくても答える。** キーがない・違う・つながらないときは `{"notice":…}` を送って、検索なしで答えます。画面は答えの上に知らせを出します。
6. **ボタンの状態はブラウザが覚える。** 会話ごとではなく、`localStorage` に1つだけ覚えます。
7. **SearXNG も使える。** ollama.com につながらない・アカウントを作りたくないときのために、自分で動かす SearXNG の JSON の API(`GET /search?q=…&format=json`)も使えるようにしました。問いは UTF-8 のバイトごとに `%XX` にして送り、結果のはじめの5つを使います。結果の形(`results` の `title`・`url`・`content`)は Ollama の API と同じなので、そのあとは同じに扱います。`SEARXNG_URL` があれば、Ollama のキーより先に使います。

### 砂場

1. **会話ごとに1つのコンテナ。** 最初に砂場を使うときに `docker run -d … sleep infinity` で作り、そのあとは `docker exec` でコマンドを動かします。同じ会話の中では、前に書いたファイルや入れたものが残ります。サーバーを起動し直しても、コンテナが動いていればそのまま使います。
2. **外につながらない・使いすぎない。** 既定は `--network none` で、`--memory 2g --cpus 2 --pids-limit 512 --security-opt no-new-privileges` を付けます。1つのコマンドは `timeout 120` で止めます。モデルに返す出力は 8000 文字まで(長ければはじめと終わりの 4000 文字ずつ)です。
3. **道具は2つだけ。** `run`(sh -c)と `write_file` です。ファイルを読むのは `run` で `cat` できるので、道具を少なくしてモデルが迷わないようにしました。
4. **道具のくり返しはサーバーで。** モデルが `tool_calls` を返したら、サーバーが順に行い、`role: "assistant"`(呼び出し)と `role: "tool"`(結果)の発言を足して、もう一度 `/api/chat` に送ります。道具を呼ばなくなるか、10 回になるまでくり返します。
5. **使った跡は答えといっしょに保存する。** 画面は `tool` を受け取ったら、書いたファイルとコマンドの出力を Markdown のコードの塊(`~~~~` で囲む)として答えに足し、その全体を保存します。次の問いのときには、モデルにも前に動かしたことが見えます。途中の `tool` の発言そのものは保存しません。
6. **「プロセス」を使わない。** 標準の「プロセス」と「ファイル」(http ライブラリが読み込む)が C の `fread` を違う型で宣言していて、いっしょに読み込めません。そのため砂場は `system` と一時ファイルでコマンドを動かします。
7. **ネットワークは会話ごとに選ぶ。** 会話の `network` が真なら `bridge`、偽なら `--sandbox-network` の値(既定 `none`)でコンテナを作ります。コンテナが動いていても、`docker inspect` で見たネットワークが違えば作り直します。会話帳の表に `網` の列がない(前の版で作った)ときは、起動したときに `ALTER TABLE` で足します。

### 起動.sh

1. **再起動はシェルスクリプトで。** する のアプリは自分を作り直せないので、外の `起動.sh` が `git pull`・`kumu 作る`・動かし直しをします。macOS と Linux の `sh` で動きます。
2. **ファイルで話す。** アプリは `POST /api/restart` で `出力/制御/再起動` のファイルを置くだけです。`起動.sh` は2秒ごとにそれを見ます。様子は `起動.sh` が `出力/制御/状態` に書き、アプリは `/api/info` の `update` で画面に渡します。
3. **作れてから止める。** 新しいアプリが作れたときだけ、前のアプリを止めて動かし直します。止まっている間は数秒です。
4. **動かし直したかは時刻で知る。** `/api/info` の `started`(動き始めた時刻)が変わったら、画面を読み直します。

### GitHub

1. **API は suru-lang/github で。** GitHub の API を使うところは、ほかのアプリでも使えるように [suru-lang/github](https://github.com/suru-lang/github) に分けました。このアプリには、モデルの道具と、会話のリポジトリの許しだけを置きます。
2. **リポジトリは2重に絞る。** 起動の `--github-repos` で足してよいものを決め、会話ごとに使うものを足します。サーバーは会話を保存するときに `--github-repos` に合わないものを除き、道具を行うときにも、会話にないリポジトリなら断ってモデルに理由を返します。英字の大文字小文字は区別しません。
3. **Read と Write は会話ごと・リポジトリごと。** Claude のように、会話にリポジトリを足すときに「読むだけ」か「読み書き」を選びます。会話帳の `倉` の列に `[{"repo":…,"write":真偽}]` の JSON でしまいます(前の版の表には、起動したときに `ALTER TABLE` で足します)。
4. **読むのは確かめずに行う。** 読む道具は、画面で確かめずに行います。書く道具は「読み書き」のリポジトリにだけ渡す予定です。issue を消す道具は作らず、閉じる(`not_planned`)で足ります。
5. **中身は保存しない。** 読んだファイルや issue は長く、リポジトリはあとで変わるので、モデルに渡すだけにします。画面には何を読んだかの1行だけを出し、それを答えといっしょに保存します。
6. **鍵は出さない。** 鍵は起動の記録にも画面にも出しません。`/api/info` は、鍵の持ち主の名前(`githubUser`)だけを返します。

## 今後の候補

- 外からつなげないように、127.0.0.1 だけで待ち受ける(する の「通信」に、待ち受けるアドレスを選べる関数が要ります)
- 画面のファイルを実行ファイルに入れて、どのフォルダからでも起動できるようにする
- ウェブ検索: 言葉をモデルに作らせる(道具の呼び出し)、ページを読む `/api/web_fetch`、SearXNG の言語・カテゴリを選ぶ
- 会話を Markdown・JSON に書き出す
- 画像を送る(Ollama の `images`、見えるモデル)
- モデルを画面から入れる(`/api/pull`)、使っていないモデルを片付ける
- 砂場: 作業フォルダのファイルを画面で見る・落とす、コマンドを動かす前に確かめる、コンテナを手元の利用者で動かす
- 長い会話を、モデルの文脈の長さ(`num_ctx`)に合わせて切り詰める
- 問いを書き直して、そこから先を作り直す

## ライセンス

[MIT](LICENSE)
