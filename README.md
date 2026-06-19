# 读书助手 · Read Helper

A tiny static web app for reading. Type the **first few words** and the **last few
words** of a passage; the app locates it in the book, shows it in context, and
builds a copy‑ready prompt you can paste into any LLM.

No build step, no framework — just HTML, CSS, and one JS file.

## Use it

1. Pick a book (top‑right).
2. Enter **起始文字** (start words) and **结束文字** (end words).
3. The passage is located and highlighted in context.
   - If the start words appear more than once, you'll be asked to add a few more
     words to narrow it down.
4. Pick a prompt and press **复制提示词** (copy prompt) — or **复制原文** to copy
   just the passage.

The default prompt fills in the book title and the located text:

```
解读《罪与罚》中的如下片段：

<located passage>
```

## Run locally

The app loads books with `fetch`, so it needs a local server (opening
`index.html` directly via `file://` won't load the book):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Push to GitHub and enable **Settings → Pages → Deploy from branch → `main` / root**.
It works as‑is on GitHub Pages.

## Add a book

1. Drop a UTF‑8 `.txt` file into `books/`.
2. Add one line to `books/manifest.json`:

```json
{ "title": "书名", "author": "作者", "file": "书名.txt" }
```

## Add a prompt

Edit the `PROMPTS` array at the top of [`app.js`](app.js). `{book}` is the book
title, `{text}` is the located passage.
