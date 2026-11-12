import { describe, expect, it } from 'vitest'
import { INTRO_CHAPTER_SECONDS, STORY_CHAPTERS, chapterStart, introChapter } from './story'

describe('intro video chapters', () => {
  it('holds each chapter for its share of the video, the last one to the end', () => {
    expect(introChapter(0)).toBe(0)
    expect(introChapter(INTRO_CHAPTER_SECONDS - 0.01)).toBe(0)
    expect(introChapter(INTRO_CHAPTER_SECONDS)).toBe(1)
    expect(introChapter(INTRO_CHAPTER_SECONDS * 4.5)).toBe(4)
    expect(introChapter(999)).toBe(STORY_CHAPTERS.length - 1)
  })

  it('treats a time the video has not reported yet as the start', () => {
    expect(introChapter(Number.NaN)).toBe(0)
    expect(introChapter(-1)).toBe(0)
  })

  it('seeks to the start of a chapter', () => {
    expect(chapterStart(0)).toBe(0)
    expect(chapterStart(2)).toBe(INTRO_CHAPTER_SECONDS * 2)
    expect(chapterStart(9)).toBe(INTRO_CHAPTER_SECONDS * 4)
    expect(introChapter(chapterStart(3))).toBe(3)
  })
})
