# Prompts for coding agents

[Back to the README](../README.md)

Paste these into a coding agent such as Claude Code. The first prompt installs Magpie. The others assume Magpie is installed.

> [!IMPORTANT]
> Never paste your X cookies or your Jev key into an agent chat. Enter both in the web app's setup screen, or enter the Jev key in your own terminal. The prompts tell the agent to stop and give those steps to you.

## Set up Magpie on this machine

Open your agent in any folder.

```text
Set up Magpie on this machine.

1. Run: curl -fsSL https://raw.githubusercontent.com/ianpoley/magpie/main/install.sh | bash
   It installs Bun if missing, downloads Magpie into ~/magpie (or updates it), and
   runs setup. With no terminal attached, setup never prompts: it installs the
   background services and links the Claude skill, and stops at anything that holds
   a secret or would replace something (services installed from another clone, a
   skill linked elsewhere). Do not install global npm packages or Homebrew formulas:
   Birdclaw and bird are repo dependencies, and setup says how to get Node 26 if it
   can't find it.
2. If it stops, read ~/magpie/README.md and ~/magpie/packages/engine/SETUP.md, fix
   what you can, and explain what you can't.
3. If it lists services from another clone or a skill linked elsewhere, stop and
   ask me before doing anything about it.
4. Do not ask for, read, or handle my X cookies or my Jev key. Tell me to run the
   same install command myself in a terminal: it opens the web app's setup screen,
   reads the Jev key with echo off, and skips everything already done.

End with setup's "Still to do" list and a short summary: what is running, on which
port, and what I still need to do.
```

## Get oriented before you change the code

Open your agent in the Magpie folder (`~/magpie` by default).

```text
I want to work on Magpie. Before you change anything, get oriented:

- Read README.md, docs/usage.md, docs/development.md, CONCEPTS.md (domain
  vocabulary), packages/engine/README.md, apps/web/README.md, apps/web/AGENTS.md
  and apps/web/DESIGN.md.
- Skim docs/solutions/: past problems and the decisions they led to.
- Note the rules: the web app loads engine code only through
  apps/web/src/lib/engine.ts; UI is built from @ui-sdk/react with Grove tokens;
  read the Next.js docs bundled in node_modules before using a Next.js API.
- Do not start a second `next dev` in apps/web if one is already running.
- Never touch state/corpus.sqlite directly: it holds my edits and can't be rebuilt.

Then summarize how a sync flows from X to the web screen, list the checks to run
before a change is done (lint, typecheck, test, build), and wait for my task.
```

## Use your saved posts in another project

After you install the skill, use this from any project:

```text
Use the magpie skill. Run `categories`, find the topics that fit what we are
building, and pull the most relevant posts and resources. Suggest 3 concrete ideas
for this feature, and cite each one with the @handle and post URL.
```
