# Student Tour workspace

The 2026-11-05 user request synchronizes the invited Student experience with
the approved Representative workspace. Use the existing forest/lime palette,
Be Vietnam Pro, 1240px capped container, 24px gaps, 14px panel radius and 8px
control radius. `tokens.css` imports the Representative palette and maps it to
Student roles. Dark mode follows the existing theme store.

Keep the compact top bar, matching card surfaces and restrained status colours.
The live screen leads with a full-width journey above the video and its controls,
then the current stop summary. Current, completed and future stops have labelled
states. A single sibling panel contains narration, AI and route tabs.
Tabs stay mounted to preserve questions and conversations. At small widths the
panels stack and controls remain reachable. The journey is a compact strip,
roughly 80–100px high on desktop and no more than about 120px on phones.
Stop numbers and names share one line; the stop list scrolls horizontally.
Full names and status text remain in the DOM for assistive technology, with
the current stop marked by `aria-current`. Map capability gates stay unchanged.

The follow-up revision adds restrained detail: a forest rule on the journey,
an active-stop marker, a labelled progress figure and a current-stop status tag.
Primary buttons lift slightly on hover and depress on press; secondary controls
change colour and compress on press. The selected tab background slides using
transform. Focus rings stay immediate and reduced-motion disables transitions.

Entry, session loading/error, waiting, live, completed and cancelled states use
the same system. The waiting room balances its countdown/session panel with
audio checks and stop previews. No new stock imagery or fabricated statistics.
The access-code screen pairs a campus discovery introduction and the existing
robot/campus poster with the invitation form. Three short feature labels explain
the existing robot, narration and AI experience. The form keeps its code field,
errors, retry and join behavior. Smaller screens stack the introduction and form.
The existing video poster remains a poster, and unavailable/degraded video keeps
its actual status and recovery controls. Map visibility remains capability-led.

Preserve all endpoints, handlers, cookie isolation, polling, invitation rules,
shared-screen privacy notices and real AI behavior. This change only presents
existing data and controls. Existing fallback status copy remains verbatim;
other copy changes only replace separator punctuation, shorten the audio-test
button and use a typographic ellipsis. The reduced-motion preference also applies
to chat scrolling, which stays inside the messages instead of moving the whole
page. Functional tests cover keyboard tabs and draft retention.
