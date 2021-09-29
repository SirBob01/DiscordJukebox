const { sources, convertYoutube } = require('./sources')

/**
 * Generic class that represents a single track in the queue
 */
class Track {
  constructor (url, title, duration, source) {
    this.url = url
    this.title = title
    this.duration = duration
    this.source = source
  }

  getResource () {
    if (this.source == sources.YOUTUBE) {
      return convertYoutube(this.url)
    }
  }
}

exports.Track = Track
