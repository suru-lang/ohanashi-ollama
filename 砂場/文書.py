# 文書.py: Markdown を Word(docx)か PDF にする(ohanashi-ollama の道具 make_document が、砂場のコンテナの中で動かす)
#   python /opt/ohanashi/文書.py docx|pdf 元.md 出力の道 [題]
# できたら「pages=ページの数 bytes=大きさ」を1行出す(docx のページの数は 0)。だめなら理由を出して 1 で終わる。
# 相対の道(画像など)は、今のフォルダ(/work)から探す。
import os
import subprocess
import sys

ここ = os.path.dirname(os.path.abspath(__file__))
様式 = os.path.join(ここ, "文書.css")
見本 = os.path.join(ここ, "見本.docx")


def pandoc(引数, 入力):
    r = subprocess.run(["pandoc", "-f", "markdown", "--resource-path", os.getcwd()] + 引数 + [入力],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("pandoc: " + (r.stderr or r.stdout).strip())
    return r.stdout


def docx(入力, 出力, 題):
    引数 = ["-t", "docx", "-o", 出力]
    if 題:
        引数 += ["--metadata", "title=" + 題]
    if os.path.exists(見本):
        引数 += ["--reference-doc", 見本]
    pandoc(引数, 入力)
    return 0


def pdf(入力, 出力, 題):
    from weasyprint import HTML

    本文 = pandoc(["-t", "html5"], 入力)
    with open(様式, encoding="utf-8") as f:
        css = f.read()
    頭 = f"<h1 class=\"title\">{esc(題)}</h1>\n" if 題 else ""
    html = (f"<!DOCTYPE html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\"><title>{esc(題 or os.path.basename(出力))}</title>"
            f"<style>{css}</style></head><body>\n{頭}{本文}</body></html>\n")
    文書 = HTML(string=html, base_url=os.getcwd() + "/").render()
    文書.write_pdf(出力)
    return len(文書.pages)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in ("docx", "pdf"):
        print("使い方: python 文書.py docx|pdf 元.md 出力の道 [題]", file=sys.stderr)
        return 2
    形, 入力, 出力 = sys.argv[1], sys.argv[2], sys.argv[3]
    題 = sys.argv[4] if len(sys.argv) > 4 else ""
    場 = os.path.dirname(出力)
    if 場:
        os.makedirs(場, exist_ok=True)
    try:
        頁 = docx(入力, 出力, 題) if 形 == "docx" else pdf(入力, 出力, 題)
    except Exception as e:  # pandoc・WeasyPrint の誤りを、モデルが読めるように短く返す
        print(str(e)[:2000], file=sys.stderr)
        return 1
    print(f"pages={頁} bytes={os.path.getsize(出力)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
