# Section 04 intro video

`robot-intro.mp4` (1920×1080, H.264), `robot-intro-720.mp4` (1280×720, for
screens up to 720 px wide), `robot-intro.webm` (1280×720, VP9, for browsers
without H.264) and the poster `robot-intro.jpg` open the home page's section
04 (`web/src/features/landing/sections/IntroVideo.tsx`). 18 s, 30 fps, no
sound; five chapters of 3.6 s each (`INTRO_CHAPTER_SECONDS` in
`web/src/features/landing/robot-explode/story.ts`), whose text the page lays
over the video.

How they were made: the frames are the 3D scroll story that section 04 had
before the video, as of commit `a76a32f2` (`RobotPartsViewer` with its
`storyRef` and `chapter` props, `StoryFx.tsx`, `story.ts`'s shots). That code
was rendered at 1920×1080 in headless Chromium, frame by frame with
`advance()` from `@react-three/fiber` (story progress growing linearly over the
18 s), then encoded with ffmpeg:

```
ffmpeg -framerate 30 -i f%04d.jpg -vf "fade=t=out:st=17.1:d=0.9:color=0x101b23,format=yuv420p" \
  -c:v libx264 -preset veryfast -crf 31 -profile:v high -movflags +faststart -an robot-intro.mp4
# robot-intro-720.mp4: the same with scale=1280:720:flags=lanczos first
# robot-intro.webm: scaled the same, -c:v libvpx-vp9 -crf 40 -b:v 0 -deadline good -cpu-used 4 -row-mt 1
```

The last 0.9 s fade to `#101b23`, the background of the parts stage that
replaces the video. To change the video, check out that commit, render the
story again and encode it the same way.
