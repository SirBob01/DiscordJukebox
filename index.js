require('dotenv').config()
const discord = require('discord.js')
const { Jukebox } = require('./src/jukebox')

/**
 * Create a new Discord Client for the bot
 */
const client = new discord.Client({
  intents: [
    discord.Intents.FLAGS.GUILDS,
    discord.Intents.FLAGS.GUILD_MESSAGES,
    discord.Intents.FLAGS.GUILD_VOICE_STATES,
    discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS
  ]
})

/**
 * Find a matching command using longest common prefix
 */
const methods = Object.getOwnPropertyNames(Jukebox.prototype).filter(m => m != 'constructor' && m != 'playback')
const search = (query) => {
  for (const key of methods) {
    if (query.length > key.length) continue

    let match = true
    for (let i = 0; i < query.length; i++) {
      if (query[i] != key[i]) match = false
    }
    if (match) return key
  }
  return null
}

/**
 * On start-up, create an instance of Jukebox
 * for each guild it is a member of
 */
const instances = {}
client.once('ready', () => {
  console.log('Initializing playback instances...')
  client.guilds.cache.each((_, id) => {
    instances[id] = new Jukebox()
  })
  console.log('DiscordJukebox is online!')
})

/**
 * Handle commands
 */
client.on('messageCreate', async (message) => {
  const text = message.content.trim()

  // Must be a valid command and by a human
  if (!text.startsWith('//') || message.author.bot) {
    return
  }

  const tokens = text.split(' ')
  const command = tokens[0].slice(2)
  const params = tokens.slice(1)
  if (command == 'help') {
    const commands = {
      '//play [url]': 'Add a track to the queue',
      '//stop': 'Pause the current track',
      '//resume': 'Resume the current track',
      '//clear': 'Clear the queue',
      '//loop': 'Toggle looping the current track',
      '//loopall': 'Toggle looping the entire queue',
      '//skip': 'Skip the current track',
      '//shuffle': 'Shuffle the queue',
      '//queue': 'List all the tracks on the queue',
      '//remove [position]': 'Remove a track from the queue by position index',
      '//kick': 'Disconnect the bot from the channel'
    }
    const embed = new discord.MessageEmbed()
      .setColor('#0099ff')
      .setTitle('Command List')
      .setAuthor('Keith Randall Leonardo', 'https://avatars.githubusercontent.com/u/10874047', 'https://keithleonardo.ml')
      .setDescription('Below are the list of commands for Jukebox')
      .addFields(
        ...Object.keys(commands).map(key => {
          return {
            name: key,
            value: commands[key]
          }
        })
      )
    message.channel.send({ embeds: [embed] })
  } else {
    // Use fuzzy search to match the command to the appropriate method
    const records = instances[message.guildId]
    const match = search(command)
    if (match) {
      await records[match](message, params)
    } else {
      message.channel.send(`'${command}' is not a recognized command.`)
    }
  }
})

/**
 * Login and initialize
 */
client.login(process.env.LOGIN_KEY)
