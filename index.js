require("dotenv").config();
const discord = require("discord.js");
const voice = require("@discordjs/voice");

/** Youtube API stuff */ 
const ytdl_core = require("ytdl-core");
const ytdl = require("youtube-dl-exec");
const ytsearch = require("youtube-search-api");

/**
 * Create a new Discord Client for the bot
 */
const client = new discord.Client({intents: [
    discord.Intents.FLAGS.GUILDS, 
    discord.Intents.FLAGS.GUILD_MESSAGES,
    discord.Intents.FLAGS.GUILD_VOICE_STATES,
    discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS
]});


/**
 * Generic class that represents a single track in the queue
 */
const sources = {
    YOUTUBE : 0,
    SPOTIFY : 1,
    SOUNDCLOUD : 2
};
class Track {
    constructor(url, title, duration, source) {
        this.url = url;
        this.title = title;
        this.duration = duration;
        this.source = source;
    }
}


/**
 * Maintains the state of a music queue and manipulates audio behavior
 */
class Jukebox {
    constructor() {
        this.audioPlayer = voice.createAudioPlayer();
        this.voiceConnection = null;
        this.currentChannel = null;

        this.musicQueue = [];
        this.looping = false;

        this.audioPlayer.on('stateChange', (oldState, newState) => {
            if(oldState.status == voice.AudioPlayerStatus.Playing && newState.status == voice.AudioPlayerStatus.Idle) {
                if(!this.looping) {
                    this.musicQueue.shift();
                }
                this.playback();
            }
        });
    }

    /**
     * Clear the queue
     */
    clear(message, params) {
        this.audioPlayer.stop(true);
        this.musicQueue = [];
        message.channel.send("Queue is now empty.");
    }

    /**
     * Skip the current track
     */
    skip(message, params) {
        this.audioPlayer.stop(true);
        this.queue(message);
    }

    /**
     * Enqueue a new music track
     */
    async play(message, params) {
        if(!message.member.voice.channel) {
            message.channel.send("You must be in a voice channel to queue tracks.");
            return;
        }
        if(params.length == 0) {
            message.channel.send("Please enter a search query or URL of the track to play");
            return;
        }

        // Join whichever voice channel the sender is currently in 
        if(this.currentChannel != message.member.voice.channel) {
            this.currentChannel = message.member.voice.channel;
            if(this.voiceConnection != null) this.voiceConnection.destroy();
            this.voiceConnection = voice.joinVoiceChannel({
                channelId: this.currentChannel.id,
                guildId: this.currentChannel.guild.id,
                adapterCreator: this.currentChannel.guild.voiceAdapterCreator
            });
            this.voiceConnection.subscribe(this.audioPlayer);    
        }

        // Queue the music
        const url = params[0];
        try {
            let meta = await ytdl_core.getInfo(url);
            this.musicQueue.push(new Track(
                meta.videoDetails.video_url,
                meta.videoDetails.title,
                meta.videoDetails.lengthSeconds,
                sources.YOUTUBE
            ));
            this.queue(message);
        }
        catch(error) {
            // URL query failed, perform a manual search
            let results = await ytsearch.GetListByKeyword(params.join(' '));
            if(results.items.length > 0) {
                let meta = await ytdl_core.getInfo(`https://www.youtube.com/watch?v=${results.items[0].id}`);
                this.musicQueue.push(new Track(
                    meta.videoDetails.video_url,
                    meta.videoDetails.title,
                    meta.videoDetails.lengthSeconds,
                    sources.YOUTUBE
                ));
                this.queue(message);
            }
            else {
                message.channel.send("No matching search.");
            }
        }
        this.playback();
    }

    /**
     * Toggle looping the current track
     */
    loop(message, params) {
        if(this.musicQueue.length == 0) {
            message.channel.send(`Nothing is currently playing.`);
            return;
        }

        this.looping = !this.looping;
        if(this.looping) {
            message.channel.send(`'${this.musicQueue[0].title}' is now looping.`);
        }
        else {
            message.channel.send(`'${this.musicQueue[0].title}' is no longer looping.`);
        }
    }

    /**
     * Pause the current track
     */
    stop(message, params) {
        if(this.musicQueue.length == 0) {
            message.channel.send(`Nothing is currently playing.`);
            return;
        }
        this.audioPlayer.pause();
        message.channel.send(`'${this.musicQueue[0].title}' is paused.`);
    }

    /**
     * Resume the current track
     */
    resume(message, params) {
        if(this.musicQueue.length == 0) {
            message.channel.send(`Nothing is currently playing.`);
            return;
        }
        this.audioPlayer.unpause();
        message.channel.send(`'${this.musicQueue[0].title}' is resumed.`);
    }

