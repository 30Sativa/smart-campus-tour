/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

type ModuleGraph = { getModuleInfo(id: string): { code: string | null; importedIds: readonly string[]; importers: readonly string[]; dynamicImporters: readonly string[] } | null }
// A data file such as the 1.6 MB patrol map is never worth loading just because a page shares a helper with it.
const MAX_LIGHT_MODULE_BYTES = 50_000

// Libraries every console already loads through the vendor groups below (plus zustand, a few KB).
const LIGHT_LIBRARY = /node_modules[\\/](lucide-react|react|react-dom|react-router|scheduler|@tanstack|zustand|cookie|set-cookie-parser)[\\/]/
// The first-load entry, the public and Student areas, and anything they import are never moved into a console chunk.
const NOT_CONSOLE = /[\\/]src[\\/](main\.tsx|app[\\/]|api[\\/]|stores[\\/]|auth[\\/]|features[\\/](student|quest-stream|landing)[\\/]|routes[\\/](public|student)[\\/])/
// A console page or shell, and the role area it belongs to.
const ROLE_ROOT = /[\\/]src[\\/](?:routes[\\/](admin|representative|staff|technical)[\\/]|features[\\/](administration|representative|staff|technical)[\\/]\w+Shell\.tsx$)/

/**
 * Small app modules shared by several console pages are merged into one chunk per set of role areas that use them
 * (for example 'console-admin-staff'), instead of one file each. So a role only ever downloads code its own pages
 * use, as before. A module is moved only when it and everything it imports are app code or the libraries above
 * and none is a large data file, so no chunk drags in three.js or map data. Shells and pages are lazily imported
 * and keep their own chunk, so every route area stays lazy.
 */
function consoleChunkName() {
  const light = new Map<string, boolean>()
  const isLight = (id: string, graph: ModuleGraph): boolean => {
    if (id.includes('node_modules')) return LIGHT_LIBRARY.test(id)
    const known = light.get(id)
    if (known !== undefined) return known
    light.set(id, true) // a cycle back to this module adds nothing heavy
    const info = graph.getModuleInfo(id)
    const result = (info?.code?.length ?? 0) <= MAX_LIGHT_MODULE_BYTES && (info?.importedIds ?? []).every(next => isLight(next, graph))
    light.set(id, result)
    return result
  }
  const outside = new Map<string, boolean>()
  const usedOutsideConsoles = (id: string, graph: ModuleGraph): boolean => {
    if (NOT_CONSOLE.test(id)) return true
    const known = outside.get(id)
    if (known !== undefined) return known
    outside.set(id, false)
    const result = (graph.getModuleInfo(id)?.importers ?? []).some(next => usedOutsideConsoles(next, graph))
    outside.set(id, result)
    return result
  }
  const areas = new Map<string, Set<string>>()
  const usedByAreas = (id: string, graph: ModuleGraph): Set<string> => {
    const root = ROLE_ROOT.exec(id)
    if (root) return new Set([root[1] ?? (root[2] === 'administration' ? 'admin' : root[2])])
    const known = areas.get(id)
    if (known) return known
    const result = new Set<string>()
    areas.set(id, result) // filled in place; a cycle sees the areas found so far
    for (const next of graph.getModuleInfo(id)?.importers ?? []) for (const area of usedByAreas(next, graph)) result.add(area)
    return result
  }
  return (id: string, graph: ModuleGraph) => {
    if (id.includes('node_modules') || !/[\\/]src[\\/]/.test(id) || /\.css($|\?)/.test(id)) return null
    if (usedOutsideConsoles(id, graph) || graph.getModuleInfo(id)?.dynamicImporters.length || !isLight(id, graph)) return null
    const used = [...usedByAreas(id, graph)].sort()
    return used.length ? 'console-' + used.join('-') : null
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Optional trusted local certificate for invitation email/browser tests.
  server: process.env.LOCAL_HTTPS_PFX ? {
    https: { pfx: readFileSync(process.env.LOCAL_HTTPS_PFX), passphrase: process.env.LOCAL_HTTPS_PASSWORD },
  } : undefined,
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Without these groups every lucide icon, React piece and TanStack hook became its own tiny shared chunk,
        // so a signed-in area opened 60+ JS files on first load. Route areas stay lazy-loaded (web/AGENTS.md §1).
        codeSplitting: {
          groups: [
            { name: 'vendor-icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 30 },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 20 },
            { name: 'vendor-query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 10 },
            { name: consoleChunkName(), priority: 5, minShareCount: 2, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // A cold Vite transform on Windows/OneDrive can block the event loop while
    // lazy admin/chart chunks compile. Keep behavioral query timeouts unchanged,
    // but do not terminate the whole test while that transform is in flight.
    testTimeout: 30_000,
    maxWorkers: 3,
  },
})
