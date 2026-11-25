# ohanashi-sandbox: 砂場で文書(Word・PDF)を作れるイメージ
#   docker build -t ohanashi-sandbox 砂場
# python:3.12-slim(Debian bookworm)に、pandoc・WeasyPrint・python-docx・openpyxl・matplotlib と日本語のフォントを足します。
# 道具 make_document は /opt/ohanashi/文書.py で Markdown を docx か PDF にします(README「文書を作る」)。
FROM python:3.12-slim-bookworm

# pandoc(Markdown → docx・HTML)、日本語のフォント、WeasyPrint が使う Pango
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pandoc \
      fonts-noto-cjk \
      libpango-1.0-0 \
      libpangoft2-1.0-0 \
      libharfbuzz-subset0 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      weasyprint==62.3 \
      python-docx==1.1.2 \
      openpyxl==3.1.5 \
      matplotlib==3.9.2 \
      pydyf==0.11.0

# matplotlib の図でも日本語が化けないように、既定のフォントを Noto Sans CJK JP にする
RUN mkdir -p /etc/matplotlib \
 && printf 'font.family: sans-serif\nfont.sans-serif: Noto Sans CJK JP, DejaVu Sans\n' > /etc/matplotlib/matplotlibrc
ENV MATPLOTLIBRC=/etc/matplotlib/matplotlibrc

COPY 文書.css 文書.py /opt/ohanashi/

# ohanashi-ollama は、この印で「文書を作れるイメージ」と分かり、道具 make_document を渡す
LABEL ohanashi.documents="1"