    /**
     * List out all the items in the queue
     */
    queue(message, params) {
        let rows = [];
        for(let i = 0; i < this.musicQueue.length; i++) {
            let track = this.musicQueue[i];
            let minutes = Math.floor(track.duration / 60);
            let seconds = track.duration % 60;

            if(minutes < 10) minutes = `0${minutes}`;
            if(seconds < 10) seconds = `0${seconds}`;
            if(i == 0) {
                rows.push({name: `Currently playing '${track.title}'`, value: `Duration ${minutes}:${seconds}`});
            }
            else {
                rows.push({name: `${i}. ${track.title}`, value: `Duration ${minutes}:${seconds}`});
            }
        }
        const embed = new discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Record Queue')
            .setDescription(`${this.musicQueue.length} track(s) in the queue`)
            .addFields(...rows);
        message.channel.send({ embeds: [embed] });
    }

    /**
     * Remove a track from the queue by position index
     */
    remove(message, params) {
        let index = parseInt(params[0], 10);
        if(Number.isNaN(index) || index <= 0 || index > this.musicQueue.length - 1 ) {
            message.channel.send("Not a valid position");
        }
        else {
            let pos = parseInt(params[0]);
            this.musicQueue.splice(pos, 1);
            this.queue(message);
        }
    }

    /**
     * Shuffle the queue
     */
    shuffle(message, params) {
        for(let i = this.musicQueue.length-1; i > 0; i--) {
            let randIndex = Math.floor(Math.random() * i);
            [this.musicQueue[i], this.musicQueue[randIndex]] = [this.musicQueue[randIndex], this.musicQueue[i]];
        }
        this.queue(message);
    }

    /**
     * Execute primary logic
     */
    playback() {
        if(this.audioPlayer.state.status != voice.AudioPlayerStatus.Idle || this.musicQueue.length == 0) {
            return;
        }
        let current = this.musicQueue[0];
        if(current.source == sources.YOUTUBE) {
            const process = ytdl.raw(
                current.url,
                {
                    o: '-',
                    q: '',
                    f: 'bestaudio[ext=webm+acodec=opus+asr=48000]/bestaudio',
                    r: '100K',
                },
                { stdio: ['ignore', 'pipe', 'ignore'] },
            );
            const stream = process.stdout;
            if (!stream) {
                return;
            }
            process.once('spawn', async () => {
                let probe = await voice.demuxProbe(stream);
                let resource = voice.createAudioResource(probe.stream, { 
                    metadata: {
                        title: current.title,
                    }, 
                    inputType: probe.type 
                });
                this.audioPlayer.play(resource);
            });
        }
    }
}

/**
 * Find a matching command using longest common prefix
 */
const methods = Object.getOwnPropertyNames(Jukebox.prototype).filter(m => m != 'constructor' && m != 'playback');
const search = (query) => {
    for(let key of methods) {
        if(query.length > key.length) continue;

        let match = true;
        for(let i = 0; i < query.length; i++) {
            if(query[i] != key[i]) match = false; 
        }
        if(match) return key;
    }
    return null;
};

/**
 * On start-up, create an instance of Jukebox 
 * for each guild it is a member of
 */
let instances = {}
client.once('ready', () => {
    console.log("Initializing playback instances...");
    client.guilds.cache.each((_, id) => {
        instances[id] = new Jukebox();
    });
    console.log("DiscordJukebox is online!");
});

/**
 * Handle commands
 */
client.on('messageCreate', async (message) => {
    let text = message.content.trim();

    // Must be a valid command and by a human
    if(!text.startsWith('//') || message.author.bot) {
        return;
    }

    let tokens = text.split(' ');
    const command = tokens[0].slice(2);
    const params = tokens.slice(1);
    if(command == 'help') {
        let commands = {
            '//play [url]': 'Add a track to the queue',
            '//stop': 'Pause the current track',
            '//resume': 'Resume the current track',
            '//clear': 'Clear the queue',
            '//loop': 'Toggle looping the current track',
            '//skip': 'Skip the current track',
            '//shuffle': 'Shuffle the queue',
            '//queue': 'List all the tracks on the queue',
            '//remove [position]': 'Remove a track from the queue by position index'
        };
        const embed = new discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Command List')
            .setAuthor('Keith Randall Leonardo', 'https://avatars.githubusercontent.com/u/10874047', 'https://keithleonardo.ml')
            .setDescription('Below are the list of commands for Jukebox')
            .addFields(
                ... Object.keys(commands).map(key => {
                    return {
                        name: key,
                        value: commands[key]
                    };
                })
            );
        message.channel.send({ embeds: [embed] });
    }
    else {
        // Use fuzzy search to match the command to the appropriate method
        let records = instances[message.guildId];
        let match = search(command);
        if(match) {
            await records[match](message, params);
        }
        else {
            message.channel.send(`'${command}' is not a recognized command.`);
        }
    }
});

/**
 * Login and initialize
 */
client.login(process.env.LOGIN_KEY);