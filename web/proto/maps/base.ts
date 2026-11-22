// Baseline: the shared code only (data decode, layout, labels, gestures, page). Variant size = its bundle - this one.
import { mount } from './common'
mount('base', async () => ({ panBy() {}, zoomAt() {}, commit() {}, frame() {}, settle: async () => {} }))
