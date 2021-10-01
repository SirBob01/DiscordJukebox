const voice = require('@discordjs/voice')
const ytdl = require('youtube-dl-exec')
const ytdlCore = require('ytdl-core')
const ytsearch = require('youtube-search-api')
const spotify = require('spotify-url-info')

/**
 * Generic class that represents a single track in the queue
 */
class Track {
  constructor (url, title, duration, rawSpotifyMeta) {
    this.url = url
    this.title = title
    this.duration = duration
    this.rawSpotifyMeta = rawSpotifyMeta
  }

  /**
   * Algorithm for matching a Spotify track to a Youtube video
   */
  async matchSpotify () {
    // Search based on the title and artists of the track
    const query = `${this.rawSpotifyMeta.name} ${this.rawSpotifyMeta.artists.map(a => a.name).join(' ')}`
    const results = await ytsearch.GetListByKeyword(query)

    // Select the result with the closest duration (most likely candidate for match)
    // No need to look past the first page, those would probably be poor matches
    const bestMatch = results.items[0]
    if (bestMatch != null) {
      this.url = `https://www.youtube.com/watch?v=${bestMatch.id}`
    } else {
      this.url = null
    }
  }

  /**
   * Fetch the streamable resource needed by Discord to play audio
   */
  getResource () {
    return new Promise(async (resolve, reject) => {
      if (this.rawSpotifyMeta != null) {
        await this.matchSpotify()
        if (this.url == null) {
          reject(new Error('Failed to find audio for this track'))
          return
        }
        this.rawSpotifyMeta = null
      }

      const process = ytdl.raw(
        this.url,
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
        return
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
}

/**
 * Create a new track from a Youtube URL
 */
const fromYoutubeURL = async (url) => {
  const meta = await ytdlCore.getInfo(url)
  return new Track(
    meta.videoDetails.video_url,
    meta.videoDetails.title,
    meta.videoDetails.lengthSeconds,
    null
  )
}

/**
 * Create a new track from a Youtube keyword search
 */
const fromYoutubeSearch = async (query) => {
  const results = await ytsearch.GetListByKeyword(query)
  if (results.items.length > 0) {
    const meta = await ytdlCore.getInfo(`https://www.youtube.com/watch?v=${results.items[0].id}`)
    return new Track(
      meta.videoDetails.video_url,
      meta.videoDetails.title,
      meta.videoDetails.lengthSeconds,
      null
    )
  }
  return null
}

/**
 * Create a list of new tracks from a Spotify URL
 * It can either read a single track or a playlist (multiple tracks)
 */
const fromSpotifyURL = async (url) => {
  const data = await spotify.getData(url)
  const tracks = []
  if (data.type == 'playlist') {
    // List of tracks
    const rawTracks = data.tracks.items
    for (const t of rawTracks) {
      const track = new Track(
        t.track.href,
        t.track.name,
        Math.floor(t.track.duration_ms / 1000),
        JSON.parse(JSON.stringify(t.track))
      )
      tracks.push(track)
    }
    return tracks
  } else if (data.type == 'track') {
    // Single track
    const track = new Track(
      data.href,
      data.name,
      Math.floor(data.duration_ms / 1000),
      JSON.parse(JSON.stringify(data))
    )
    tracks.push(track)
    return tracks
  }
  throw new Error('Not a valid spotify playlist URL')
}

exports.fromYoutubeURL = fromYoutubeURL
exports.fromSpotifyURL = fromSpotifyURL
exports.fromYoutubeSearch = fromYoutubeSearch
