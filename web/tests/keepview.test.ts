// The conversation's scroll while the keyboard opens and closes, and on send (keepview.ts; Abel, Nov 18).
import { describe, expect, test } from 'bun:test'
import { FOLLOW_MS, KeepView, keptTop, topOf } from '../src/keepview'

/** A log of 3000 px of content: the browser clamps scrollTop to [0, scrollHeight - clientHeight]. */
function fakeLog(clientHeight: number, scrollTop = 0, scrollHeight = 3000) {
  let top = scrollTop
  const log = {
    clientHeight,
    scrollHeight,
    get scrollTop() { return top },
    set scrollTop(v: number) { top = Math.max(0, Math.min(v, log.scrollHeight - log.clientHeight)) },
  }
  return log
}

describe('keepview', () => {
  test('a shorter log keeps the bottom of what is seen; a taller one too, never above 0', () => {
    expect(keptTop(2400, 600, 300)).toBe(2700) // the keyboard opens: the last message stays above it
    expect(keptTop(2700, 300, 600)).toBe(2400) // it closes
    expect(keptTop(100, 300, 600)).toBe(0)
  })

  test('an element brought to the top of the log, under a small gap', () => {
    expect(topOf(1000, 250, 50)).toBe(1192)
    expect(topOf(0, 10, 50)).toBe(0)
  })

  test('the keyboard opening at the end of the conversation keeps the last message seen', () => {
    const log = fakeLog(600, 2400)
    const k = new KeepView(log)
    log.clientHeight = 300
    k.resized()
    expect(log.scrollTop).toBe(2700)
    expect(log.scrollTop + log.clientHeight).toBe(log.scrollHeight)
  })

  test('the keyboard opening mid-conversation keeps the same bottom line', () => {
    const log = fakeLog(600, 1000)
    const k = new KeepView(log)
    log.clientHeight = 300
    k.resized()
    expect(log.scrollTop + log.clientHeight).toBe(1600)
  })

  test('a send from the top of the conversation goes to its end, and stays there while the keyboard closes', () => {
    let t = 0
    const log = fakeLog(300, 0)
    const k = new KeepView(log, () => t)
    k.follow(() => log.scrollHeight)
    expect(log.scrollTop).toBe(2700)
    t = 200
    log.clientHeight = 600 // the keyboard closed
    k.resized()
    expect(log.scrollTop).toBe(2400) // the end, not 300 px above it
  })

  test('the answer: the question at the top, kept there while the keyboard closes', () => {
    let t = 0
    const log = fakeLog(300, 2700, 4000)
    let qTop = 1900 // the question's offset in the content
    const k = new KeepView(log, () => t)
    k.follow(() => topOf(0, qTop, 0))
    expect(log.scrollTop).toBe(1892)
    t = 300
    log.clientHeight = 600
    k.resized()
    expect(log.scrollTop).toBe(1892)
  })

  test('after the follow time, or once the reader scrolls, a height change keeps the bottom again', () => {
    let t = 0
    const log = fakeLog(600, 0)
    const k = new KeepView(log, () => t)
    k.follow(() => 1000)
    t = FOLLOW_MS + 1
    log.clientHeight = 300
    k.resized()
    expect(log.scrollTop).toBe(1300)
    k.follow(() => 0)
    k.release()
    log.clientHeight = 600
    k.resized()
    expect(log.scrollTop).toBe(0) // kept the bottom (300 + 300 - 600), not the target
  })

  test('the answer replaces the target of the send and restarts its time', () => {
    let t = 0
    const log = fakeLog(300, 0)
    const k = new KeepView(log, () => t)
    k.follow(() => log.scrollHeight)
    t = 1000
    k.follow(() => 500)
    t = 2000 // past the first follow's time, within the second's
    log.clientHeight = 600
    k.resized()
    expect(log.scrollTop).toBe(500)
  })

  test('a hidden log (no height) changes nothing; the same height changes nothing', () => {
    const log = fakeLog(600, 1000)
    const k = new KeepView(log)
    log.clientHeight = 0
    k.resized()
    expect(log.scrollTop).toBe(1000)
    log.clientHeight = 600
    k.resized()
    expect(log.scrollTop).toBe(1000)
    k.resized()
    expect(log.scrollTop).toBe(1000)
  })
})
