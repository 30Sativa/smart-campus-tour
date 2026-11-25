# Preview review

Review performed in-thread, per Codex harness. Preview only; production source unchanged.

The original makes every step title visible, which is better for scanning the whole sequence. The proposed layout prioritizes the chosen 3D focus and the active explanation. Other step titles remain available through accessible numbered buttons and native title tooltips.

Retained: public navigation/footer destinations, all five functions and all 19 steps, source signal metadata, real GLB viewer, rotation, zoom, technical disclosure.

Resolved: large intro pushes model below fold; duplicate step indicators; wrapped laptop navigation; low contrast footer brand suffix; paused WebGL blank after resize; static model fallback on load error.

Validation: preview ESLint, standalone strict TypeScript check, Vite preview build and browser smoke pass. Smoke covers 19 steps, 320–1920px widths, URL restoration, keyboard tabs, zoom/reset, pause, dark mode, mobile menu and error fallback. No runtime page errors in smoke. Full application verify was not run for this separate preview.

Hallmark render: 0 FAIL, 3 waived footer wrapping findings. F4 warning reviewed: selected tab underline and selected step fill are selection states; Bước tiếp is the only primary action. Build carries a bundle size advisory for the existing 3D dependencies.

No stand-in materials or invented figures. Existing robot data is reused without factual changes.
