/**
 * The real-looking trees and people of the FPT campus map: which model file
 * each is, and who or what goes where. The files are under
 * public/models/fpt-campus (see its CREDITS.md): trees generated with EZ-Tree
 * (MIT), people and their animations from Microsoft Rocketbox (MIT).
 */
import { useGLTF } from '@react-three/drei'
import { GUARD, PITCH, WALK_PATHS, type TreeKind } from './fpt-campus'

const BASE = `${import.meta.env.BASE_URL}models/fpt-campus/`

/** Tree models: three shade trees and one in pink bloom, each with a lighter twin for the distance. */
export const TREE_SPECIES = ['shade-a', 'shade-b', 'shade-c', 'flower-a'] as const
export const treeUrl = (name: (typeof TREE_SPECIES)[number], far: boolean) => `${BASE}trees/${name}${far ? '-far' : ''}.glb`
/** Beyond this distance from the camera, m, a tree is drawn from its lighter twin (and casts no shadow). */
export const TREE_FAR = 34
/** How tall each species stands for a tree of a given height in the plan (the slender one is taller). */
export const SPECIES_HEIGHT = [1.2, 1.25, 1.35, 1.15] as const

/**
 * Which species stands where: the tall slender one along the street and
 * round the outside of the campus road, broad ones over the parking and in
 * the courtyard, the flowering one where the plan wants flowers.
 */
export function treeSpecies(tree: { x: number; y: number; kind: TreeKind }, index: number) {
  if (tree.kind === 'flower') return 3
  if (tree.y < -62 || tree.y > 52 || Math.abs(tree.x) > 90) return 2
  return index % 2
}

export const CASUAL = [
  'female-adult-01', 'male-adult-09', 'female-adult-03', 'male-adult-06', 'female-adult-05', 'male-adult-10', 'female-adult-08',
  'male-adult-01', 'female-adult-12', 'male-adult-16', 'female-adult-17', 'male-adult-08', 'male-adult-17',
] as const
export const PLAYERS = ['sports-male-02', 'sports-male-03'] as const
export const GUARD_AVATAR = 'security-male-01'
export const AVATARS = [...CASUAL, ...PLAYERS, GUARD_AVATAR] as const
export type Avatar = (typeof AVATARS)[number]
export const avatarUrl = (name: Avatar) => `${BASE}people/${name}.glb`
export const ANIMATIONS_URL = `${BASE}people/rocketbox-anims.glb`

/** Walking pace of the walk and run clips, m/s, to match the feet to the ground. */
export const CLIP_PACE = { walk: 1.25, run: 2.9 } as const

const PITCH_PATH = WALK_PATHS.findIndex(path => path.points.every(p => p.x > PITCH.minX && p.x < PITCH.maxX && p.y > PITCH.minY && p.y < PITCH.maxY))

/**
 * Who each person of the crowd is and what they do: players running on the
 * pitch, the guard at the gate, everyone else in everyday clothes, walking or
 * (standing about) talking, texting or waiting.
 */
export function castPerson(person: { path: number; x: number; y: number }, index: number) {
  if (person.path >= 0 && person.path === PITCH_PATH) return { avatar: PLAYERS[index % PLAYERS.length] as Avatar, clip: 'm_run_slow_01', pace: CLIP_PACE.run }
  if (person.path < 0 && Math.hypot(person.x - GUARD.x, person.y - GUARD.y) < 1.5) return { avatar: GUARD_AVATAR as Avatar, clip: 'm_idle_neutral_01', pace: 0 }
  const avatar = CASUAL[(index * 7 + 3) % CASUAL.length] as Avatar
  const g = avatar.startsWith('female') ? 'f' : 'm'
  if (person.path >= 0) return { avatar, clip: `${g}_walk_neutral_01`, pace: CLIP_PACE.walk }
  const stand = ['gestic_talk_neutral_01', 'cell_phone_textmessage', 'idle_neutral_01'][index % 3]
  return { avatar, clip: `${g}_${stand}`, pace: 0 }
}

/** Starts fetching every file at once, rather than one group after another as each suspends. */
export function preloadCampusAssets() {
  for (const name of TREE_SPECIES) for (const far of [false, true]) useGLTF.preload(treeUrl(name, far), false, true)
  for (const name of AVATARS) useGLTF.preload(avatarUrl(name), false, true)
  useGLTF.preload(ANIMATIONS_URL, false, true)
}
