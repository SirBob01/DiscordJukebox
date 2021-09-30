const voice = require('@discordjs/voice')
const ytdl = require('youtube-dl-exec')

/**
 * Convert a Youtube video into an audio resource
 */
exports.convertYoutube = (url) => {
  return new Promise((resolve, reject) => {
    const process = ytdl.raw(
      url,
      {
        o: '-',
        q: '',
        f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
        r: '100K'
      },
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const stream = process.stdout
    if (!stream) {
      reject(new Error('Failed to create a streamable resource.'))
    }
    process.once('spawn', async () => {
      const probe = await voice.demuxProbe(stream)
      const resource = voice.createAudioResource(probe.stream, {
        inputType: probe.type
      })
      resolve(resource)
    })
  })
}

/**
 * Enum flags that describe the source of a track
 */
exports.sources = {
  YOUTUBE: 0,
  SPOTIFY: 1,
  SOUNDCLOUD: 2
}
