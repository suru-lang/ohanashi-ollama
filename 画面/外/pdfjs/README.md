# pdf.js

[pdf.js](https://github.com/mozilla/pdf.js)(Mozilla、Apache-2.0。[LICENSE](LICENSE))の配布物 `pdfjs-dist@4.10.38` から、次をそのまま写したものです。手で書きかえないでください。

- `legacy/build/pdf.min.mjs` → `pdf.min.mjs`
- `legacy/build/pdf.worker.min.mjs` → `pdf.worker.min.mjs`
- `cmaps/`(日本語などの PDF の文を取り出すのに使う)

古い Safari でも動くように legacy の版を使っています。版を上げるときは `npm pack pdfjs-dist@版` で取ってきて、同じ所を写します。
