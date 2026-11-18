// The arrow back to the latest message (tobottom.ts): when it shows, when the dot lights, the labels.
import { describe, expect, test } from 'bun:test'
import { AT_BOTTOM_PX, atBottom, distance, isAnswerNode, nextDot, scrollBehavior, shouldShow, toBottomLabel } from '../src/tobottom'

const m = (scrollTop: number, clientHeight = 600, scrollHeight = 3000) => ({ scrollTop, clientHeight, scrollHeight })

describe('tobottom', () => {
  test('shows only when more than one screen above the end', () => {
    expect(distance(m(2400))).toBe(0)
    expect(shouldShow(m(2400))).toBe(false) // at the end
    expect(shouldShow(m(1800))).toBe(false) // exactly one screen up
    expect(shouldShow(m(1799))).toBe(true)
    expect(shouldShow(m(0))).toBe(true)
    expect(shouldShow(m(0, 600, 600))).toBe(false) // short conversation
    expect(shouldShow(m(0, 0, 3000))).toBe(false) // hidden log has no height
    expect(shouldShow(m(2500))).toBe(false) // over-scroll never goes negative
  })

  test('at the bottom with a small tolerance', () => {
    expect(atBottom(m(2400 - AT_BOTTOM_PX))).toBe(true)
    expect(atBottom(m(2400 - AT_BOTTOM_PX - 1))).toBe(false)
    expect(atBottom(m(2399.4))).toBe(true) // fractional positions
  })

  test('which added nodes are answers', () => {
    expect(isAnswerNode('msg bot')).toBe(true)
    expect(isAnswerNode('msg me')).toBe(false)
    expect(isAnswerNode('wait pending msg bot')).toBe(false)
    expect(isAnswerNode('welcome')).toBe(false)
  })

  test('the dot lights for an answer while up, stays, clears at the bottom', () => {
    const up = { away: true, answers: 1, redraw: false, bottom: false }
    expect(nextDot(false, up)).toBe(true)
    expect(nextDot(true, { ...up, answers: 0 })).toBe(true) // stays until the bottom
    expect(nextDot(false, { ...up, away: false })).toBe(false) // arrived while at the bottom
    expect(nextDot(false, { ...up, answers: 0 })).toBe(false) // a part turned (◀ ▶), nothing new
    expect(nextDot(true, { ...up, bottom: true })).toBe(false)
    expect(nextDot(false, { ...up, redraw: true })).toBe(false) // another chat opened
  })

  test('smooth unless reduced motion', () => {
    expect(scrollBehavior(false)).toBe('smooth')
    expect(scrollBehavior(true)).toBe('auto')
  })

  test('labels in the 6 languages, English for the rest', () => {
    expect(toBottomLabel('es')).toBe('Ir al final')
    expect(toBottomLabel('ar')).toBe('الانتقال إلى الأسفل')
    expect(toBottomLabel('en')).toBe('Scroll to the latest')
    for (const l of ['fr', 'id', 'hi']) expect(toBottomLabel(l).length).toBeGreaterThan(3)
    expect(new Set(['en', 'es', 'fr', 'id', 'hi', 'ar'].map(toBottomLabel)).size).toBe(6)
    expect(toBottomLabel('xx')).toBe('Scroll to the latest')
  })
})
