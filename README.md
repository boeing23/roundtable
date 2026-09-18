# Roundtable

Stop re-explaining yourself to every AI.

Roundtable is a local web app that keeps **one story** across Claude, GPT and Gemini. Talk to any of them alone, or put them at a table together — where **you** decide who hears what.

Think of the models as friends. You can tell one of them something in private. You can ask all three the same question and hear them out separately. And when you want them to argue it out, you pass one friend's answer to another and ask "this is what they think — what's your take?"

Everything runs on your machine against your own API keys. No account, no server, no telemetry.

---

## What it does

**Solo chats, kept private.** Each model has its own thread in a topic. What you tell Claude stays with Claude until you decide otherwise.

**A roundtable you actually mediate.** Pick models, ask once, and each answers independently without seeing the others. Then you choose: tick the answers worth passing on, pick who should respond, add a note, send. Shared answers arrive labelled (`<opinion from="Claude">`), so no model mistakes another's words for its own. Repeat for as many rounds as you like, or drop back into a private chat with whichever model you found most useful — it keeps the full context.

**Selective sharing from private chats.** Halfway through a solo chat and want the others caught up? Tick the specific messages to share. Nothing else leaks.

**Memory that survives the conversation.** Close a topic and a model drafts a summary plus the decision you took; you edit it and save it as a *bucket*. Start a related topic later and the app suggests which past buckets to pull in. You confirm; they become background every model sees.

**One profile, all three models.** Each assistant has been quietly building its own picture of you. Paste what each remembers into **About me**, and the app merges them: duplicates collapse with their sources tagged, contradictions ("vegetarian" vs "eats fish") surface for you to resolve, and anything you type yourself wins. The result goes into every model's instructions, in every topic.

**Long conversations don't fall over.** When a model's view of a topic grows too large, older turns fold into a rolling summary while recent ones stay verbatim.

**PDFs and text files.** Attach them; the text travels with the message.

---

## Quick start

Needs Node 20+ and at least one API key.

```bash
git clone https://github.com/boeing23/roundtable.git
cd roundtable
npm install
cp .env.example .env.local   # add at least one key
npm run dev                  # http://localhost:3000
```

```bash
# .env.local
ANTHROPIC_API_KEY=...        # console.anthropic.com
OPENAI_API_KEY=...           # platform.openai.com
GEMINI_API_KEY=...           # aistudio.google.com
```

Any subset works. Models without a key show as unavailable. Everything lives in `data/mediation.db` (SQLite, git-ignored) — back it up by copying the file; delete it to start over.

These are **pay-per-use developer API keys**, not ChatGPT Plus / Claude Pro / Gemini Advanced subscriptions — those can't be used from an app. A roundtable round costs roughly three times a single question, since each model reads the shared story.

Models are configured in [`lib/models.ts`](lib/models.ts) — swap in whichever ones your keys can reach.

---

## How it works

Each model gets its own view of a topic, assembled per request in [`lib/context.ts`](lib/context.ts): its own solo thread, the roundtable turns it was asked in, whatever you explicitly shared with it, the topic's background buckets, and your profile. Nothing else. Other models' words always arrive wrapped in `<opinion from="…">` or `<conversation with="…">` tags and labelled as theirs.

```
app/       UI + API routes
lib/
  models.ts       which models exist, and their API ids
  providers/      one streaming interface, three official SDKs
  context.ts      per-model timeline, sharing, compaction
  profile.ts      memory import, merge, conflict handling
  db.ts           SQLite schema and queries
components/       Solo, Roundtable, Memory, About me
```

Stack: Next.js 16, React 19, Tailwind 4, better-sqlite3, official Anthropic/OpenAI/Google SDKs.

---

## Privacy

Your conversations, buckets and profile stay in a local SQLite file. What leaves your machine is only what a model needs for a given request, sent straight to that provider. Your profile goes to every model you talk to, so leave out anything you'd rather they not have. Solo threads are never shared behind your back — the app only sends what you ticked.

---

## Contributing

Issues and PRs welcome. `npm run build`, `npx tsc --noEmit` and `npx eslint .` should all pass. If you add a provider, implement the `Provider` interface in `lib/providers/` and add an entry to `MODELS`.

Tests must never touch your real database — set `MEDIATION_DB=/tmp/test.db` when running scripts.

## License

MIT — see [LICENSE](LICENSE).
