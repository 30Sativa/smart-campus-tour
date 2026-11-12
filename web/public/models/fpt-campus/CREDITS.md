# Trees and people of the FPT campus map (section 04)

- `trees/*.glb`: generated with [EZ-Tree](https://github.com/dgreenheck/ez-tree)
  by Dan Greenheck (MIT licence), presets Oak Large, Ash Large, Aspen Large and
  Ash Medium; the pink-flowering one has its leaf texture recoloured. Each has
  a `-far` twin with fewer, larger leaves and a simplified trunk. Scaled to a
  height of 1, trunk on the origin.
- `people/*.glb`: avatars from the [Microsoft Rocketbox avatar
  library](https://github.com/microsoft/Microsoft-Rocketbox) (MIT licence):
  Female_Adult_01/03/05/08/12/17, Male_Adult_01/06/08/09/10/16/17,
  Security_Male_01, Sports_Male_02/03, high-poly mesh with the colour maps
  (WebP, 1024/512 px). `rocketbox-anims.glb` holds Rocketbox walk, run, idle,
  talk and texting clips (first 9 s, body bones only) on the same skeleton.

All files are meshopt-compressed (drei's useGLTF decodes them).
