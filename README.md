English | [日本語](README_jp.md)

# ohanashi-ollama (おはなし, "chat")

A web app for chatting in the browser with LLMs from [Ollama](https://ollama.com/) running on your own computer. The server is written in [Suru (「する」)](https://github.com/suru-lang/suru), a programming language in Japanese, and builds into a single executable. The interface is in Japanese.

- Pick a model on screen (from the list of models installed in Ollama). New conversations get a recommended model suited to the mode
- Each conversation can switch between the "💬 会話" (chat) and "🛠 コーディング" (coding) modes. Coding mode reads coding rules and the repository's rules (`OHANASHI.md` and so on) and uses the "💻 砂場" (sandbox)
- "🧠 モデル帳" (model notebook): on startup it records each model's size and capabilities, and if web search is available, has a model research features and scores (code, chat, Japanese, reasoning) and stores them in SQLite. If the researching model is small, a larger model researches again. View and edit by hand under ⚙
- Conversations are stored in an SQLite file, so you can close and pick up where you left off. Open earlier conversations from the list on the left
- Within a conversation you can create "threads" per topic ("＋ スレッド" in the header). Only that thread's messages are sent to the model, so it stays fast as it grows long. Settings such as repositories, instructions and model belong to the conversation and apply to every thread. Decisions from an earlier thread can be carried to the next by writing them in the conversation's "📒 メモ" (memo) (also via "メモに足す", "add to memo", on an answer)
- "会話を探す" (search conversations) on the left searches threads by title and message contents. Opening one marks where it was found
- Answers appear bit by bit as they arrive. "止める" (stop) stops midway (the answer so far is kept)
- Markdown in answers (code, lists, tables and so on) is rendered, and code can be copied with "写す" (copy)
- Each conversation has its own instructions (system prompt) and temperature
- Keep "📜 決まり" (rules) you want the model to follow, such as "rules for writing code", under names, and attach them to conversations under ⚙ (any number). Rules are read for every answer, so editing one affects every conversation it is attached to. You can also choose rules attached to new conversations from the start. For answers using the sandbox or GitHub, the `OHANASHI.md` (or else `AGENTS.md` or `CLAUDE.md`) of repositories in the work folder is read as rules too
- The in-progress thoughts of thinking models (qwen3, deepseek-r1 and so on) and the traces of sandbox and GitHub tool use are shown folded under "途中経過" (progress) (click to open)
- With "💻 砂場" on, the model writes and runs code in a Docker container and checks the results before answering (needs Docker and a model that can use tools). Per conversation, the container can also be allowed to reach the internet for pip and apt
- "作り直す" (regenerate) the last answer, or "もう一度" (retry) after a failure
- Shows answer speed (tokens per second)
- With "🌐 ウェブ" on, it searches the web before answering, with sources at the end of the answer (needs a self-hosted SearXNG or an Ollama API key)
- With "🐙 GitHub" on, the model reads the GitHub repositories added to the conversation (settings, file lists, files, issues and PRs) before answering. Repositories are added per conversation in the ⚙ settings, as "読むだけ" (read only) or "読み書き" (read-write). For read-write repositories, on request it can also create, edit, comment on and close issues, and clone in the "💻 砂場", push changes and create PRs
- Attach images, PDFs and text files to a question by dropping them on the page, pasting into the input, or choosing with 📎. Images are read by vision models (qwen2.5vl, gemma3 and so on); PDFs and text files have their text extracted for any model to read
- If an answer finishes while you are looking at another tab or app, "✅" ("⚠️" on failure) is put at the head of the tab title. Checking "🔔 見ていない間に答えが終わったら通知する" ("notify when an answer finishes while I'm not looking") under ⚙ also shows a browser notification (clicking it returns to that conversation)
- Works at smartphone width too, and follows the dark color setting

## Running

Requirements:

- [Ollama](https://ollama.com/download) and at least one model (`ollama pull llama3.2` and so on)
- Suru 0.9.1 or later (`kumu` and clang). See the [Suru README](https://github.com/suru-lang/suru#installing) for installation
- libsqlite3 and OpenSSL (`kumu` shows how to install them if missing)
  - macOS: `brew install sqlite openssl@3` and `export PKG_CONFIG_PATH="$(brew --prefix sqlite)/lib/pkgconfig:$(brew --prefix openssl@3)/lib/pkgconfig"`
  - Debian, Ubuntu: `sudo apt install libsqlite3-dev libssl-dev`

```sh
git clone https://github.com/suru-lang/ohanashi-ollama
cd ohanashi-ollama
kumu 実行
```

Once started, open http://localhost:8080/ in a browser. The page files are read from `画面/` in the current folder, so start it in this folder.

### Arguments

```sh
kumu 実行 -- --port 9000 --db ~/おはなし.db
./出力/ohanashi-ollama --ollama http://192.168.1.10:11434
```

| Argument | Meaning | Default |
|---|---|---|
| `--ollama URL` | Where Ollama is | The environment variable `OLLAMA_HOST`, or else `http://localhost:11434` |
| `--listen ADDRESS` | The address to serve the page on (`0.0.0.0` lets other machines open it) | `127.0.0.1` (only from the same machine) |
| `--port PORT` | The port to serve the page on | 8080 |
| `--db FILE` | The SQLite file storing conversations | `ohanashi.db` |
| `--screen FOLDER` | The folder of page files | `画面` |
| `--searxng URL` | SearXNG used for web search | The environment variable `SEARXNG_URL`, or else not used |
| `--sandbox-image IMAGE` | The sandbox container's image | `ohanashi-sandbox` (if present locally; otherwise `python:3.12-slim`) |
| `--sandbox-network NETWORK` | The `--network` of the sandbox container | `none` (no outside access) |
| `--work FOLDER` | The parent of work folders shared with the sandbox | `作業` |
| `--web-search URL` | The web search API | `https://ollama.com/api/web_search` |
| `--control FOLDER` | The folder for talking with 起動.sh (起動.sh adds it) | None (can't restart from the page) |
| `--revision VERSION` | The version shown on the page (起動.sh adds the commit) | None |
| `--github-repos LIST` | Restricts the GitHub repositories that can be added to conversations (`owner/NAME` or `owner/*`, separated by 「,」) | None (any repository the token can use) |
| `--github-token TOKEN` | A GitHub token (personal access token) | The environment variable `GITHUB_TOKEN`, or else no token (public repositories only, up to 60 times an hour) |
| `--github-api URL` | The base of the GitHub API (`https://HOST/api/v3` for GitHub Enterprise) | `https://api.github.com` |
| `--github-git URL` | The prefix of URLs for clone and push (uses `URL/owner/NAME.git`) | Decided from the API base (`https://github.com` and so on) |
| `--git-author "NAME <EMAIL>"` | The name used for commits in sandbox clones | The token owner's name and `NAME@users.noreply.github.com` |
| `--research-model MODEL` | The model that researches the model notebook | The model that researched before → the model of a recent conversation → the largest model that can use tools |
| `--research-max-size GB` | The upper limit on the size of the researching model (GB; doesn't apply to a named model) | None |
| `--no-research` | Don't research the model notebook (only record size and capabilities) | Research (when web search is available) |

### Running with 起動.sh (restart from the page, update on new commits)

```sh
./起動.sh                          # run kumu 作る, then start
./起動.sh --watch 60 -- --port 9000 # check for new commits every 60 seconds; arguments after -- go to the app
```

When run with `起動.sh`, the page's ⚙ shows the version and "🔄 最新にして再起動" ("update and restart"). Pressing it runs `git pull --ff-only` → `kumu 作る` → restarting the app, and reloads the page.

With `--watch SECONDS`, it runs `git fetch` every that many seconds and updates the same way if the tracked branch (`main` and so on) has new commits. When you merge a PR, the local app becomes new shortly after (simple CD).

If rebuilding fails (`git pull` can't run, `kumu 作る` doesn't pass), the previous app keeps running and the reason is shown in the page's ⚙ and the terminal. A failed commit isn't retried until the next new commit arrives. Changes to `起動.sh` itself take effect when `起動.sh` is restarted. Ctrl-C stops it together with the app.

**Note:** anyone who can open the page can ask for a restart (it only updates the local branch and rebuilds; it can't run other code).

### Opening over https from other machines (Tailscale Serve)

To open it from other machines such as phones, put [Tailscale](https://tailscale.com/)'s [Serve](https://tailscale.com/kb/1312/serve) in front, and open it at `https://MACHINE.TAILNET.ts.net/`. Over https, features available only in secure contexts, such as browser notifications, work too. Only machines connected to Tailscale can open it, and Tailscale provides the certificate.

1. In the admin console's [DNS](https://login.tailscale.com/admin/dns), enable **MagicDNS** and **HTTPS Certificates**
2. Start ohanashi-ollama as usual (`--listen` can stay at the default 127.0.0.1)
3. On the same machine, type `tailscale serve --bg 8080` (or your number if you changed `--port`). Open the `https://…ts.net/` it shows on a phone or other device connected to Tailscale

To stop, use `tailscale serve --https=443 off`. `tailscale serve status` shows the current setup.

**Note:** creating an HTTPS certificate puts the machine name and tailnet name in the public certificate logs (Certificate Transparency). The contents of conversations aren't visible from outside.

### Modes and the model notebook

Pressing "💬 会話" in the header switches to "🛠 コーディング" (pressing again switches back). New conversations start in the mode chosen last.

- **Coding**: rules whose occasion is "🛠 コーディングモードのとき" ("in coding mode") are attached (the built-in "コードを書くときの決まり", rules for writing code, is one), and "💻 砂場" is turned on. Even without using the sandbox or GitHub, `OHANASHI.md` and the like of repositories in the work folder are read
- **Chat**: rules whose occasion is "💬 会話モードのとき" ("in chat mode") are attached

"🧠 モデル帳" under ⚙ shows each Ollama model's size, parameter count, quantization, context length and capabilities (🔧 tools, 👁 images), plus the researched features and scores (0 to 5).

1. On startup, a separate thread records Ollama's models in the notebook (only models whose `digest` changed are asked again)
2. If web search (`--searxng` or `OLLAMA_API_KEY`) is available, models not yet researched are researched by the researching model. It searches the web for the model's name, reads the results, and answers in JSON form (features, scores, notes)
3. If the researcher is small (under 7B) or couldn't research half or more, it researches once more with a tool-capable model at least twice as large
4. The model for a new conversation is chosen by the mode's score (for coding, among tool-capable models), then Japanese, then smallness. If you pick another model in the header, that one is used

Researched contents can be edited by hand with "直す" (edit). Hand-edited models are not overwritten by re-research ("手直しをやめる", "stop hand-editing", reverts). "調べ直す" (re-research) and "みな調べ直す" (re-research all) have it research again.

```sh
./出力/ohanashi-ollama --searxng http://localhost:8888 --research-model qwen3:30b --research-max-size 24
```

### Attaching rules

Under ⚙, "📜 決まり" lets you create rules describing what you want the model to follow, and attach them to conversations. They are like Claude Code's `CLAUDE.md`.

1. Open ⚙, press "決まりを作る・直す" (create/edit rules), write a name and contents (Markdown is fine), and save. One sample, "コードを書くときの決まり" (rules for writing code), is there from the start
2. In the list of rules, check the ones to attach to this conversation. The checks are remembered per conversation. Rules whose "付ける場面" (occasion) is "いつも" (always) are checked in new conversations from the start, and rules set to "🛠 コーディングモードのとき" are checked when switching to coding mode (and unchecked when switching back to chat mode)
3. When you send, the attached rules are passed to the model before the conversation's instructions, each with a heading (`# 決まり: NAME`)

Editing a rule makes every conversation it is attached to use the new contents from the next answer. "📜2" next to the ⚙ button is the number of attached rules. Rules use the model's context for every answer, so when the attached rules are long in total (over 6,000 characters), ⚙ shows a notice.

Repository rules can be written in a file. When you send with "💻 砂場" or "🐙 GitHub" on, it looks in `作業/CONVERSATION_NUMBER/` and the git repositories (with `.git`) one folder below it for `OHANASHI.md` → `AGENTS.md` → `CLAUDE.md` in that order, and passes the first one found as "the rules of repository NAME". Repositories that have `AGENTS.md` or `CLAUDE.md` for other tools work as they are. Write things meant only for ohanashi's model in `OHANASHI.md`. For example:

```markdown
- 試験は `kumu 試験` で動かし、通ってから push する
- コメントと commit の文は日本語で書く
- 新しい機能の説明は README の「決めたこと」に、その機能の節を作って書く
```

(Run tests with `kumu 試験` and push after they pass; write comments and commit messages in Japanese; describe new features in a section of their own under 「決めたこと」 in the README.) When a clone happens during an answer, via `github_clone` or `git clone` in `run`, it searches again after the tool use and passes any rules it finds to the model. When rules are read, "リポジトリの決まりを読みました: r/OHANASHI.md" ("read the repository's rules: …") is shown above the answer (only for a thread's first answer and when found during an answer).

### Attaching images and PDFs

Drop files on the page, paste into the input (Ctrl+V, ⌘V), or choose with 📎 to the left of the input, and they line up above the input. ✕ removes one. When you write and send, they are sent with the question (you can also send just the attachments without writing anything).

- **Images** (PNG, JPEG, WebP, GIF and others the browser can read) are shrunk to at most 1600px on the long side and converted to JPEG (PNG if transparent) before sending. Up to 8 per question. Only vision models (`ollama pull qwen2.5vl`, `gemma3` and so on) can read them. In the model list, vision models are marked 👁. Attaching an image in a conversation whose model can't read images disables the send button and shows names of vision models (clicking one changes the conversation's model)
- **PDFs** have their text extracted page by page in the browser (separated by "--- 3 ページ ---") and are sent. Up to 20MB. For pages without text, such as scanned PDFs, the tag shows "🖼 2 ページは文字がありません。画像にして送る" ("page 2 has no text; send it as an image"), and if checked, that page is turned into an image and attached as "報告.pdf の 2 ページ" (up to 8 together with images; unchecking sends only the text)
- **Text files** (`.txt`, `.md`, `.csv`, `.json`, code and so on) are sent as they are. Up to 5MB
- Attached text is limited to 100,000 characters per question in total. Over 8,000 characters, it warns that it may not fit in the model's context

Below a sent question, images are shown small, and PDFs and the like as tags like "📄 報告.pdf(12 ページ・3.4 万字)" (12 pages, 34,000 characters). Clicking opens the image itself or the extracted text. Attachments are stored in the conversation log and resent to the model every time, even when you keep asking in that thread (Ollama doesn't remember earlier images).

### Searching the web

Web search uses a self-hosted [SearXNG](https://docs.searxng.org/) or [Ollama's web search API](https://docs.ollama.com/capabilities/web-search). If both are available, SearXNG is used. With neither, the "🌐 ウェブ" button can't be pressed.

**SearXNG** (no account or key needed). With Docker, run it like this.

```sh
mkdir -p searxng
docker run -d --name searxng -p 8888:8080 -v "$PWD/searxng:/etc/searxng" searxng/searxng
```

The first start creates `searxng/settings.yml`. To allow JSON answers, add the following at the end of the file (otherwise JSON requests are refused with 403), then `docker restart searxng`. If `server:` has `limiter: true`, make it `false`.

```yaml
search:
  formats:
    - html
    - json
```

If `curl 'http://localhost:8888/search?q=test&format=json'` returns JSON, it's ready. Then start with the SearXNG URL.

```sh
SEARXNG_URL=http://localhost:8888 kumu 実行
```

**Ollama's web search API**. Sign in at ollama.com, create an [API key](https://ollama.com/settings/keys), put it in the environment variable `OLLAMA_API_KEY`, and start.

```sh
OLLAMA_API_KEY=キー kumu 実行
```

On startup it says what it searches with, like "ウェブ検索: SearXNG(…)を使います。" ("web search: using SearXNG (…)"). SearXNG is tried once at startup, and if it can't be used, the reason is shown.

The search words (the last question) are sent from SearXNG to search services, or to ollama.com. For questions you don't want to leave your machine, don't press the button.

### Running code in the sandbox

With [Docker](https://www.docker.com/products/docker-desktop/) running, you can press "💻 砂場" next to the input. Sending with it on gives the model two tools.

- `run`: runs a shell command (up to 120 seconds each)
- `write_file`: writes a file

When the model calls a tool, it is carried out inside the conversation's container (`ohanashi-PORT-CONVERSATION_NUMBER`), and the result is returned to the model to continue answering (up to 30 times per answer). Written files and command output appear in the answer as they are. The container's `/work` is the same folder as the local `作業/CONVERSATION_NUMBER`, so you can open the resulting files locally.

Use it with tool-capable models (qwen3 and so on). The first use pulls the image, so `docker pull python:3.12-slim` beforehand saves waiting. The container initially has no outside network, so `pip install` and `apt-get install` don't work. For conversations that need them, check "💻 砂場からインターネットにつなぐ" ("connect the sandbox to the internet") in the ⚙ settings. The next time the sandbox is used, the container is recreated with `--network bridge` (files in the work folder remain, but anything installed before is gone). To connect in every conversation, start with `--sandbox-network bridge`. For other languages, change the image, as in `--sandbox-image node:22`.

The container is removed when the conversation is deleted (the work folder remains). Commands the model runs are carried out without confirmation, so don't put important files in the work folder.

When files are created or changed in the work folder during an answer, links like "📄 報告.docx(24KB)" appear at the end of the answer. Clicking downloads them (PDFs and images open in the browser). Earlier files can also be downloaded from "📁 作業フォルダ" (work folder) in the ⚙ settings.

#### Making Word and PDF documents

If you build `ohanashi-sandbox`, a sandbox image that can make documents, the model is also given the tool `make_document`. Ask "今の話を Word の報告にまとめて" ("sum this up as a Word report") or "PDF にして" ("make it a PDF"), and the model writes the contents in Markdown and turns them into Word (docx) or PDF inside the sandbox. The resulting file can be downloaded from the link at the end of the answer.

```sh
docker build -t ohanashi-sandbox 砂場    # about 1GB; restart after building
```

The image is `python:3.12-slim` (Debian bookworm) plus pandoc, WeasyPrint, python-docx, openpyxl, matplotlib and Japanese fonts (Noto CJK) ([砂場/Dockerfile](砂場/Dockerfile)). Started without `--sandbox-image`, it uses `ohanashi-sandbox` if present and says "砂場: ohanashi-sandbox で、Word・PDF の文書を作れます" ("sandbox: Word and PDF documents can be made with ohanashi-sandbox"). Otherwise it uses `python:3.12-slim` as before and doesn't give `make_document`. [起動.sh](起動.sh) rebuilds the image when `砂場/` changes (skipped without Docker). For elaborate documents with tables and charts, the model can also write python (python-docx, openpyxl, matplotlib) with `run`.

If the model writes "報告.docx を作成しました" ("created 報告.docx") without using a tool, it is asked once more to make it with the tool, and if that still fails, "⚠ ファイルはできていません" ("⚠ the file was not created") is shown.

### Reading GitHub repositories

Start with a GitHub token in the environment variable `GITHUB_TOKEN` (passed through the environment, it doesn't show up in `ps`).

```sh
GITHUB_TOKEN=github_pat_… kumu 実行
```

On startup it says "GitHub: 名前 としてつながりました。" ("GitHub: connected as NAME") (or, if the token is wrong, "注意: GitHub の鍵を確かめられませんでした(…)", "note: couldn't verify the GitHub token"). While running, add and remove repositories per conversation under "GitHub のリポジトリ" (GitHub repositories) in the page's ⚙ settings, choosing "読むだけ" (read only) or "読み書き" (read-write) for each. When adding, repositories the token can use are offered as candidates (writing `owner/NAME` adds one not among them).

To restrict which repositories can be added, start with something like `--github-repos suru-lang/suru,suru-lang/*` (even without a token, public repositories listed there can be read). Sending with "🐙 GitHub" next to the input turned on gives the model four tools.

- `github_repo`: the repository's settings (default branch, description, topics, labels)
- `github_tree`: the list of files (filterable by branch and folder; up to 400)
- `github_file`: a file's contents (up to 20,000 characters)
- `github_issues`: a list of issues and PRs (up to 50), or one body with its comments

The page shows only what was read, like "🐙 o/r の README.md を読みました(2 行)" ("read README.md of o/r (2 lines)"). The contents read are passed only to the model and are not saved with the answer.

The token is a fine-grained personal access token; give it read permission for Metadata, Contents, Issues and Pull requests on the repositories to read.

### Writing GitHub issues

If the conversation has a "読み書き" repository, the model is also given the tool `github_issue`. With `action`, it does the following.

- `create`: create an issue (title, body, labels)
- `update`: change the title, body and labels of an issue or PR
- `comment`: comment on an issue or PR
- `close`: close an issue (completed or not planned)
- `reopen`: reopen a closed issue

These are done without confirmation on the page. After writing, it leaves a one-line link in the answer, like "🐙 o/r に issue [#7](…) を作りました: 題" ("created issue #7 in o/r: TITLE"). Bodies and comments it writes end with "— ohanashi-ollama(モデル名) で書きました" ("written with ohanashi-ollama (MODEL)"). When it tries to write to a "読むだけ" repository, it doesn't write and returns the reason to the model.

The token for repositories to write needs read-write permission for Issues and Pull requests.

### Fixing GitHub repositories and making PRs

Sending with both "🐙 GitHub" and "💻 砂場" on gives two more tools.

- `github_clone`: clone the repository into the sandbox's `/work/NAME` (only the latest commit). Locally this is `作業/CONVERSATION_NUMBER/NAME`
- `github_push`: commit everything changed in `/work/NAME` and push it to a branch (read-write repositories only)

The model fixes the cloned files with `run` and `write_file` and checks them, pushes to a new branch like `ohanashi/fix-typo` with `github_push`, and creates a PR with `github_pr`. git runs on the server (locally), so this works even without git or a token in the container, and even if the container has no network. The commit name is the token owner's name and `NAME@users.noreply.github.com`, changeable with `--git-author "NAME <EMAIL>"`. Commit messages also end with "— ohanashi-ollama(モデル名) で書きました".

#### Tips for asking

Small models tend to write "push しました" ("pushed") or "PR を作りました" ("created the PR") without calling the tools, or write out tool calls as text (seen with qwen3-coder-next and qwen3.6:35b). The server reminds the model to check the results of push and PR, and asks again up to twice if it claims success without doing it, but asking like this is the most reliable.

- Name the tool, repository and branch: "github_push ツールを使って、ohanashi/add-c-hello-world ブランチに push してください" ("use the github_push tool to push to the ohanashi/add-c-hello-world branch"), "github_pr ツールを使って、ohanashi/add-c-hello-world ブランチから main ブランチに対して PR を開いてください" ("use the github_pr tool to open a PR from ohanashi/add-c-hello-world to main")
- Ask for clone → fix → push → PR one step at a time
- Use a new thread for each task ("＋ スレッド" in the header; in long threads, the model gets dragged along by earlier failures and made-up claims). Repository settings and what was cloned into the sandbox carry over
- Check whether the tools were really used by the title of the progress section ("途中経過(道具: github_push)", "progress (tools: github_push)") or the `[会話 番号] 道具 …` lines in the terminal that started it

#### Creating a token

1. In GitHub's [Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new), press "Generate new token"
2. Under "Repository access", choose only the repositories used in conversations
3. Under "Permissions" → "Repository permissions", choose the following
   - Read only: Metadata (Read-only, always included), Contents, Issues and Pull requests as Read-only
   - Writing issues: Issues as Read and write
   - Pushing and creating PRs: Contents and Pull requests as Read and write
4. Put the resulting token (`github_pat_…`) in `GITHUB_TOKEN` and start

**Note:** by default the page listens only on 127.0.0.1, so it can only be opened from the same machine. To open it from other machines (phones and so on), start with `--listen 0.0.0.0`. Then anyone on the same network can read the conversations, so use it only on networks you trust. If you use Tailscale, opening over https with [Tailscale Serve](#opening-over-https-from-other-machines-tailscale-serve) is safer. To keep pages from other sites from reading or writing conversations, requests whose `Origin` header differs from its own are refused.

## Tests

```sh
kumu 試験                   # tests of the conversation log (SQLite), reading Ollama's lines, web search, arguments, GitHub permissions, combining rules, and work-folder files
node 道具/書式試験.js        # tests of the page's Markdown conversion
node 道具/道試験.js          # tests of the page's routes (#conversation/thread)
node 道具/頁試験.js          # tests of turning PDF pages without text into images
node 道具/通知試験.js        # tests of the notification contents and tab-title marks when an answer finishes
```

Instead of a real LLM, a fake Ollama returning fixed answers ([道具/偽Ollama.suru](道具/偽Ollama.suru)) lets you run and check everything.

```sh
suru 道具/偽Ollama.suru &                       # http://localhost:11435
kumu 実行 -- --ollama http://localhost:11435 --db 出力/試し.db
OLLAMA_API_KEY=試し鍵 kumu 実行 -- --ollama http://localhost:11435 --web-search http://localhost:11435/api/web_search   # also try web search
kumu 実行 -- --ollama http://localhost:11435 --searxng http://localhost:11435   # try with SearXNG
```

The fake Ollama returns the last message with "おうむ返し: " ("parrot: ") in front, one character at a time. The model "偽-考える" ("fake-think") streams thoughts first, and questions containing "書式" ("format") get a Markdown sample. `/api/web_search` returns two results with the question in their titles if the key is `試し鍵`, and `/search?q=…&format=json` pretends to be SearXNG and returns six results. A model that received search results appends " [検索あり]" ("[searched]") to its answer. Given GitHub tools and a question containing "GitHub", it reads `README.md` of `o/r`; with "issue を作って" ("make an issue") it creates an issue in `o/r`, with "issue を閉じて" ("close the issue") it closes #1 of `o/r`, and "clone して", "push して", "main に push して" and "PR を作って" call the respective tools; given sandbox tools and "決まりを置いて" ("put rules"), it creates the repository `/work/q` and `OHANASHI.md` with `run`. If instructions (system) arrived, it appends " [指示: …]" ("[instructions: …]"). Questions containing "発言の数" ("number of messages") get the number of questions received (" [問い 2]"), and thread-summary requests get "まとめ: 発言 N 個" ("summary: N messages"). The final `prompt_eval_count` is the number of characters of the received messages' JSON. The fake Ollama also pretends to be the GitHub API (`--github-api http://localhost:11435`, token `試し鍵`). GitHub Actions checks against it with curl and Node's WebSocket ([.github/workflows/試験.yml](.github/workflows/試験.yml)).

## Structure

| File | Contents |
|---|---|
| [本体.suru](本体.suru) | The server: answers per route, WebSocket, streaming Ollama's answers to the browser |
| [会話帳.suru](会話帳.suru) | Stores conversations, threads and messages in SQLite |
| [詰替.suru](詰替.suru) | Turns the log's conversations and messages into messages and requests of the Ollama library |
| [ウェブ検索.suru](ウェブ検索.suru) | Searches with SearXNG or Ollama's web search API and makes instructions and sources for the model |
| [砂場.suru](砂場.suru) | Creates the sandbox (a Docker container) and carries out the model's tool calls |
| [作業ファイル.suru](作業ファイル.suru) | Lists files in the sandbox's work folder, finds what was created during an answer, and makes them downloadable from the page |
| [砂場/](砂場/) | The document-capable sandbox image `ohanashi-sandbox` (`Dockerfile`, `文書.py` turning Markdown into docx and PDF, and `文書.css` for the PDF's look) |
| [規則.suru](規則.suru) | Combines the rules attached to the conversation and the repository rule files in the work folder (`OHANASHI.md` and so on) into one instruction for the model |
| [GitHub道具.suru](GitHub道具.suru) | The GitHub tools (reading repositories, trees, files and issues; writing issues and PRs) and permissions for the conversation's repositories |
| [GitHub作業.suru](GitHub作業.suru) | Tools that clone into the sandbox's work folder and commit and push changes (git runs locally) |
| [設定.suru](設定.suru) | Startup arguments and `OLLAMA_HOST`, `OLLAMA_API_KEY`, `SEARXNG_URL`, `GITHUB_TOKEN` |
| [起動.sh](起動.sh) | Builds and runs, and updates and restarts when asked from the page or when there are new commits |
| [画面/](画面/) | HTML, CSS and JavaScript (`書式.js` converts Markdown, `道.js` handles `#conversation/thread` routes, `添付.js` attaches images and PDFs, `頁.js` reads PDFs page by page, `通知.js` builds the notification when an answer finishes) |
| [画面/外/pdfjs/](画面/外/pdfjs/) | [pdf.js](https://github.com/mozilla/pdf.js) for extracting PDF text (`legacy/build/pdf.min.mjs`, `pdf.worker.min.mjs` and `cmaps/` of pdfjs-dist 4.10.38; Apache-2.0, [LICENSE](画面/外/pdfjs/LICENSE)) |

Dependencies are [suru-lang/http](https://github.com/suru-lang/http) (HTTP, WebSocket, HTTP and HTTPS clients), [suru-lang/sqlite](https://github.com/suru-lang/sqlite), [suru-lang/github](https://github.com/suru-lang/github) (the GitHub API) and [suru-lang/ollama](https://github.com/suru-lang/ollama) (the Ollama API).

### Server routes

| Route | Answer |
|---|---|
| `GET /api/github/repos` | Candidate repositories to add to conversations (those the token can use; only those within `--github-repos` if given) `{"repos":[…]}` |
| `GET /api/info` | Where Ollama is and its version, and whether web search and the sandbox are available `{"ollama":…,"version":…,"web":bool,"sandbox":bool,"documents":bool (whether the sandbox can make documents),"github":bool,"githubRepos":[…],"githubUser":…}` |
| `GET /api/models` | Names of installed models, the model notebook and recommendations `{"models":[…],"catalog":[{"name":…,"capabilities":["completion","vision",…],"size":bytes,"family":…,"params":billions,"quantization":…,"context":…,"summary":…,"scores":{"coding":…,"chat":…,"japanese":…,"reasoning":…} or null,"notes":…,"researcher":…,"researched":time,"failed":bool,"manual":bool},…],"recommended":{"会話":{"name":…,"reason":…},"コーディング":{…}}}` |
| `PUT /api/models` | Edit the model notebook by hand `{"name":…,"summary":…,"scores":{…},"notes":…}` (with `"manual":false`, stop hand-editing and re-research next time) |
| `POST /api/models/research` | Re-research `{"name":… (all if omitted),"researcher":… (chosen if omitted)}`. Progress is in `/api/info`'s `"catalog":{"state":…,"done":…,"total":…,"researcher":…,"message":…}` |
| `GET /api/conversations` | The list of conversations (most recently talked first; `"threads"` is the number of threads) |
| `POST /api/search` | Threads whose title or messages contain the words `{"q":…}` → `[{"id":conversation,"thread":thread,"title":…,"threadTitle":…,"snippet":…}, …]` |
| `POST /api/conversations` | Create a conversation together with its first thread `{"model":…,"mode":"会話" or "コーディング","rules":[rule numbers, …]}` (without `rules`, the default rules and the mode's occasion rules are attached; without `model`, the model notebook's recommendation) |
| `GET・PUT・DELETE /api/conversations/NUMBER` | Read the conversation (settings and `"threads":[{"id":…,"title":…,"updated":…}]`); change the title, model, instructions, temperature, sandbox network (`"network":bool`), GitHub repositories (`"repos":[{"repo":…,"write":bool}]`), memo (`"memo":…`, up to 8,000 characters), mode (`"mode":…`; changing it reattaches the occasion rules) and attached rules (`"rules":[rule numbers, …]`, combined in this order); delete it (threads and messages too) |
| `GET・POST /api/rules` | The list of rules `[{"id":…,"name":…,"default":bool,"length":characters,"updated":…,"uses":number of conversations attached,"scene":occasion}, …]`; create a rule `{"name":…,"content":…,"scene":"" or "いつも" or "会話" or "コーディング"}` (the older `"default":bool` also works) (names up to 100 characters, contents up to 8,000) |
| `GET・PUT・DELETE /api/rules/NUMBER` | Read the rule `{"id":…,"name":…,"content":…,"default":bool,"scene":…}`; change it (only the items in the body); delete it (it is detached from conversations) |
| `GET /api/conversations/NUMBER/files` | The list of files in the sandbox's work folder (`作業/CONVERSATION_NUMBER`) `{"files":[{"path":…,"size":…,"modified":…,"dir":bool}, …],"truncated":bool}` (excluding `.git`; cloned repositories only by folder name; up to 500) |
| `GET /api/conversations/NUMBER/files/PATH` | A file in the work folder (`Content-Disposition: attachment`; PDFs and images `inline` with `?view=1`) |
| `GET・POST /api/conversations/NUMBER/threads` | The list of threads; create a thread `{"title":…}` (optional) |
| `GET・PUT・DELETE /api/threads/NUMBER` | Read the thread `{"id":…,"conversation":…,"title":…,"messages":[…]}`; change the title; delete it (the conversation's last thread can't be deleted) |
| `POST /api/threads/NUMBER/messages` | Add a message `{"role":"user" or "assistant","content":…}`. Questions can carry `"attachments":[{"kind":"image","name":…,"type":"image/jpeg","data":"base64…"}, {"kind":"text","name":…,"type":…,"text":…,"pages":…}]`. Messages in a thread's contents carry an index of their attachments `"attachments":[{"id":…,"kind":…,"name":…,"type":…,"pages":…,"chars":…}]` |
| `GET /api/attachments/NUMBER` | An attachment: the file itself for images, the extracted text (`text/plain`) for documents |
| `DELETE /api/threads/NUMBER/last-answer` | Delete the last answer (when regenerating) |
| `POST /api/conversations/NUMBER/messages`, `DELETE /api/conversations/NUMBER/last-answer` | Routes of the earlier version. Add a message to the conversation's most recently created thread / delete the last answer, and return the thread's contents |
| `GET /ws` (WebSocket) | Each time `{"thread":NUMBER}` arrives, sends that thread's messages to Ollama with the conversation's settings and streams the answer (with only `{"conversation":NUMBER}`, that conversation's newest thread). With `"summary":true`, streams a summary of the thread (not stored). With `"web":true` too, searches the web first. `"code":true` gives the sandbox tools, `"github":true` the GitHub tools |
| `POST /api/chat` | The same, for when WebSocket can't be used (one JSON per line) |

Streamed answers are individual JSON objects: `{"content":…}` (more of the answer), `{"thinking":…}` (thoughts), `{"stats":{"tokens":…,"seconds":…,"prompt":tokens of the text sent}}` and `{"error":…}`. After a web search, it first sends `{"sources":[{"title":…,"url":…}, …]}` (or `{"notice":…}` if the search failed). When sandbox tools are used, it sends `{"running":…}` before and `{"tool":{"name":"run","command":…,"output":…,"code":…}}` or `{"tool":{"name":"write_file","path":…,"content":…,"output":…}}` after (`make_document` sends `{"tool":{"name":"make_document","path":…,"format":…,"output":…}}`). When files in the work folder were created or changed during the answer, it sends `{"files":[{"path":…,"size":…}, …]}` at the end. GitHub tools send `{"running":"🐙 …を読んでいます"}` ("reading …") and `{"tool":{"name":"github_file","summary":…}}` (without the contents). Over WebSocket, `{"done":true}` is sent last.

## Decisions

### Storing conversations

1. **Conversations are stored in SQLite on the server.** The tables are `会話` (number, title, model, instructions, temperature, created, updated) and `発言` (conversation, role, content, created). Times are UNIX seconds. A negative temperature means the model's default temperature.
2. **The page saves the messages.** The page saves the question before sending it, and the answer when it has finished arriving (when stopped, the answer so far). When streaming an answer, the server reads the conversation's messages from the database and sends them to Ollama. If not a single character of the answer arrived, the answer isn't saved, so "Again" can ask the same question again.
3. **The title comes from the first question.** When the first question is added to a conversation with an empty title, the first 40 characters of its first line become the title. Click the title on the page to change it.
4. **Thoughts aren't saved.** A thinking model's thoughts (`thinking`) are only shown on the page and are not included in the messages sent next (as Ollama recommends).
5. **Search uses LIKE.** It returns up to 100 conversations whose title or message contents contain the words, most recently talked first. `%`, `_` and `\` are searched as plain characters, and English letters are case-insensitive. The text around the words in the first message found is shown in the list.
6. **The database is opened and closed for each request.** The database isn't kept open while an answer streams. Concurrent writes wait with `busy_timeout`.

### Threads

1. **Threads go under conversations.** Like a Claude project, a conversation is a container for settings (model, instructions, temperature, sandbox network, GitHub repositories), and you make a thread for each topic. The table `スレッド` (number, conversation, title, created, updated) was added, and a `スレッド` column was added to `発言`. Since settings live in the conversation, a new thread can use the repositories and so on without adding them again.
2. **Only the thread's messages are sent to the model.** The conversation's instructions go first as before, but messages from other threads are not sent. A long conversation makes the text sent long, so the answer takes longer to start, and the model gets dragged along by earlier topics and failures. Whether an earlier answer did a push or PR (as in the item "Have the model check after a push or PR, and redo it if it failed") is also looked at within that thread.
3. **Conversations from the previous version move into a first thread.** At startup, one thread (titled with the conversation's title) is made for each conversation without threads, and the messages without a thread are attached to it. However many times it starts, nothing happens from the second time on.
4. **The sandbox and work folder are per conversation.** Neither the container (`ohanashi-port-conversation number`) nor `作業/conversation number` changes. A repository cloned in one thread can be changed and pushed in the next. On the other hand, two threads using the sandbox at the same time use the same container.
5. **The old routes remain.** `/api/conversations/number/messages`, `/last-answer` and WebSocket's `{"conversation":number}` act on the conversation's most recently created thread. This keeps a page from the previous version that is still open able to talk.
6. **Titles are per thread.** When the first question is added to a thread, the first 40 characters of its first line become the thread's title (and the conversation's title too, if it is empty).
7. **A conversation's last thread can't be deleted.** To avoid conversations without threads, deleting the last one deletes the whole conversation.
8. **The page's route is `#conversation/thread`.** Reloading opens the same thread. A `#conversation` link from the previous version opens the conversation's most recently talked thread. Reading and writing the route is collected in `画面/道.js` and checked with `node 道具/道試験.js`.
9. **The list shows threads under the open conversation.** Only when there are two or more threads, they are listed under the open conversation, most recently talked first. Other conversations stay folded, showing only the number of threads. When searching conversations, the threads found are listed as "conversation title › thread title".
10. **The heading has two titles.** The large one is the thread's title, and the small one before it is the conversation's; click either to change it. The conversation's contents (`GET /api/conversations/number`) return only the settings and the list of threads; messages are read from the thread's contents.
11. **Answers are stored in their own thread.** If another thread is opened while an answer arrives, the answer stops as before, but the answer so far is stored in the thread that asked.
12. **The conversation's memo carries over to the next thread.** A `メモ` column (up to 8000 characters) was added to conversations, and when sending, it is added after the conversation's instructions as "## これまでのスレッドで分かったこと" ("what the earlier threads found"). Instead of sending other threads' messages, this passes on decisions (branch names, how to run tests and so on) briefly. It is kept separate from the instructions (how to answer) so that text added from answers doesn't rewrite instructions a person wrote.
13. **"Add to memo" adds only the answer.** An answer's "Add to memo" adds the answer without the progress (thoughts and tool traces) to the end of the memo, saves it, and opens ⚙ to show it. Over 8000 characters, it doesn't save and asks you to shorten it.
14. **A long thread suggests a new thread.** When the number of tokens of the text sent, which Ollama returns at the end of an answer (`prompt_eval_count`; `prompt` in `stats`), exceeds 4096 (half of the context guideline of 8192), "このスレッドは長くなりました" ("this thread has gotten long") and "まとめて新しいスレッドへ" ("summarize into a new thread") appear below the answer. Over 8192, it warns that earlier messages may not have been read. Each model's context length isn't known yet, so 8192, which most models can use, is the guideline. Once closed, it doesn't appear again in that thread.
15. **A summary is streamed, not stored.** Sending `{"thread":number,"summary":true}` over WebSocket adds the question "summarize to hand over to the next thread" after the thread's messages (without tool traces), and streams the answer without tools. For a long thread, only the first 4 and last 30 messages are sent. The page shows the summary in an editable box, and you can choose "put it at the head of a new thread" (the first message of a thread titled "title の続き", "continuation of title") or "add it to the memo and go to a new thread". Nothing is added to the original thread. Summarizing takes time, so instead of waiting on a separate route, it streams like an ordinary answer.

### The page

1. **The page is a single page.** The open conversation is `#number` in the route, so reloading opens the same conversation.
2. **Markdown uses a small converter of its own.** It loads no outside library, so it works without a network. All text is escaped as HTML first and formatting is applied afterward, so HTML in an answer shows as text. Links are http and https only.
3. **The Enter that confirms IME conversion doesn't send.** Chrome sets `isComposing` on the confirming Enter, but Safari fires `compositionend` first and then a keydown without `isComposing`. An Enter with `isComposing`, with keyCode 229, or within 150 milliseconds of `compositionend` is taken as confirmation and doesn't send (because with Safari and ATOK on macOS, the confirming Enter was sending).
4. **Stopping closes the WebSocket.** The server fails at its next send and closes the connection to Ollama too (Ollama also stops making the answer). It reconnects on the next send.
5. **Progress is shown folded.** Thoughts, tool traces (command output and written files in `~~~~`, and lines starting with "📝 " or "🐙 "), and the model's text between them go into a "途中経過" ("progress") box that starts closed; only the answer after the last tool trace is shown open. No marks are added to the saved answer; loaded conversations are split by recognizing the same shapes (`途中を分ける` in `書式.js`). While an answer arrives, the box's title shows what is happening now ("💻 動かしています: …", "running: …", and so on). When a conversation search finds something inside the progress, the box opens.
6. **Tool traces get an invisible mark.** After a tool trace, a line "道具:name" ("tool:name") starting with an invisible character (U+2063) is added and saved; progress is split by this mark, and the box's title shows the names of the tools used ("途中経過(道具: github_pr)"). This character is removed from the model's text. This is because when the model wrote text resembling a tool trace, like "🐙 … PR を作りました" ("created a PR"), it looked as if a tool had been used. Earlier answers without the mark are split by the shapes in 5. When the model's text leaves a ``` open, it is closed before the tool trace.

### Web search

1. **Uses Ollama's web search API.** The search service is the one for which people using Ollama can most easily get a key. It sends `{"query":…,"max_results":5}` to `POST https://ollama.com/api/web_search` with `Authorization: Bearer key`. It connects with the http library's HTTPS (OpenSSL), checking the certificate and name.
2. **It searches for the last question as it is.** Having the model make the search words (a tool call) would only work with models that can use tools and would run the model twice per answer, so for now the question is sent as it is.
3. **Results are passed as instructions (system) right before the question.** It lists "[1] title, URL, contents (up to 1500 characters)" and asks for sources by number. These instructions aren't saved, so they aren't passed with the next question (if the button is on then, it searches again).
4. **Sources are saved with the answer.** When the page receives `sources`, it adds a numbered "出典" ("Sources") list (Markdown links) to the end of the answer and saves the whole thing. Sources remain after reloading, and the model sees them with the next question.
5. **It answers even if it can't search.** With no key, a wrong key, or no connection, it sends `{"notice":…}` and answers without searching. The page shows the notice above the answer.
6. **The browser remembers the button's state.** One state is kept in `localStorage`, not per conversation.
7. **SearXNG works too.** For when ollama.com can't be reached or you don't want to make an account, a self-hosted SearXNG's JSON API (`GET /search?q=…&format=json`) can also be used. The question is sent with each UTF-8 byte as `%XX`, and the first five results are used. The result's shape (`title`, `url` and `content` in `results`) is the same as Ollama's API, so it is handled the same way from there. If `SEARXNG_URL` is set, it is used before the Ollama key.

### Sandbox

1. **One container per conversation.** The first time the sandbox is used, it is made with `docker run -d … sleep infinity`, and after that commands run with `docker exec`. Within the same conversation, files written and things installed earlier remain. Even after restarting the server, a running container is used as it is.
2. **No outside connection, no overuse.** The default is `--network none`, with `--memory 2g --cpus 2 --pids-limit 512 --security-opt no-new-privileges`. Each command is stopped with `timeout 120`. Output returned to the model is up to 8000 characters (if longer, the first and last 4000 each).
3. **Only two tools.** `run` (sh -c) and `write_file`. Reading a file can be done with `cat` in `run`, so tools are kept few so the model doesn't get confused.
4. **The server repeats the tool loop.** When the model returns `tool_calls`, the server carries them out in order, adds `role: "assistant"` (the calls) and `role: "tool"` (the results) messages, and sends to `/api/chat` again. This repeats until the model stops calling tools or reaches 30 times (it was 10 at first, but cloning, changing, checking, pushing and making a PR in a row reached it). When it stops at the limit, sending "続けて" ("continue") continues.
5. **Traces are saved with the answer.** When the page receives `tool`, it adds the written files and command output to the answer as Markdown code blocks (in `~~~~`) and saves the whole thing. With the next question, the model also sees what ran before. The intermediate `tool` messages themselves aren't saved.
6. **It doesn't use 「プロセス」.** The standard 「プロセス」 and 「ファイル」 (loaded by the http library) declare C's `fread` with different types and can't be loaded together. So the sandbox runs commands with `system` and a temporary file.
7. **The network is chosen per conversation.** If the conversation's `network` is true, the container is made with `bridge`; if false, with the value of `--sandbox-network` (default `none`). Even if the container is running, it is remade if the network seen by `docker inspect` differs. When the conversation table has no `網` column (made by an earlier version), it is added with `ALTER TABLE` at startup.

### 起動.sh

1. **Restarting is done by a shell script.** A する app can't rebuild itself, so the outside `起動.sh` does `git pull`, `kumu 作る` and rerunning. It runs with `sh` on macOS and Linux.
2. **They talk through files.** The app only places the file `出力/制御/再起動` on `POST /api/restart`. `起動.sh` checks for it every 2 seconds. `起動.sh` writes its status to `出力/制御/状態`, and the app passes it to the page as `update` in `/api/info`.
3. **It stops only after building.** Only when the new app has been built does it stop the old one and run again. The downtime is a few seconds.
4. **The page knows it restarted by the time.** When `started` (the time it started running) in `/api/info` changes, the page reloads.

### GitHub

1. **The API is in suru-lang/github.** The parts that use GitHub's API were split out into [suru-lang/github](https://github.com/suru-lang/github) so other apps can use them. This app keeps only the model's tools and the permissions for the conversation's repositories.
2. **Repositories are narrowed by the token and the conversation.** Which repositories can be reached is first decided by the token's permissions (with a fine-grained token, only the chosen repositories). On top of that, the ones each conversation uses are added on the page while it runs. With only a list decided at startup, you'd have to restart every time. To narrow further, add `--github-repos`. The server removes those not matching `--github-repos` when saving a conversation, and also refuses, returning the reason to the model, when a tool targets a repository not in the conversation. English letters are case-insensitive.
3. **Read and Write per conversation and per repository.** Like Claude, you choose "read only" or "read and write" when adding a repository to a conversation. It is stored in the conversation table's `倉` column as JSON `[{"repo":…,"write":boolean}]` (added to earlier tables with `ALTER TABLE` at startup).
4. **Reading is done without asking.** Read tools run without confirmation on the page.
5. **Contents aren't saved.** Files and issues read are long, and the repository changes later, so they are only passed to the model. The page shows only one line about what was read, and that is saved with the answer.
6. **The token isn't shown.** The token is shown neither in the startup log nor on the page. `/api/info` returns only the name of the token's owner (`githubUser`).
7. **Writing is also done without asking.** Whether it may write without asking is decided by "read and write" when adding the repository. No mechanism asks "do it / don't" on the page for each write. The write tool `github_issue` is passed only when there is at least one read-and-write repository, and when it runs it checks again that the repository is read-and-write.
8. **One write tool.** Creating, editing, commenting on, closing and reopening issues are one tool, chosen with `action`. Many tools confuse small models.
9. **Issues aren't deleted.** There is no delete tool; closing (`not_planned`) is enough. On GitHub too, only a repository's admins can delete issues.
10. **What it wrote is marked.** "— ohanashi-ollama(model name) で書きました" ("written with ohanashi-ollama (model name)") is added to the end of bodies and comments it writes (unless already there). On GitHub it counts as written by the token's owner, so readers can tell what the model wrote.
11. **git runs on the server.** Clone, commit and push are done with the local git, not in the container. The token doesn't need to go into the container, and it works with images without git and containers without a network. Inside the container, the model only changes files and checks them.
12. **The token is passed only for that git run.** The token is written to a file in `作業/.鍵` (700), which the container can't see; the sh that runs git reads it, deletes it right away, and turns it into `http.extraHeader` (`Authorization: Basic …`) with environment variables like `GIT_CONFIG_COUNT`. It doesn't go into the command string (shown by `ps`), `.git/config`, or the remote URL.
13. **Push only to new branches.** `github_push` refuses to push to the repository's default branch (only the first commit of an empty repository can be pushed to the default branch), and doesn't `--force` (GitHub refuses pushes that aren't fast-forward). Branch names are only letters, digits and `- _ . /`, and are wrapped in `'…'` when passed to a command. GitHub refuses protected branches.
14. **A commit takes every change.** `github_push` commits everything with `git add -A`. If there are no changes and no unpushed commits, it doesn't push and says so. The repository's hooks don't run (`core.hooksPath=/dev/null`).
15. **The server does a git push from inside the container instead.** The container has no token, so when the model tries `git push` with `run`, it isn't run in the container; instead the server finds the clone in `/work` (whose remote is the conversation's repository) and does the same as `github_push`. The branch is the one in `git push origin branch`, or the current branch if none. The push goes to the conversation's repository URL, not the remote, so even if the remote is changed inside the container, the token isn't sent elsewhere. When the conversation has no repository, it doesn't run and returns how to use `github_clone` and `github_push` (because small models kept repeating `git push` even when given the tools).
16. **It warns when the model writes that it made a PR it didn't make.** If the answer contains "PR #", "Pull Request #", "/pull/" or "プルリクエスト" but `github_pr` didn't make a PR within that answer, a warning "⚠ … PR を作れていません" ("couldn't make the PR") is shown after the answer. Small models sometimes wrote that they made a PR without using the tool, or when the tool failed.
17. **Push warns the same way.** If the answer contains "push しました", "Pushed" and the like but `github_push` (or `git push` in `run`) didn't push within that answer, it warns "⚠ … push していません" ("didn't push").
18. **Tool traces from earlier answers aren't sent to the model.** Tool traces the page added to answers (blocks in `~~~~`, lines starting with "🐙 " or "📝 ", and tool mark lines) are removed when sending to the model next. When they were sent, the model started writing text of the same shape, like "🐙 … に push しました(…)", without using tools.
19. **Tools used are printed in the terminal.** Each time the model uses a tool, one line "[会話 number] 道具 name: arguments → head of the result" is printed in the terminal it was started from. You can check whether tools were really used, apart from the page.
20. **If the model writes "done" without using tools, it is asked again.** When the conversation has a GitHub repository and the model writes that it "did" a PR or push without using a tool even once, the model is asked again with "writing it does nothing; call github_push and github_pr", and continues the answer (the page shows "⚠ … 頼み直しています…", "asking again…"). Asking again is up to twice per answer (the item "Have the model check after a push or PR, and redo it if it failed" below), and if it still isn't done, the warnings of 16 and 17 are shown. With qwen3-coder-next, asking a few times got it to use the tools.
21. **What an earlier answer did isn't warned about when written again.** If `github_push` pushed or `github_pr` made a PR in an earlier answer (one the page marked with tool marks), neither a warning nor asking again happens when the model writes it again.
22. **It can clone again.** With `fresh: true`, `github_clone` moves an existing `/work/name` to `/work/name.old-time` and clones again. When `github_pr` is refused with "no history in common" (the branch's history isn't connected to the base), the model is told to clone again, move the changed files, and push to a new branch. A branch pushed from a folder made with `git init` in the container didn't connect to GitHub's main, so no PR could be made.
23. **It also asks again when the model writes a tool call as text.** If, without using a tool even once, the answer contains both a tool name (`github_push`, `write_file`, `run "…"` and so on) and something that looks like arguments (`repo=`, `path=` and so on), it asks again as in 20. The request adds "if you were only explaining, answer again without writing tool calls". This is because qwen3.6:35b wrote the steps as text, like "github_push repo=…, branch=…", instead of calling the tool.
24. **Have the model check after a push or PR, and redo it if it failed.** The results of `github_push` (and `git push` in `run`) and `github_pr` come with English instructions visible only to the model. On success: "before answering, check with `github_tree` (with the branch) and `github_issues` (with the PR number)"; on refusal: "read the error, fix it and call again; don't write that it's done". `git commit` in `run` gets "check with `git status` and `git log`". If the model still writes that a push or PR not done in this answer is "done", it asks again with "the tool results say it isn't done; check and call again" (the page shows "⚠ モデルが『できた』と書きましたが、…やり直すように頼んでいます…", "the model wrote 'done', but … asking it to redo…"). Asking again is up to twice per answer. This is because when a push or PR failed, qwen3.6:35b would write "done" anyway or stop, and asking again with "push with the github_push tool" worked.
25. **The server checks whether the branch written in the answer exists on GitHub.** If neither this answer nor an earlier one pushed, but the answer says "push した", "反映済み" ("reflected") and the like, things that look like branch names on the same line as "ブランチ", "branch" or "枝" (containing "/", not containing ".", and not a repository name) are compared with the list of branches of the read-and-write repositories (GitHub's API). If a branch is missing, the page shows "⚠ 答えにある枝 … は GitHub にありません(サーバーが確かめました)" ("the branch … in the answer isn't on GitHub (checked by the server)"), and the model is told that branch doesn't exist and asked to redo it. If GitHub couldn't be asked, it says nothing. This is because qwen3.6:35b wrote "checked with github_tree; branch … has been created on GitHub" without pushing or calling `github_tree`. "push した", "プッシュした", "push 済" and "反映済" were also added to the words that say it pushed.
26. **If the model still writes tool calls as text after being asked again, it says so.** If, after being asked twice, the model ends the answer having only written tool calls as text, the page shows "⚠ モデルは道具の呼び出しを文で書いただけで、道具は動いていません。答えにある実行結果やエラーは、モデルの作り話です" ("the model only wrote tool calls as text, and no tool ran; the results and errors in the answer were made up by the model"). This is because qwen3.6:35b, after writing "github_push repo=…, branch=…", went on to write a made-up error "fatal: The remote end hung up unexpectedly" and even guesses at its cause.

### Rules

1. **Rules are stored in the database.** The tables `決まり` (number, name, contents, default, created, updated) and `会話の決まり` (conversation, rule, order) were added to the conversation database. They sit in the same file as conversations and can be edited from the page. Rules could have been Markdown files in a `決まり/` folder, but this matches the current shape, which runs with just the executable and the database file. Rules you want to keep in a repository can be written in `OHANASHI.md`.
2. **Conversations refer to rules by number.** There are no copies, so editing a rule makes the conversations using it use the new contents from their next answer (as when editing `CLAUDE.md`). Earlier answers don't change. Deleting a rule also removes it from the conversations using it.
3. **Rules and instructions go into one system message, at the head.** When sending, "rules (in the order attached) → the repository's rules → the conversation's instructions (`# この会話の指示`) → memo" are made into one `system` message with headings. Some model templates don't read `system` messages after the first. Conversations without rules are sent the same text as before. Thread summaries also get the rules (not the repository's rules).
4. **The current instructions stay as they are.** Each conversation's instructions can be used as "instructions for this conversation only".
5. **One example is included.** When the rule table is first made, one rule, "コードを書くときの決まり" ("rules for writing code": match the current style, change only what was asked, run and check, ask if unsure, and so on), is added. It doesn't get the default mark, so users attach it to conversations themselves. So that it isn't added again after being deleted, the database's `user_version` is set to 1 once added.
6. **Length is limited.** Rules use the model's context every time they are sent, and Ollama's context (`num_ctx`) is often short, so one rule is up to 8000 characters. The page shows the total characters of the attached rules and warns over 6000.
7. **The repository's rule file is read in answers that use the sandbox or GitHub.** Only the work folder itself (`作業/conversation number/`) and the folders one level below it that have `.git` are looked at (no deeper search). The first of `OHANASHI.md` → `AGENTS.md` → `CLAUDE.md` is read, up to its first 4000 characters. If longer, it is cut, with "read the rest with cat /work/…/OHANASHI.md". The local sh reads it, so it can be read without a container.
8. **If found partway through an answer, it is passed at once.** After a sandbox tool is used, it searches again, and if different from before, a `system` message "作業フォルダのリポジトリに、次の決まりがあります" ("the repository in the work folder has these rules") is added after the tool result. This lets the model follow the rules even when cloning and changing happen in one answer. The sandbox guide also says "follow the rule file if there is one".
9. **Reading is announced in the thread's first answer.** Announcing every time would be noisy, so the file read is announced with `{"notice":…}` only when the thread has no answer yet, and when found partway through an answer.

### The listening address

1. **The default is 127.0.0.1.** Since it holds conversation records, by default it can be opened only from the same machine (suru-lang/suru#117). Before, する could only listen on 0.0.0.0, and the only way to close it was a firewall.
2. **Choose with `--listen`.** With `--listen 0.0.0.0`, other machines can open it. For IPv6, write it like `--listen ::1`. It is passed to the HTTP library 0.5.0's `「アドレス:ポート」 を … で WebSocket内の待受する`.

### The Ollama library

1. **The API is in suru-lang/ollama.** Talking with Ollama (streaming `/api/chat`, splitting the received lines into pieces, thoughts, tool calls, completion and errors, `/api/tags`, `/api/version`, the web search API) was split out into [suru-lang/ollama](https://github.com/suru-lang/ollama) so other apps can use it (#31). `Ollama.suru` is gone, and this app keeps only [詰替.suru](詰替.suru), which repacks from the conversation database's types.
2. **Messages to send are held in the library's type.** Messages added partway through an answer (the assistant message that called tools, tool results, asking again, the repository's rules read again) are also made as `Ollama発言`, not JSON.
3. **This app runs the tool loop.** The limit on tool rounds, `{"running"}` and `{"tool"}` to the page, and asking again are tied to the sandbox and the page, so they stay in `本体.suru` rather than the library.
4. **Failure messages are the library's.** When Ollama returns `{"error":…}`, "Ollama: model 'x' not found", and when it can't connect, "…/api/chat に聞けませんでした: …" ("couldn't ask …/api/chat: …"), are the same text as before. The 502 text when the model list couldn't be fetched uses the library's text as it is. When the web search key is wrong, it is now "Ollama に断られました(401: …)。鍵を確かめてください" ("refused by Ollama (401: …); check the key").

### Attachments

1. **Images and documents go in the table `添付`.** What is attached to a question is stored per message in the table `添付` (kind, name, MIME, contents, text, page count). Deleting a message, thread or conversation deletes them too (`ON DELETE CASCADE`). It fits in the database's single file, so copying it carries everything.
2. **Images are stored as base64 strings.** Ollama's `images` are base64 strings, so to avoid re-encoding on every send, the received base64 goes into `中身` as it is (about a third larger than the bytes). It is decoded only when shown with `GET /api/attachments/number`.
3. **The page shrinks images and unifies their format.** Images are made JPEG (PNG if transparent), up to 1600px on the long side, before sending. The database doesn't get heavy, and formats Ollama may not read, like HEIC and WebP, are unified. The server accepts only PNG and JPEG, and checks that the base64 can be read.
4. **The page extracts the text of PDFs.** pdf.js is placed in `画面/外/pdfjs/` and loaded the first time a PDF is attached (without connecting to a CDN, so it works locally). `cmaps/` is included for Japanese PDFs. The server needs no poppler or the like. The original PDF isn't stored, only the extracted text and the page count.
5. **Documents go before the question when sent to the model.** They are wrapped in `<file name="報告.pdf">…</file>` and placed before the question. The conversation database's `内容` keeps only the question a person wrote, so search snippets and thread titles aren't filled with PDF text (a question sent with only attachments and nothing written takes the first attachment's name as the title). `"`, `<` and `>` are removed from names.
6. **Lists carry only the catalog.** Messages in a thread's contents carry only the catalog of attachments (number, kind, name, page count, character count); image contents are read only when sending to the model.
7. **Sizes have limits.** Up to 8 images per question, each up to 14 million base64 characters (about 10MB originally), attached text up to 100,000 characters in total, and request bodies up to 30MB. The page refuses beforehand too.
8. **Images are sent with the Ollama library.** `Ollama画像追加する` of suru-lang/ollama 0.2.0 adds `images` to the message.
9. **The page turns pages without text into images.** pdf.js draws the page (1600px on the long side, JPEG on white) and sends it as an ordinary image attachment. The server is unchanged. For a page turned into an image, the inside of `<file>` becomes "(このページは画像で添えます)" ("this page is attached as an image"). The mark is set from the start, and beyond the limit (8 together with images), pages are turned into images from the first. Choosing pages that have text to turn into images isn't possible yet.
10. **Whether a model can read images is asked with Ollama's `/api/show`.** If `capabilities` lacks `vision`, the model is taken as unable to read them. It asks each time `/api/models` is opened and each time an answer is made. When making an answer, it uses the capabilities in the model book if there, and asks otherwise. With older Ollama without `capabilities`, or when it couldn't ask, it doesn't stop.
11. **Images aren't sent to models that can't read them.** If the last question has images, the server also refuses before sending to Ollama. Images from earlier questions are removed, and "(画像: 猫.jpg)" ("image: cat.jpg") is written before the contents (so the model knows there was an image). When switching to a model that can't read images in a thread with earlier images, the page warns "前の画像は読まれません" ("earlier images won't be read").

### Modes

1. **Modes are per conversation.** `モード` (`会話` "chat" or `コーディング` "coding") was added to the table `会話` in the conversation database. Threads use the conversation's mode. The page remembers the mode chosen last for new conversations.
2. **Rules get a scene.** `場面` was added to the table `決まり`, with "いつも" ("always", the earlier "default"), "会話", "コーディング", and "" (attached by hand). The API's `"default"` remains, and `"default":true` is the same as "いつも".
3. **Changing the mode re-attaches the scene's rules.** The rules for the old mode's scene are removed and the rules for the new mode's scene are attached. Rules attached by hand and "いつも" rules stay. You can remove them by hand after re-attaching.
4. **The example rule goes to the coding scene.** If "コードを書くときの決まり" hasn't been changed, its scene becomes "コーディング" (`user_version` 2).
5. **Coding mode always reads the repository's rules.** Even in answers that don't use the sandbox or GitHub, `OHANASHI.md` and the like in the work folder are read. Switching to coding mode turns on "💻 砂場" on the page (when available).

### Model book

1. **The book is in the same file as the conversation database.** The table `モデル帳` (name, digest, size, family, parameters, quantization, context length, capabilities, features, scores, cautions, researcher, research time, failures, manual edits) and a status table for the research, `モデル調べ` (one row), were added. Models gone from Ollama are removed from the book too.
2. **Startup doesn't wait.** Once connected to Ollama, a separate thread asks `/api/tags` and `/api/show`, updates the book, and researches. Models with the same `digest` aren't asked again; changed models are marked to be researched again. Between threads, the database table separates the status (only one researcher, by `走` in the table's one row). Restarting resets `走`.
3. **Research only happens with web search.** Without SearXNG or an Ollama API key, only size and capabilities are recorded (you can write by hand on the page). The search words are "name LLM" and "family parameters benchmark coding", passing the first four of each. Model names are sent to web search.
4. **The answer's shape is set with Ollama's `format`.** A JSON Schema of `{"summary","scores":{"coding","chat","japanese","reasoning"},"notes"}` is passed, with temperature 0. JSON is read even with text or ``` around it; an answer whose scores aren't 0–5 or whose features are empty counts as a failure and is asked again once.
5. **How the researcher is chosen.** In the order `--research-model` → the model that researched before → the model of recent conversations → the largest model that can use tools → the largest model. With `--research-max-size`, larger models aren't chosen (except a named model).
6. **If weak, research again once.** If the researcher is under 7B or half or more failed, the researched models are researched again with the largest model that can use tools and has at least twice the parameters. Researching again happens only once.
7. **Research again only when the digest changes or when asked.** "調べ直す" ("research again") is `POST /api/models/research`. Models edited by hand aren't researched again.
8. **Recommendations only when making a conversation.** From models with scores, it chooses in the order of the mode's score (for coding, from those that can use tools, or from all if none), Japanese score, and smallness. Without scores, the largest model (for coding, one that can use tools). The page uses only recommendations with scores; otherwise it uses the model chosen before. After a conversation is made, the model isn't changed on its own.
9. **`keep_alive` and timeouts aren't set.** suru-lang/ollama 0.2.0 doesn't have them, so each research loads the model with Ollama's defaults. Switching to a large model can slow other answers meanwhile.

### Files in the work folder

1. **The local sh does the counting.** `find` and `stat` (macOS's `stat -f` if there is no GNU `stat -c`) read the paths, sizes and modification times of files in the work folder. The list can be shown without a container (even after the conversation is deleted). `.git` and `.文書`, the draft folder of `make_document`, aren't included. Folders with `.git` (made by `github_clone`) have many files, so only the folder name is shown. Up to 500.
2. **New files are found by comparing the lists before and after the answer.** In answers that use the sandbox, the list is read before starting and again at the end, and files that are new or changed in size or time are sent to the page as `{"files":…}`. They are found the same way whether made with `run`, `write_file` or `make_document`.
3. **Links are saved with the answer and not sent to the model.** When the page receives `files`, it adds lines "📄 [name](path)(size)" to the end of the answer and saves them. As with tool traces, lines starting with "📄 " are removed when sending to the model next.
4. **Serving uses suru-lang/http's `前置付配信する`.** Only the inside of that conversation's work folder is served. "..", ".", "\", `%00` and symbolic links pointing outside the folder are 403, and names starting with "." are 404.
5. **Downloading is the default.** `Content-Disposition: attachment` is added. Only PDFs and images (PNG, JPEG, GIF, WebP) are made `inline` with `?view=1` to open in the browser. So that HTML or SVG written by the model doesn't run scripts on the same origin as this page, `X-Content-Type-Options: nosniff` and (except for PDF) `Content-Security-Policy: sandbox` are added too. The `Content-Type` of docx, xlsx and pptx is held by the app.

### Making documents

1. **Documents are made in the sandbox.** The server has no pandoc or the like; it writes the Markdown to `/work/.文書/元.md` in the container and converts it with `/opt/ohanashi/文書.py` in the container. It keeps the local machine clean and doesn't run what the model wrote locally.
2. **One tool; the model only writes Markdown.** `make_document` (`format`: `pdf` or `docx`, `path`, `markdown`, `title`). Even a small model can make documents without writing python-docx code. If `path` is omitted, it is `出力/title.extension`. Paths outside `/work` and names starting with "." are refused. The result is "📄 出力/報告.pdf を作りました(3 ページ・48KB)" ("made 出力/報告.pdf (3 pages, 48KB)").
3. **docx uses pandoc's defaults; PDF is pandoc → HTML → WeasyPrint.** Japanese fonts and CSS ([砂場/文書.css](砂場/文書.css): A4, table borders, page numbers) can be used. LaTeX and LibreOffice are large, so they aren't installed.
4. **Whether an image can make documents is seen from the image's label.** `砂場/Dockerfile` has `LABEL ohanashi.documents="1"`, checked at startup with `docker image inspect`. With the label, `make_document` is passed, and the guide says "use make_document when asked for Word or PDF". Without `--sandbox-image`, `ohanashi-sandbox` is used if it exists.
5. **Versions are pinned.** The base image is `python:3.12-slim-bookworm`, and the versions of pip packages (WeasyPrint 62.3 with the matching pydyf 0.11.0 and so on) are written. pandoc and fonts are Debian bookworm's.
6. **If the model only writes that it made a file, it is asked again once.** If the answer contains "作成しました", "作りました" ("made"), "ダウンロード" ("download") and the like along with names like `.docx` or `.pdf`, but no file appeared in the work folder within that answer, it is asked to make it with the tool, as with GitHub pushes and PRs. If it still doesn't, "⚠ ファイルはできていません" ("no file was made") is shown. Files made in earlier answers (names in "📄 " lines) aren't warned about when written again.
7. **Made files aren't attachments.** Being in the work folder is enough, so they aren't added to the conversation's attachments (images and PDFs given to the model to read). To have the model read one, download it and attach it with 📎.

### Notifications

1. **Done on the page alone.** The page knows the end of an answer from `{"done":true}` (with fetch, the end of the stream), so it notifies at the end of `答えてもらう()`. The server is unchanged.
2. **Notify only when not looking.** Only when the tab is hidden (`document.hidden`) or the window has no focus. No notification when you pressed "止める" ("stop") yourself.
3. **The tab title mark is always on.** If an answer finishes while you aren't looking, "✅ " ("⚠️ " on failure) is added to the head of the tab title and removed when you look at the tab. It needs no browser permission and also works when opened over http from another machine.
4. **Notifications only when turned on in ⚙.** Checking "🔔 見ていない間に答えが終わったら通知する" ("notify when an answer finishes while I'm not looking") asks the browser for permission (Safari and others can only ask on a click). It is off by default so a permission window doesn't pop up out of nowhere. It is stored in localStorage as a setting of this browser, not per conversation.
5. **The notification's contents.** The title is the thread's title, and the body is the head of the answer without progress (up to 100 characters, without Markdown symbols). A failure is "失敗しました: …" ("failed: …"). `tag` is per thread, so notifications from the same thread merge into one. Clicking returns to that tab and opens that thread. Looking at the tab closes the notifications shown. Making the contents is collected in `画面/通知.js` and checked with `node 道具/通知試験.js`.
6. **Notifications only in secure places.** Browser notifications work only when opened on localhost or https. When opened from another machine at `http://192.168.…`, the ⚙ checkbox is disabled and the reason is shown. No sound is played; the OS's notification sound is left to do that.
7. **Closed tabs get nothing.** Delivering to a closed tab needs a Service Worker and Web Push, plus https, keys, and server changes, so it isn't done for now.

### https

1. **TLS is left to Tailscale Serve.** The http library's HTTPS is client only; there is no server TLS. Sockets of する's 「通信」 aren't OS fds, so making server TLS would need work in both the core and the http library. Opening from other machines is mostly done with Tailscale, so Tailscale Serve, which prepares and renews certificates, sits in front (#75, #76).
2. **Origin can be http or https.** Tailscale Serve passes the Host as it is, so when opened over https, `Origin` is `https://` + Host. If `Origin` is `http://` + Host or `https://` + Host, it is accepted; other sites are refused as before.
3. **WebSocket comes from the page's URL.** The page makes the WebSocket URL by changing `http` in `location.href` to `ws`, so opening over https gives `wss://`.

### Suru 0.9.1

1. **Suru 0.9.1 or later is required.** The libraries it uses, http 0.7.0 and sqlite 0.4.0, write their C functions with 「以下は外部の入出力動作です … 以上です」, which Suru 0.9.1 introduced. A `kumu` older than that can't build them.
2. **The sandbox's C function is written on one line.** The two lines of type declaration and definition are now `s を 命令渡しする とは 外部の「system」 で 文字列 を 受け取って 整数 を 返す 入出力動作です`, so the name appears once. With only one C function, there is no need for a 「以下は外部の入出力動作です」 block.

## Future candidates

- Put the page's files into the executable so it can start from any folder
- Web search: have the model make the words (a tool call), read pages with `/api/web_fetch`, choose SearXNG's language and categories
- Export conversations to Markdown or JSON
- Attachments: choose PDF pages that have text to turn into images too (pages with many figures)
- Install models from the page (`/api/pull`), clean up unused models
- Sandbox: confirm commands before running them, run the container as the local user
- Documents: make Excel and PowerPoint too (`xlsx` and `pptx` in `make_document`'s `format`), match Word's look with `砂場/見本.docx`
- Trim long conversations to fit the model's context length (`num_ctx`)
- Rewrite a question and remake from there
- Model book: shorten Ollama's `keep_alive` when researching, record each model's strong languages, choose the researcher on the page
- Rules: writing `@name` in a question reads that rule for that question only. Export and import rules as Markdown files

## License

[MIT](LICENSE)
