# Approved content pack

The Q&A assistant answers only from this folder plus the POI snapshot the
backend sends with each question (`docs/architecture.md` §7.1). This folder is
data, not code: the team writes and reviews it; the assistant never edits it.

## Files

```
content/
├── campus/   general knowledge: the remote tour, the robot, the assistant, the site
└── pois/     one file per POI, extra facts beyond the POI's DB Description/NarrationText
```

One Markdown file per topic, UTF-8, Vietnamese (the project language). Keep
answers short in mind: write facts, not marketing copy.

## Frontmatter

Every file starts with this block (simple `key: value` lines, no nesting):

```
---
id: ve-robot                 # unique slug: lowercase a-z, 0-9 and '-'
title: Về robot hướng dẫn     # shown in usedSources
kind: campus                 # campus | poi
poiId:                       # required for kind: poi — the POI GUID in the database
priority: 2                  # campus only: 1 keep first … 3 drop first when over budget (default 2)
status: draft                # draft | approved
reviewedBy:                  # required when approved: name of the team member who checked the facts
reviewedAt:                  # required when approved: YYYY-MM-DD
---
```

Rules (checked by `scripts/check_content.py`, run by `scripts/verify`):

- Only `status: approved` files are used by the assistant. Drafts are ignored.
- An approved file needs `reviewedBy` and `reviewedAt`, and must not contain
  `TODO` or `[ĐIỀN` placeholders.
- No personal data: no email addresses, phone numbers, student names, access
  codes. Staff/representative contact goes through the representative, not
  through this pack.
- Write only facts the team has verified. A missing fact is better than an
  invented one: the assistant will say it does not know.
- Body ≤ 4000 characters per file; the whole approved pack should stay within
  the prompt budget (24 000 characters). The checker prints the usage.
- POI keys are the POI `Id` (GUID), not `MapKey`: several POIs share one map.

## How the assistant builds context (selection order)

For each question the assistant assembles, in this order, until the budget is
used:

1. The POI snapshot from the backend (`name`, `description`, `narrationText`),
   or nothing when the backend sends `poi: null` (general campus context).
2. The approved `pois/` file whose `poiId` equals the snapshot's id.
3. Approved `campus/` files with `priority: 1`.
4. The other approved `pois/` files (so "what is next / elsewhere" questions
   work), each prefixed with its POI title.
5. Approved `campus/` files with `priority: 2`, then `priority: 3`.

When the pack exceeds the budget, an item that does not fit is skipped and
later, smaller items may still be added, so lower-priority content is dropped
first. If that is no longer enough, keyword retrieval replaces steps 3–5
(ADR-0016); not needed while the pack is small.

`contentVersion` = first 12 hex characters of SHA-256 over the approved files
(sorted by path, path + body). It changes whenever approved content changes and
is part of the answer-cache key, so stale answers are not served.

## Review workflow

1. Edit or fill a draft file.
2. A second team member checks every fact against a real source (site visit,
   school page, official document).
3. Set `status: approved`, `reviewedBy`, `reviewedAt`; run
   `ai-assistant/scripts/verify`.
