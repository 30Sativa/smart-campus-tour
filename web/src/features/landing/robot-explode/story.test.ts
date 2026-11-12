import { describe, expect, it } from 'vitest'
import { STORY_CHAPTERS, storyLook, storyPhase, storyProgress, storyShot } from './story'

describe('section 04 scroll story', () => {
  it('plays over all but the last screen of scrolling', () => {
    expect(storyProgress(0)).toBe(0)
    expect(storyProgress(STORY_CHAPTERS.length / (STORY_CHAPTERS.length + 1))).toBeCloseTo(1)
    expect(storyProgress(1)).toBe(1)
    expect(storyProgress(-0.2)).toBe(0)
  })

  it('walks through the five chapters, then hands over to the drive', () => {
    expect(storyPhase(0)).toEqual({ index: 0, local: 0 })
    expect(storyPhase(0.3).index).toBe(1)
    expect(storyPhase(0.999).index).toBe(4)
    expect(storyPhase(1).index).toBe(STORY_CHAPTERS.length)
  })

  it('drives in the first chapters, then parks, scans, turns digital, and shows the tunnel and the chip in order', () => {
    expect(storyLook(0.1)).toMatchObject({ parked: false, scan: null, xray: 0, digital: 0, tunnel: 0, converge: 0 })
    expect(storyLook(0.3).scan).toBeGreaterThan(0)
    // The scan passes over the real robot before it turns to x-ray.
    expect(storyLook(0.3).xray).toBe(0)
    expect(storyLook(0.5)).toMatchObject({ parked: true })
    expect(storyLook(0.5).xray).toBeGreaterThan(0.9)
    expect(storyLook(0.5).digital).toBeGreaterThan(0.9)
    expect(storyLook(0.7).tunnel).toBeGreaterThan(0.9)
    expect(storyLook(0.95).converge).toBeGreaterThan(0.9)
    // Over: the plain map again.
    expect(storyLook(1)).toMatchObject({ parked: false, scan: null, xray: 0, digital: 0, tunnel: 0, converge: 0 })
  })

  it('sets the robot apart from the campus from the first chapter, and lets the campus back once the story is over', () => {
    expect(storyLook(0).stage).toBeGreaterThan(0.5)
    expect(storyLook(0.2).stage).toBe(1)
    expect(storyLook(1).stage).toBe(0)
  })

  it('keeps the opening shots close to the robot, the camera low', () => {
    for (let story = 0; story < 0.33; story += 0.01) {
      const { eye } = storyShot(story)
      expect(Math.hypot(eye.forward, eye.side)).toBeLessThan(4.7)
      expect(eye.h).toBeLessThan(1.2)
    }
  })

  it('moves the camera smoothly from shot to shot', () => {
    let previous = storyShot(0)
    for (let story = 0.004; story < 1; story += 0.004) {
      const shot = storyShot(story)
      const jump = Math.hypot(shot.eye.forward - previous.eye.forward, shot.eye.side - previous.eye.side, shot.eye.h - previous.eye.h)
      // No cut: at most a metre and a half per 0.4 % of the story (the tunnel flies fast).
      expect(jump).toBeLessThan(1.5)
      previous = shot
    }
  })
})
