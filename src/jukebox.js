const discord = require('discord.js')
const voice = require('@discordjs/voice')

const {
  fromSpotifyURL,
  fromYoutubeURL,
  fromYoutubeSearch
} = require('./track')

/**
 * Maintains the state of a music queue and manipulates audio behavior
 */
class Jukebox {
  constructor () {
    this.audioPlayer = voice.createAudioPlayer()
    this.voiceConnection = null
    this.currentChannel = null

    this.musicQueue = []
    this.currentTrack = 0
    this.loopTrack = false
    this.loopQueue = false

    this.audioPlayer.on('stateChange', (oldState, newState) => {
      if (oldState.status == voice.AudioPlayerStatus.Playing && newState.status == voice.AudioPlayerStatus.Idle) {
        if (!this.loopTrack) {
          this.currentTrack++
        }
        if (this.currentTrack >= this.musicQueue.length) {
          this.currentTrack = 0
          if (!this.loopQueue) {
            this.musicQueue = []
          }
        }
        this.playback()
      }
    })
  }

  /**
   * Clear the queue
   */
  clear (message, params) {
    this.audioPlayer.stop(true)
    this.musicQueue = []
    this.currentTrack = 0
    message.channel.send('Queue is now empty.')
  }

  /**
   * Skip the current track
   */
  skip (message, params) {
    this.audioPlayer.stop(true)
    this.queue(message)
  }

  /**
   * Enqueue a new music track
   */
  async play (message, params) {
    if (!message.member.voice.channel) {
      message.channel.send('You must be in a voice channel to queue tracks.')
      return
    }
    if (params.length == 0) {
      message.channel.send('Please enter a search query or URL of the track to play')
      return
    }

    // Join whichever voice channel the sender is currently in
    if (this.currentChannel != message.member.voice.channel || this.voiceConnection == null) {
      this.currentChannel = message.member.voice.channel
      if (this.voiceConnection != null) this.voiceConnection.destroy()
      this.voiceConnection = voice.joinVoiceChannel({
        channelId: this.currentChannel.id,
        guildId: this.currentChannel.guild.id,
        adapterCreator: this.currentChannel.guild.voiceAdapterCreator
      })
      this.voiceConnection.subscribe(this.audioPlayer)
    }

    // Queue the music
    const url = params[0]
    try {
      const track = await fromYoutubeURL(url)
      this.musicQueue.push(track)
      this.queue(message)
    } catch (error) {
      try {
        // Spotify URL
        const tracks = await fromSpotifyURL(url)
        this.musicQueue.push(...tracks)
        this.queue(message)
      } catch (error) {
        // URL query failed, perform a manual search
        const query = params.join(' ')
        const track = await fromYoutubeSearch(query)
        if (track != null) {
          this.musicQueue.push(track)
          this.queue(message)
        } else {
          message.channel.send('No matching search.')
        }
      }
    }
    this.playback()
  }

  /**
   * Toggle looping the current track
   */
  loop (message, params) {
    if (this.musicQueue.length == 0) {
      message.channel.send('Nothing is currently playing.')
      return
    }

    this.loopTrack = !this.loopTrack
    if (this.loopTrack) {
      message.channel.send(`'${this.musicQueue[0].title}' is now looping.`)
    } else {
      message.channel.send(`'${this.musicQueue[0].title}' is no longer looping.`)
    }
  }

  /**
   * God can't do all the work.
   */
  penis (message, params) {
    this.play(message, ['https://youtu.be/1t8iu2PFWj4'])
  }

  /**
   * Toggle looping the entire queue
   */
  loopall (message, params) {
    this.loopQueue = !this.loopQueue
    if (this.loopQueue) {
      message.channel.send('Now looping the entire queue.')
    } else {
      message.channel.send('No longer looping the entire queue.')
    }
  }

  /**
   * Disconnect the bot from the channel
   */
  kick (message, params) {
    if (this.voiceConnection != null) {
      this.audioPlayer.stop()
      this.voiceConnection.destroy()
      this.voiceConnection = null
      this.musicQueue = []
      this.currentTrack = 0
    }
  }

