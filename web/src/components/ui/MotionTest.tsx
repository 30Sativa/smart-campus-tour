import { motion } from 'motion/react'

/** Smoke test for the `motion` package. Not an animation system. */
export function MotionTest() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-xl bg-white px-4 py-3 font-medium text-slate-900 shadow-lg"
    >
      Digital Twin Online
    </motion.div>
  )
}
