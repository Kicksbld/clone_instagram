import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { MediaFailureReason } from '@clone/db';

import sharp from 'sharp';

const execute = promisify(execFile);
export class InvalidVideo extends Error {
  constructor(readonly reason: MediaFailureReason) {
    super(reason);
  }
}
/** One deadline shared by probing and all renders; no shell interpolation. */
export async function renderVideo(
  original: Buffer,
  directory: string,
  deadline: number,
  signal?: AbortSignal,
) {
  if (original.length > 50 * 1024 * 1024) throw new InvalidVideo('file_too_large');
  const source = join(directory, 'source.mp4');
  await writeFile(source, original);
  const run = async (command: string, args: string[]) => {
    try {
      return await execute(command, args, {
        timeout: Math.max(1, deadline - Date.now()),
        maxBuffer: 4 * 1024 * 1024,
        ...(signal && { signal }),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'stderr' in error &&
        typeof error.stderr === 'string' &&
        /Error while decoding|Invalid data found|Invalid NAL|decode_slice_header|Error submitting packet/i.test(
          error.stderr,
        )
      ) {
        throw new InvalidVideo('invalid_video');
      }
      throw error;
    }
  };
  let probe: {
    streams: {
      codec_type?: string;
      width?: number;
      height?: number;
      duration?: string;
      side_data_list?: { rotation?: number }[];
    }[];
    format?: { duration?: string };
  };
  try {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      source,
    ]);
    probe = JSON.parse(stdout) as typeof probe;
  } catch (error) {
    // A missing binary or exhausted deadline is an infrastructure failure, eligible for retry.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw error;
    if (Date.now() >= deadline || signal?.aborted) throw error;
    throw new InvalidVideo('invalid_video');
  }
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const duration = Number(probe.format?.duration ?? video?.duration);
  if (!video?.width || !video.height || !Number.isFinite(duration) || duration <= 0)
    throw new InvalidVideo('invalid_video');
  if (duration > 60.5) throw new InvalidVideo('video_too_long');
  const rotated =
    Math.abs(video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? 0) %
      180 ===
    90;
  const width = rotated ? video.height : video.width;
  const height = rotated ? video.width : video.height;
  const hls = join(directory, 'hls');
  await mkdir(hls);
  const entries: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const side of [360, 720]) {
    const scale = Math.min(1, side / Math.min(width, height));
    const w = Math.max(2, Math.floor((width * scale) / 2) * 2);
    const h = Math.max(2, Math.floor((height * scale) / 2) * 2);
    const output = join(hls, String(side));
    await mkdir(output);
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-xerror',
      '-i',
      source,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      `scale=${w}:${h},setsar=1`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '2',
      '-crf',
      '23',
      '-force_key_frames',
      'expr:gte(t,n_forced*4)',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-f',
      'hls',
      '-hls_time',
      '4',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      join(output, 'segment-%03d.ts'),
      join(output, 'index.m3u8'),
    ]);
    entries.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${side === 360 ? 1000000 : 4000000},RESOLUTION=${w}x${h}`,
      `${side}/index.m3u8`,
    );
  }
  await writeFile(join(hls, 'master.m3u8'), entries.join('\n') + '\n');
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(Math.min(1, duration / 2)),
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    "scale='min(640,iw)':-2",
    '-map_metadata',
    '-1',
    join(directory, 'thumbnail.png'),
  ]);
  const files: { path: string; data: Buffer; contentType: string }[] = [];
  async function collect(folder: string, prefix: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await collect(join(folder, entry.name), `${path}/`);
      else
        files.push({
          path,
          data: await readFile(join(folder, entry.name)),
          contentType: entry.name.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/mp2t',
        });
    }
  }
  await collect(hls, 'hls/');
  files.push({
    path: 'thumbnail.webp',
    data: await sharp(await readFile(join(directory, 'thumbnail.png')))
      .webp()
      .toBuffer(),
    contentType: 'image/webp',
  });
  return { width, height, durationMs: Math.round(duration * 1000), files };
}
