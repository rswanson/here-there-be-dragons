---
name: feature-pr
description: >
  Document and update PRs for feature branches with screenshots, feature summaries,
  and technical overviews. Use this skill whenever the user asks to create a PR,
  update a PR, add screenshots to a PR, document a PR, or prepare a branch for review.
  Also use when the user says things like "update the PR", "add screenshots",
  "prepare for review", "PR description", or "document the changes". This applies
  to any PR containing user-facing feature work — if the branch has UI changes,
  new features, or modified behavior, this skill should be used.
---

# Feature PR Documentation

When a feature branch is ready for review (or needs its PR updated), this skill
produces a comprehensive PR that includes live screenshots, a feature-by-feature
summary, and a technical overview. The goal is to make the PR self-documenting
so reviewers can understand what changed, why, and what it looks like — without
needing to check out the branch.

## When to use this skill

- Creating a new PR for a feature branch
- Updating an existing PR's description or screenshots
- The user asks to "document", "screenshot", or "prepare" a PR
- Any branch with user-facing changes (UI, behavior, new features)

<HARD-GATE>
Do NOT write the PR body or call `gh pr create` / `gh pr edit` until you have
captured and committed a screenshot for every user-facing feature identified in
Phase 1. A PR without screenshots of its UI changes is incomplete — the whole
point of this skill is visual documentation. If you cannot start the dev stack
or capture screenshots, tell the user what's blocking you and ask for help.
Do not silently skip screenshots and proceed to writing the PR description.
</HARD-GATE>

## The PR Documentation Process

### Phase 1: Understand the changes

Before writing anything, build a complete picture of what changed.

1. **Identify the PR** — find or create the PR for the current branch
   ```
   gh pr list --head <branch>
   ```

2. **Analyze all commits** — not just the latest, but every commit since diverging from the base branch. This is critical for understanding the full scope.
   ```
   git log <base>..HEAD --oneline
   git diff <base> --stat
   ```

3. **Categorize changes** into:
   - **User-facing features** (things a user would see or interact with)
   - **Technical/architectural changes** (things a developer reviewing would care about)
   - **Test coverage** (what testing was added)
   - **Code quality improvements** (refactors, perf, cleanup)

4. **Build the screenshot checklist** — list every user-facing feature that needs
   a screenshot. This checklist gates Phase 2 completion. Format it like:
   ```
   Screenshots needed:
   - [ ] Feature A — description of what to capture
   - [ ] Feature B — description of what to capture
   - [ ] Feature C — description of what to capture
   ```

### Phase 2: Capture screenshots

Screenshots are the most impactful part of the PR. A PR with user-facing changes
but no screenshots is like a book review with no quotes — it asks the reader to
take your word for it. Capture screenshots for every item on the checklist from
Phase 1 before proceeding.

#### Start the dev environment

This is required, not optional. Before capturing screenshots:

1. **Check if services are already running** on expected ports (e.g., 3000, 5173)
2. **If not running, start them:**
   ```bash
   # Database
   docker compose -f docker/docker-compose.dev.yml up db -d
   # Backend server
   cargo run -p server &
   # Frontend dev server
   cd client && npm run dev &
   ```
3. **Wait for all services** to be healthy before proceeding
4. **If the dev stack cannot start** (missing env vars, DB issues, build failures),
   stop and tell the user. Do not skip screenshots.

#### Screenshot strategy

Plan screenshots that showcase each distinct feature. Think about what would be
most compelling to a reviewer:
- The overall UI layout with new components visible
- Interactive features in action (tools selected, panels open, data displayed)
- Before/after comparisons if modifying existing UI
- Edge cases or interesting states (empty state, error state, loaded state)

#### Screenshot capture approach

Write a temporary Playwright spec that exercises the features:
- Set up test data (register user, create campaign, create map, place tokens, etc.)
- Navigate to the relevant UI state
- Capture screenshots with `page.screenshot({ path: '...' })`

Existing E2E visual regression snapshots or test artifacts can supplement your
screenshots, but they rarely show features the way a reviewer wants to see them
(they're often empty states or minimal setups). Always capture purpose-built
screenshots that showcase the feature at its best.

**Screenshot quality checklist:**
- Shows the feature clearly (not just empty canvas or loading states)
- Includes relevant UI context (toolbars, panels, etc.)
- Has actual data/content visible (tokens placed, drawings drawn, etc.)
- Resolution is readable when embedded in the PR

**For features requiring data setup** (like tokens with images, populated lists):
- Use the REST API via `page.evaluate()` to create test data
- Upload assets through the UI's file input or API
- If the frontend doesn't auto-load data, inject it into state stores
  via dynamic import in `page.evaluate()`

#### Screenshot management

- Save screenshots to `docs/screenshots/` in the repo (committed to the branch)
- Use descriptive numbered names matching the PR feature:
  `sp5-01-wall-toolbar.png`, `sp5-02-fog-of-war.png`
- Reference them in the PR body via raw GitHub URLs:
  ```
  ![Description](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/docs/screenshots/<name>.png)
  ```
- Clean up temporary Playwright specs after capture

#### Verify checklist completion

Before proceeding to Phase 3, verify every item on the screenshot checklist is
checked off. If any are missing, go back and capture them. This is the gate —
do not proceed with unchecked items.

### Phase 3: Write the PR body

The PR body follows a specific structure designed for quick understanding.
Use `gh pr edit <number> --body` with a HEREDOC to set the full body.

#### PR Body Template

```markdown
## Summary

One paragraph describing what this PR implements at a high level —
the sub-project name, the scope (full stack? frontend only?), and
the key outcome.

---

## Features

### Feature Name 1
- Bullet points describing the feature
- Include specific details (configurable options, keyboard shortcuts, etc.)

![Screenshot description](url)

### Feature Name 2
...repeat for each user-facing feature...

---

## Architecture

### Backend
- What was added/changed on the backend
- New routes, database changes, domain types

### Frontend
- What was added/changed on the frontend
- New components, stores, canvas systems

### Code quality
- Refactors, shared utilities, performance improvements

---

## Test coverage
- **N backend tests** (what they cover)
- **N frontend unit tests** (what they cover)
- **N E2E tests** (what they cover)

## Test plan

- [x] Check 1 (formatting, lint, etc.)
- [x] Check 2
...all CI-equivalent checks...
```

#### Writing guidelines

- **Features section**: One subsection per user-facing feature, each with a
  screenshot. Lead with what the user can do, not how it's implemented.
- **Architecture section**: Technical details for reviewers. Group by layer
  (backend/frontend) and highlight non-obvious decisions.
- **Test coverage**: Concrete numbers and what they cover, not just "tests added".
- **Test plan**: Mirror the CI pipeline exactly. Check off items that pass.
- **Keep the title short** (under 70 characters). Use the description for details.

### Phase 4: Verify and push

1. **Run all pre-push checks** before pushing screenshots or code changes
2. **Push the branch** with new commits (screenshots, any code changes)
3. **Create or update the PR** via `gh pr create` or `gh pr edit`
4. **Verify images render** — raw GitHub URLs may take a moment to propagate

## Tips

- Resize large images before committing (256px is fine for tokens, maps can
  be larger). Use `sips` on macOS or ImageMagick.
- When uploading assets through Playwright, use `setInputFiles()` on the file
  input rather than trying to base64-encode large files through `page.evaluate()`.
- If a page reload loses state (like selected map), re-select items from
  dropdowns after reload before capturing screenshots.
- For WebGL/PixiJS canvas content, add extra wait time (3-5 seconds) after
  page load for textures to load and render.
