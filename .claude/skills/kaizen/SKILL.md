---
name: kaizen
description: Autonomously and endlessly improve the current project from many angles (UX, visuals, bugs, performance/lag, balance, spec drift, code cleanup, security, stale docs, test coverage, plus project-specific angles) — find a problem, fix it, debug/verify, log, commit, push, repeat — until the user says stop. Use when the user asks to keep improving the project unattended, or invokes /kaizen. Arguments: things NOT to touch.
---

# kaizen: improve until told to stop

The user starts this and walks away. **Never stop on your own, never wait for approval.** Keep cycling until the user says stop (「ストップ」「止まっていいよ」「止めて」, etc.).

Arguments (`$ARGUMENTS`) list things NOT to touch (e.g. 「ボスの動きは触らない」). Treat them as hard rules, together with every rule in the project's CLAUDE.md (language, reporting style, branch, commit trailers, forbidden areas).

## Progress reports (always in Japanese)

The user cannot see what you are doing unless you tell them. Write every progress report **in Japanese**, short and plain, with no jargon (the user may not write code).

- Starting: one line on what you will look at first (例「まず全体を調べて、見る観点の一覧を作ります」).
- During long investigation, building or testing: one line between tool calls (例「いまゲームを起動して、画面の写真を撮っています」). Never work silently for long.
- After each cycle: 2–3 lines saying what problem was found, what was fixed, how it was checked, and what comes next (例「御触れ書きの文字が小さかったので大きくしました。ゲームで写真を撮って確かめました。次はラグを調べます」).
- If something takes longer than expected or the plan changes, say why in one line.
- Every 5 cycles: a short numbered summary of everything done so far.

## 0. Setup (once per session)

1. Read CLAUDE.md, README, docs, build files, and recent git log to learn: what the project is, how to build, test and run it, and the working branch.
2. Build the **angle list** for this project. Start from the base list and add project-specific angles (a game: lag, difficulty, game feel; a website: load speed, mobile layout, accessibility; and so on):
   - user's eye (confusing, tedious, lost)
   - visuals
   - bugs and crashes
   - performance and lag
   - balance (prices, strength, rewards)
   - spec/design-doc drift (written but not built, or built differently)
   - code cleanup (dead code, duplication)
   - security (leaked secrets, unsafe input)
   - stale docs and records
   - test coverage and verification tooling
3. Find the improvement log (e.g. `docs/KAIZEN_LOG.md`; create it if absent) and the proposal list `docs/KAIZEN_PROPOSALS.md` (create if absent).
4. Make a task list (TaskCreate) with short items in the user's language.

## 1. One cycle

1. **Find**: pick the angle not yet covered, or covered least recently. Investigate concretely: read code, run the app, take screenshots, grep docs against code. Pick 1–3 problems with clear value.
2. **Decide**:
   - Small or clear-cut → fix now.
   - Changes how the product is played or used in a big way (redesigns, removing features, anything touching an excluded area) → do NOT build it. Append it to `docs/KAIZEN_PROPOSALS.md` (problem, idea, recommendation) and move on.
3. **Fix**: keep each change focused.
4. **Debug / verify**, using the first method that works:
   1. run the automated tests
   2. build or compile
   3. run the app and screenshot or observe the changed part

   If verification fails, fix and re-verify. If it cannot be fixed, revert the change and record why. If no verification is possible, say "unverified" in the log.
5. **Record**: add one row per improvement to the log (what, why, how verified, evidence path). Update checklists or docs if the project keeps them.
6. **Save**: commit with the project's commit rules, fetch and rebase, then push to the working branch. Work must survive the container disappearing.
7. **Report**: in Japanese, as described in "Progress reports" above.
8. **Continue**: start the next cycle immediately. If the turn must end, schedule the next cycle with the `/loop` dynamic mode (ScheduleWakeup with this same prompt, short delay) so work resumes without the user.

## 2. Rules

- Never ask the user questions mid-loop. Take the safest reasonable choice, or put the question in the proposal list.
- Never do destructive or outward-facing actions beyond committing and pushing the working branch: no force-push over others' work, no PRs, no deleting user data, no publishing.
- Do not repeat the same fix. Check the log before choosing.
- If a cycle runs long, say so in one line.
- Rotate angles so the whole project gets covered over time, including performance and lag.

## 3. When told to stop

1. Finish or revert the change in progress so the project still builds. Commit and push.
2. Report in Japanese, short and plain:
   - a numbered list of everything improved this session, with screenshots where available
   - the proposal list items that need the user's decision, each with a recommended answer
3. Stop scheduling further cycles (ScheduleWakeup with `stop: true` if a loop is active).
