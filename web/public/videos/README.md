# Section 04 intro video

`robot-intro.mp4` (1920×1080, H.264 High 4.2, 6.0 MB), `robot-intro-720.mp4`
(1280×720, H.264 High 3.2, 2.8 MB, for screens up to 720 px wide),
`robot-intro.webm` (1280×720, VP9, 3.5 MB, for browsers without H.264) and the
poster `robot-intro.jpg` open the home page's section 04
(`web/src/features/landing/sections/IntroVideo.tsx`). 18 s, 60 fps, no sound;
five chapters of 3.6 s each (`INTRO_CHAPTER_SECONDS` in
`web/src/features/landing/robot-explode/story.ts`), whose text the page lays
over the video.

How they were made: the frames are the 3D scroll story that section 04 had
before the video, as of commit `a76a32f2` (`RobotPartsViewer` with its
`storyRef` and `chapter` props, `StoryFx.tsx`, `story.ts`'s shots). That code
was rendered in headless Chromium at 2560×1440 (a 1920×1080 page at device
scale 1.333, so the frames are downscaled for clean thin lines), frame by
frame with `advance()` from `@react-three/fiber` at 60 fps (story progress
growing linearly over the 18 s), then encoded with ffmpeg:

```
FADE="fade=t=out:st=17.1:d=0.9:color=0x101b23"
ffmpeg -framerate 60 -i f%04d.jpg -vf "scale=1920:1080:flags=lanczos,$FADE,format=yuv420p" \
  -c:v libx264 -preset slow -crf 25 -tune animation -aq-mode 3 -profile:v high -level:v 4.2 \
  -movflags +faststart -an robot-intro.mp4
# robot-intro-720.mp4: scale=1280:720 and -level:v 3.2, otherwise the same
# robot-intro.webm: scale=1280:720, -c:v libvpx-vp9 -crf 38 -b:v 0 -deadline good -cpu-used 3 -row-mt 1
```

The last 0.9 s fade to `#101b23`, the background of the parts stage that
replaces the video. When changing the codec settings, keep the `codecs`
strings on the `<source>` elements in `IntroVideo.tsx` in step with the
files' profile and level. To change the video itself, check out that commit,
render the story again and encode it the same way.