  /**
   * Pause the current track
   */
  stop (message, params) {
    if (this.musicQueue.length == 0) {
      message.channel.send('Nothing is currently playing.')
      return
    }
    this.audioPlayer.pause()
    message.channel.send(`'${this.musicQueue[0].title}' is paused.`)
  }

  /**
   * Resume the current track
   */
  resume (message, params) {
    if (this.musicQueue.length == 0) {
      message.channel.send('Nothing is currently playing.')
      return
    }
    this.audioPlayer.unpause()
    message.channel.send(`'${this.musicQueue[0].title}' is resumed.`)
  }

  /**
   * List out all the items in the queue
   */
  queue (message, params) {
    const rows = []
    for (let i = 0; i < this.musicQueue.length; i++) {
      const track = this.musicQueue[i]
      let minutes = Math.floor(track.duration / 60)
      let seconds = track.duration % 60

      if (minutes < 10) minutes = `0${minutes}`
      if (seconds < 10) seconds = `0${seconds}`
      if (i == this.currentTrack) {
        rows.push({ name: `${i + 1}. ${track.title} (Now Playing)`, value: `Duration ${minutes}:${seconds}` })
      } else {
        rows.push({ name: `${i + 1}. ${track.title}`, value: `Duration ${minutes}:${seconds}` })
      }
    }
    const embed = new discord.MessageEmbed()
      .setColor('#0099ff')
      .setTitle('Record Queue')
      .setDescription(`${this.musicQueue.length} track(s) in the queue`)
      .addFields(...rows)
    message.channel.send({ embeds: [embed] })
  }

  /**
   * Fetch information about the current track
   */
  now (message, params) {
    if (this.musicQueue.length == 0) {
      message.channel.send('Nothing is currently playing.')
      return
    }
    const current = this.musicQueue[this.currentTrack]

    let minutes = Math.floor(current.duration / 60)
    let seconds = current.duration % 60

    if (minutes < 10) minutes = `0${minutes}`
    if (seconds < 10) seconds = `0${seconds}`
    const duration = `${minutes}:${seconds}`

    const embed = new discord.MessageEmbed()
      .setColor('#0099ff')
      .setTitle(`${current.title} is now playing`)
      .setURL(current.url)
      .setDescription(`Position ${this.currentTrack + 1}/${this.musicQueue.length} | Duration ${duration}`)
    message.channel.send({ embeds: [embed] })
  }

  /**
   * Remove a track from the queue by position index
   */
  remove (message, params) {
    const index = parseInt(params[0], 10) - 1
    const skip = index == this.currentTrack
    if (Number.isNaN(index) || index < 0 || index >= this.musicQueue.length) {
      message.channel.send('Not a valid position')
      return
    }

    this.musicQueue.splice(index, 1)
    if (index <= this.currentTrack) {
      this.currentTrack--
    }
    if (skip) {
      this.audioPlayer.stop(true)
    }
    this.queue(message)
  }

  /**
   * Shuffle the queue
   */
  shuffle (message, params) {
    const head = this.musicQueue.slice(0, this.currentTrack)
    const current = [this.musicQueue[this.currentTrack]]
    const tail = this.musicQueue.slice(this.currentTrack + 1)

    // Shuffle all the tracks around the current one
    const toShuffle = head.concat(tail)
    for (let i = toShuffle.length - 1; i > 0; i--) {
      const randIndex = Math.floor(Math.random() * i);
      [toShuffle[i], toShuffle[randIndex]] = [toShuffle[randIndex], toShuffle[i]]
    }

    // Recombine into the original queue
    const newHead = toShuffle.slice(0, this.currentTrack)
    const newTail = toShuffle.slice(this.currentTrack)
    this.musicQueue = newHead.concat(current.concat(newTail))

    this.queue(message)
  }

  /**
   * Execute primary logic
   */
  playback () {
    if (this.audioPlayer.state.status != voice.AudioPlayerStatus.Idle || this.musicQueue.length == 0) {
      return
    }
    const current = this.musicQueue[this.currentTrack]
    current.getResource()
      .then((resource) => this.audioPlayer.play(resource))
      .catch(() => {
        // Skip current track and retry if it fails
        this.currentTrack++
        this.playback()
      })
  }
}

exports.Jukebox = Jukebox