const voice = require('@discordjs/voice')
const ytdl = require('youtube-dl-exec')
const ytdlCore = require('ytdl-core')
const spotify = require('spotify-url-info')
const search = require('./search')

/**
 * Generic class that represents a single track in the queue
 */
class Track {
  constructor (url, title, duration, thumbnail) {
    this.url = url
    this.title = title
    this.duration = duration
    this.thumbnail = thumbnail
    this.startTime = null
    this.rawSpotifyMeta = null
  }

  /**
   * Calculate a similarity score to determine if a result is a match
   */
  score (item) {
    // If "lyrics" is in the title, score higher. This is usually the actual song
    const lyrics = (item.title.toLowerCase().search('lyrics') > -1) ? 1 : 0
    const duration = 1 - Math.abs(item.duration.seconds - this.duration) / this.duration
    return lyrics * 0.5 + duration * 0.5
  }

  /**
   * Match a Spotify track to a Youtube video
   */
  async matchSpotify () {
    // Search based on the title and artists of the track
    const query = `${this.rawSpotifyMeta.name} ${this.rawSpotifyMeta.artists.map(a => a.name).join(' ')}`
    const results = await search.byKeyword(query)

    const mapped = {}
    results.forEach(item => {
      mapped[`${item.title} ${item.channelTitle}`] = item
    })

    const keys = Object.keys(mapped)
    keys.sort((a, b) => {
      const score1 = this.score(mapped[a])
      const score2 = this.score(mapped[b])

      if (score1 < score2) {
        return 1
      } else if (score1 > score2) {
        return -1
      }
      return 0
    })

    let i = 0
    let bestMatch = null
    while (bestMatch == null && i < keys.length) {
      try {
        await ytdlCore.getInfo(mapped[keys[i]].link)
        bestMatch = mapped[keys[i]]
      } catch (error) {
        i++
      }
    }

    if (bestMatch != null) {
      this.url = bestMatch.link
      this.duration = bestMatch.duration.seconds
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
        this.startTime = (new Date()).getTime()
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
    meta.videoDetails.thumbnails[1].url
  )
}

/**
 * Create a new track from a Youtube keyword search
 */
const fromYoutubeSearch = async (query) => {
  const results = await search.byKeyword(query)
  let i = 0
  let result = null
  let meta = null
  while (result == null && i < results.length) {
    try {
      result = results[i]
      meta = await ytdlCore.getInfo(result.link)
    } catch (error) {
      i++
    }
  }
  if (result != null) {
    return new Track(
      meta.videoDetails.video_url,
      meta.videoDetails.title,
      meta.videoDetails.lengthSeconds,
      meta.videoDetails.thumbnails[1].url
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
        t.track.album.images[0].url
      )
      track.rawSpotifyMeta = t.track
      tracks.push(track)
    }
    return tracks
  } else if (data.type == 'track') {
    // Single track
    const track = new Track(
      data.href,
      data.name,
      Math.floor(data.duration_ms / 1000),
      data.album.images[0].url
    )
    track.rawSpotifyMeta = data
    tracks.push(track)
    return tracks
  }
  throw new Error('Not a valid spotify playlist URL')
}

exports.fromYoutubeURL = fromYoutubeURL
exports.fromSpotifyURL = fromSpotifyURL
exports.fromYoutubeSearch = fromYoutubeSearch
