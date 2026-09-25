/**
 * Where the Quest 3 live stream is served (robot/quest-stream on the robot
 * NUC), e.g. `http://10.80.192.207:8080/hls/quest.m3u8`.
 *
 * Unset = no Quest stream: the pages keep their current video source. Read the
 * env var here only; components import this constant.
 */
export const QUEST_STREAM_URL: string | null = import.meta.env.VITE_QUEST_STREAM_URL?.trim() || null
